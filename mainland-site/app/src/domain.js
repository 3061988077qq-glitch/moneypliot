export const DIRECTIONS = ["expense", "income", "transfer"];

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "餐饮", direction: "expense", icon: "utensils", color: "#f97316", keywords: ["餐饮", "饭", "早餐", "午餐", "晚餐", "咖啡", "奶茶", "外卖", "食堂"] },
  { id: "transport", name: "交通", direction: "expense", icon: "tram", color: "#0ea5e9", keywords: ["地铁", "公交", "打车", "停车", "加油", "高铁"] },
  { id: "shopping", name: "购物", direction: "expense", icon: "bag", color: "#a855f7", keywords: ["淘宝", "京东", "拼多多", "商场", "超市"] },
  { id: "housing", name: "居住", direction: "expense", icon: "home", color: "#22c55e", keywords: ["房租", "物业", "水费", "电费", "燃气"] },
  { id: "health", name: "医疗健康", direction: "expense", icon: "health", color: "#ef4444", keywords: ["医院", "药", "体检", "门诊"] },
  { id: "salary", name: "工资", direction: "income", icon: "money", color: "#16a34a", keywords: ["工资", "薪资", "奖金", "报销"] },
  { id: "investment", name: "投资收益", direction: "income", icon: "chart", color: "#2563eb", keywords: ["分红", "利息", "基金", "股票"] }
];

export function nowISO() {
  return new Date().toISOString();
}

export function uid(prefix = "txn") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function moneyToCents(value) {
  const normalized = String(value ?? "")
    .replace(/[¥￥,\s元]/g, "")
    .replace(/^\+/, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`金额格式无效：${value}`);
  return Math.round(Math.abs(number) * 100);
}

export function centsToMoney(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function formatCNY(cents) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(centsToMoney(cents));
}

export function parseQuickTransaction(text, date = new Date()) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("请输入要记录的账单文本。");
  const amountMatch = raw.match(/[¥￥]?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/);
  if (!amountMatch) throw new Error("没有识别到金额。");

  const amountCents = moneyToCents(amountMatch[0]);
  const direction = inferDirection(raw);
  const paymentMethod = inferPaymentMethod(raw);
  const title = cleanTitle(raw.replace(amountMatch[0], ""));

  return createTransaction({
    title: title || "快捷记账",
    amountCents,
    direction,
    occurredAt: date.toISOString(),
    merchantName: title || undefined,
    counterparty: undefined,
    paymentMethod,
    source: "shortcut",
    rawPayload: raw
  });
}

