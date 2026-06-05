import { DEFAULT_CATEGORIES } from "./domain.js";

const STORAGE_KEY = "money-pilot-web-state-v1";
const DB_NAME = "money-pilot-web-local-ledger";
const DB_VERSION = 1;
const DB_STORE = "ledger";
const DB_STATE_ID = "current-state";
const BACKUP_FORMAT = "money-pilot-web-backup";
const BACKUP_VERSION = 1;

export function loadState() {
  return loadCachedState();
}

export function saveState(state) {
  const next = withSavedAt(state);
  if (state && typeof state === "object") Object.assign(state, next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  queuePersistentSave(next);
}

export async function loadPersistentState() {
  const cached = loadCachedState();
  const durable = await readStateFromIndexedDB();
  if (durable && isNewer(durable, cached)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
    return durable;
  }
  await saveStateToIndexedDB(cached);
  return cached;
}

export function exportBackup(state) {
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: normalizeState(state)
  };
  return JSON.stringify(backup, null, 2);
}

export async function restoreBackupFile(file) {
  if (!file) throw new Error("请选择 MoneyPilot 备份文件。");
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }
  return restoreBackup(parsed);
}

export function restoreBackup(backup) {
  if (backup?.format !== BACKUP_FORMAT || !backup.state) {
    throw new Error("这不是 MoneyPilot Web 的完整备份文件。");
  }
  return normalizeState(backup.state);
}

export function defaultState() {
  return {
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    rules: [],
    selectedIds: [],
    meta: {
      savedAt: new Date(0).toISOString(),
      storageBackend: "localStorage+IndexedDB"
    },
    settings: {
      hideNamesOnExport: false,
      monthlyBudgetCents: 600000
    }
  };
}

function normalizeState(value) {
  const base = defaultState();
  const source = value && typeof value === "object" ? value : {};
  return {
    ...base,
    ...source,
    transactions: Array.isArray(source.transactions) ? source.transactions : base.transactions,
    categories: Array.isArray(source.categories) && source.categories.length ? source.categories : base.categories,
    rules: Array.isArray(source.rules) ? source.rules : base.rules,
    selectedIds: Array.isArray(source.selectedIds) ? source.selectedIds : [],
    meta: {
      ...base.meta,
      ...(source.meta && typeof source.meta === "object" ? source.meta : {})
    },
    settings: {
      ...base.settings,
      ...(source.settings && typeof source.settings === "object" ? source.settings : {})
    }
  };
}

function loadCachedState() {
  if (!globalThis.localStorage) return defaultState();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return normalizeState(stored);
  } catch {
    return defaultState();
  }
}

function withSavedAt(state) {
  return normalizeState({
    ...state,
    meta: {
      ...(state?.meta || {}),
      savedAt: new Date().toISOString(),
      storageBackend: "localStorage+IndexedDB"
    }
  });
}

function isNewer(candidate, current) {
  return Date.parse(candidate?.meta?.savedAt || 0) > Date.parse(current?.meta?.savedAt || 0);
}

function queuePersistentSave(state) {
  saveStateToIndexedDB(state).catch(() => {});
}

async function saveStateToIndexedDB(state) {
  if (!globalThis.indexedDB) return false;
  const db = await openLedgerDB();
  await txRequest(db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(withSavedAt(state), DB_STATE_ID));
  db.close();
  return true;
}

async function readStateFromIndexedDB() {
  if (!globalThis.indexedDB) return null;
  const db = await openLedgerDB();
  const stored = await txRequest(db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_STATE_ID));
  db.close();
  return stored ? normalizeState(stored) : null;
}

function openLedgerDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败。"));
  });
}

function txRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 写入失败。"));
  });
}