export function createTransaction(draft, categories = DEFAULT_CATEGORIES, rules = []) {
  const occurredAt = draft.occurredAt ? new Date(draft.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("交易日期无效。");
  const amountCents = draft.amountCents ?? moneyToCents(draft.amount ?? 0);
  if (amountCents <= 0) throw new Error("金额必须大于 0。");
  const direction = DIRECTIONS.includes(draft.direction) ? draft.direction : "expense";
  const partial = {
    id: draft.id || uid(),
    title: String(draft.title || "未命名账单").trim(),
    amountCents,
    direction,
    occurredAt: occurredAt.toISOString(),
    importedAt: draft.importedAt || nowISO(),
    merchantName: blankToUndefined(draft.merchantName),
    counterparty: blankToUndefined(draft.counterparty),
    categoryId: blankToUndefined(draft.categoryId),
    accountId: blankToUndefined(draft.accountId),
    paymentMethod: blankToUndefined(draft.paymentMethod),
    source: draft.source || "manual",
    categoryAssignmentSource: draft.categoryAssignmentSource || "unknown",
    sourceRecordId: blankToUndefined(draft.sourceRecordId),
    importFingerprint: draft.importFingerprint || makeFingerprint(draft),
    notes: blankToUndefined(draft.notes),
    tags: Array.isArray(draft.tags) ? draft.tags : []
  };

  if (!partial.categoryId) {
    const category = inferCategory(partial, categories, rules);
    partial.categoryId = category?.id;
    partial.categoryAssignmentSource = category?.source || "unknown";
  }

  return partial;
}

export function updateTransaction(transactions, id, patch, categories = DEFAULT_CATEGORIES, rules = []) {
  return transactions.map((transaction) => {
    if (transaction.id !== id) return transaction;
    const next = { ...transaction, ...patch };
    if (patch.amount !== undefined) next.amountCents = moneyToCents(patch.amount);
    if (patch.amountCents !== undefined) next.amountCents = moneyToCents(centsToMoney(patch.amountCents));
    if (patch.categoryId !== undefined) next.categoryAssignmentSource = "manual";
    if (patch.occurredAt) next.occurredAt = new Date(patch.occurredAt).toISOString();
    if (!next.categoryId) {
      const category = inferCategory(next, categories, rules);
      next.categoryId = category?.id;
      next.categoryAssignmentSource = category?.source || "unknown";
    }
    next.importFingerprint = makeFingerprint(next);
    return next;
  });
}

export function deleteTransactions(transactions, ids) {
  const selected = new Set(Array.isArray(ids) ? ids : [ids]);
  return transactions.filter((transaction) => !selected.has(transaction.id));
}

export function mergeTransactions(existing, incoming) {
  const seen = new Set(existing.map((item) => item.importFingerprint));
  const added = [];
  const skipped = [];
  for (const item of incoming) {
    if (seen.has(item.importFingerprint)) {
      skipped.push(item);
      continue;
    }
    seen.add(item.importFingerprint);
    added.push(item);
  }
  return { transactions: [...added, ...existing], added, skipped };
}

export function inferCategory(transaction, categories = DEFAULT_CATEGORIES, rules = []) {
  const haystack = [
    transaction.title,
    transaction.merchantName,
    transaction.counterparty,
    transaction.notes,
    transaction.paymentMethod
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const learned = rules.find((rule) =>
    rule.direction === transaction.direction &&
    rule.keyword &&
    haystack.includes(rule.keyword.toLowerCase())
  );
  if (learned) return { ...categories.find((category) => category.id === learned.categoryId), source: "learnedRule" };

  const category = categories.find((item) =>
    item.direction === transaction.direction &&
    item.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  );
  return category ? { ...category, source: "automatic" } : undefined;
}

export function learnCategoryRule(transaction, categoryId) {
  const keyword = [transaction.merchantName, transaction.counterparty, transaction.title]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];
  if (!keyword) return null;
  return { id: uid("rule"), keyword, categoryId, direction: transaction.direction, createdAt: nowISO() };
}

export function queryTransactions(transactions, filters = {}) {
  let result = [...transactions];
  if (filters.direction) result = result.filter((item) => item.direction === filters.direction);
  if (filters.categoryId) result = result.filter((item) => item.categoryId === filters.categoryId);
  if (filters.source) result = result.filter((item) => item.source === filters.source);
  if (filters.from) result = result.filter((item) => new Date(item.occurredAt) >= new Date(filters.from));
  if (filters.to) result = result.filter((item) => new Date(item.occurredAt) <= new Date(filters.to));
  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }
  return result.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

export function dateRangeForPreset(preset, base = new Date()) {
  const start = new Date(base);
  const end = new Date(base);
  if (preset === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (preset === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    return {};
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

export function summarize(transactions, categories = DEFAULT_CATEGORIES, base = new Date()) {
  const today = queryTransactions(transactions, dateRangeForPreset("today", base));
  const month = queryTransactions(transactions, dateRangeForPreset("month", base));
  return {
    todayExpense: total(today, "expense"),
    todayIncome: total(today, "income"),
    monthExpense: total(month, "expense"),
    monthIncome: total(month, "income"),
    net: total(month, "income") - total(month, "expense"),
    categoryBreakdown: breakdownBy(month, "categoryId", categories),
    sourceBreakdown: breakdownBy(month, "source"),
    recent: queryTransactions(transactions).slice(0, 8)
  };
}

export function monthlyBills(transactions, categories = DEFAULT_CATEGORIES) {
  const groups = new Map();
  for (const item of transactions) {
    const date = new Date(item.occurredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, items]) => ({
      month,
      income: total(items, "income"),
      expense: total(items, "expense"),
      net: total(items, "income") - total(items, "expense"),
      count: items.length,
      categories: breakdownBy(items, "categoryId", categories),
      sources: breakdownBy(items, "source"),
      transactions: queryTransactions(items)
    }));
}

export function exportLedger(transactions, options = {}) {
  const hidden = Boolean(options.hideNames);
  const rows = queryTransactions(transactions).map((item) => ({
    时间: item.occurredAt.slice(0, 19).replace("T", " "),
    类型: directionLabel(item.direction),
    标题: hidden ? "已隐藏" : item.title,
    金额: centsToMoney(item.amountCents).toFixed(2),
    分类: item.categoryId || "",
    来源: item.source || "",
    商户: hidden ? "" : item.merchantName || "",
    交易对方: hidden ? "" : item.counterparty || "",
    支付方式: item.paymentMethod || "",
    备注: hidden ? "" : item.notes || ""
  }));
  return {
    json: JSON.stringify({ exportedAt: nowISO(), count: rows.length, rows }, null, 2),
    csv: toCSV(rows)
  };
}

export function detectInsights(transactions) {
  const bills = monthlyBills(transactions);
  const latest = bills[0];
  const subscriptions = detectSubscriptions(transactions);
  const anomalies = latest
    ? latest.categories.filter((item) => item.total > 50000).map((item) => `${item.name} 本月支出较高：${formatCNY(item.total)}`)
    : [];
  return { subscriptions, anomalies };
}

export function directionLabel(direction) {
  return { expense: "支出", income: "收入", transfer: "转账" }[direction] || "支出";
}

export function categoryName(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.name || "未分类";
}

function detectSubscriptions(transactions) {
  const grouped = new Map();
  for (const item of transactions.filter((txn) => txn.direction === "expense")) {
    const key = `${item.title}-${item.amountCents}`;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return [...grouped.values()]
    .filter((items) => items.length >= 2)
    .map((items) => `${items[0].title} 可能是固定支出：${formatCNY(items[0].amountCents)}`);
}

function total(transactions, direction) {
  return transactions
    .filter((item) => !direction || item.direction === direction)
    .reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
}

function breakdownBy(transactions, key, categories = []) {
  const groups = new Map();
  for (const item of transactions) {
    const id = item[key] || "unknown";
    const label = key === "categoryId" ? categoryName(categories, id) : sourceLabel(id);
    const current = groups.get(id) || { id, name: label, total: 0, income: 0, expense: 0, count: 0 };
    current.count += 1;
    current.total += item.amountCents;
    current[item.direction] = (current[item.direction] || 0) + item.amountCents;
    groups.set(id, current);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
}

function inferDirection(text) {
  const lowered = text.toLowerCase();
  if (["收入", "收款", "入账", "工资", "奖金", "refund", "income"].some((word) => lowered.includes(word))) return "income";
  if (["转账", "transfer"].some((word) => lowered.includes(word))) return "transfer";
  return "expense";
}

function inferPaymentMethod(text) {
  const lowered = text.toLowerCase();
  if (lowered.includes("微信") || lowered.includes("wechat")) return "微信支付";
  if (lowered.includes("支付宝") || lowered.includes("alipay")) return "支付宝";
  if (lowered.includes("apple pay") || lowered.includes("applepay")) return "Apple Pay";
  if (lowered.includes("银行卡") || lowered.includes("银行")) return "银行卡";
  return undefined;
}

function cleanTitle(value) {
  const noise = ["支出", "消费", "付款", "收入", "收款", "入账", "转账", "微信支付", "微信", "支付宝", "Apple Pay", "银行卡"];
  return noise.reduce((text, word) => text.replaceAll(word, ""), value).replace(/\s+/g, " ").trim();
}

function blankToUndefined(value) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function sourceLabel(source) {
  return {
    shortcut: "快捷记账",
    bankStatement: "银行账单",
    weChat: "微信账单",
    notificationSummary: "通知摘要",
    sms: "短信",
    manual: "手动录入",
    openBanking: "开放银行",
    unknown: "未标记"
  }[source] || source;
}

function makeFingerprint(draft) {
  return [
    new Date(draft.occurredAt || Date.now()).toISOString().slice(0, 19),
    draft.direction || "expense",
    draft.amountCents ?? draft.amount ?? 0,
    draft.title || "",
    draft.sourceRecordId || "",
    draft.source || "manual"
  ].join("|");
}
