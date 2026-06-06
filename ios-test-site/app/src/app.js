import {
  DEFAULT_CATEGORIES,
  categoryName,
  centsToMoney,
  createTransaction,
  dateRangeForPreset,
  deleteTransactions,
  detectInsights,
  directionLabel,
  exportLedger,
  formatCNY,
  learnCategoryRule,
  mergeTransactions,
  monthlyBills,
  parseQuickTransaction,
  queryTransactions,
  summarize,
  updateTransaction
} from "./domain.js";
import { importFile } from "./importers.js";
import { exportBackup, loadPersistentState, loadState, restoreBackupFile, saveState } from "./storage.js";

const APP_VERSION = "2026.06.06.2";
const app = document.querySelector("#app");
const state = loadState();
const ui = {
  tab: "dashboard",
  detail: null,
  search: "",
  importMessage: "",
  importError: "",
  backupMessage: "",
  backupError: "",
  editingId: null,
  selectedMonth: null,
  introOpen: false,
  pwaStatus: {
    installed: isStandalone(),
    offlineReady: false,
    online: navigator.onLine,
    storagePersisted: false,
    durableLedgerReady: false,
    appVersion: APP_VERSION,
    updateAvailable: false,
    checkingUpdate: false
  }
};
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let reloadingForUpdate = false;
let swipeGesture = null;

function setState(patch) {
  Object.assign(state, patch);
  saveState(state);
  render();
}

function setUI(patch) {
  Object.assign(ui, patch);
  render();
}

function render() {
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${icon("pilot")}</div>
        <div>
          <strong>MoneyPilot</strong>
          <span>本地账本</span>
        </div>
      </div>
      <nav class="nav">${navButton("dashboard", "仪表盘", "sparkle")}${navButton("transactions", "流水", "tail")}${navButton("import", "导入", "basket")}${navButton("bills", "账单", "book")}${navButton("more", "更多", "flower")}</nav>
      <button class="install-card" data-action="show-install">${icon("phone")}<span>${installCardText()}</span></button>
    </aside>
    <main class="workspace">${route()}</main>
    ${editDrawer()}
    ${introSheet()}
  `;
}

function navButton(tab, label, iconName) {
  return `<button class="nav-item ${ui.tab === tab ? "active" : ""}" data-tab="${tab}">${icon(iconName)}<span>${label}</span></button>`;
}

function route() {
  if (ui.tab === "transactions") return transactionsScreen();
  if (ui.tab === "import") return importScreen();
  if (ui.tab === "bills") return billsScreen();
  if (ui.tab === "more") return moreScreen();
  if (ui.detail) return detailScreen(ui.detail);
  return dashboardScreen();
}

function dashboardScreen() {
  const summary = summarize(state.transactions, state.categories);
  const insights = detectInsights(state.transactions);
  return `
    <section class="intro-hero">
      <div class="intro-copy">
        <div class="intro-brand">
          <span class="intro-mark">${icon("pilot")}</span>
          <span>MoneyPilot</span>
        </div>
        <h1>清爽的本地账本</h1>
        <p>记录、导入和整理日常流水。数据保存在你的设备里，安装到主屏幕后也能像 App 一样打开。</p>
        <div class="intro-actions">
          <button class="primary" data-action="open-new">${icon("plus")}记一笔</button>
          <button class="secondary" data-action="show-install">${icon("phone")}查看简介</button>
        </div>
      </div>
      <div class="intro-points" aria-label="MoneyPilot 特性">
        ${introPoint("本机账本", "流水和备份都由你掌握", "shield")}
        ${introPoint("离线可用", "缓存完成后断网也能记账", "phone")}
        ${introPoint("干净导入", "识别结果优先，隐藏异常原文", "basket")}
      </div>
    </section>
    <section class="card-grid">
      ${metricCard("today", "今日账本", formatCNY(summary.todayExpense), "查看今天的收入与支出", "calendar")}
      ${metricCard("month-income", "本月收入", formatCNY(summary.monthIncome), "按时间列出收入", "income")}
      ${metricCard("month-expense", "本月支出", formatCNY(summary.monthExpense), "按时间列出支出", "expense")}
      ${metricCard("recent", "最近交易", `${summary.recent.length} 笔`, "按时间降序查看", "clock")}
    </section>
    <section class="dashboard-layout">
      <article class="panel">
        <div class="panel-head"><h2>本月分类</h2><span>${formatCNY(summary.monthExpense)} 支出</span></div>
        <div class="bars">${summary.categoryBreakdown.length ? summary.categoryBreakdown.map((item) => barRow(item.name, item.expense || item.total, Math.max(summary.monthExpense, 1))).join("") : empty("暂无分类数据")}</div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>近期提醒</h2><span>自动分析</span></div>
        <div class="notice-list">
          ${[...insights.subscriptions, ...insights.anomalies].slice(0, 5).map((text) => `<div class="notice">${icon("sparkle")}<span>${escapeHTML(text)}</span></div>`).join("") || empty("数据多一点后会显示固定支出和异常提醒")}
        </div>
      </article>
    </section>
  `;
}

function introPoint(title, body, iconName) {
  return `
    <div class="intro-point">
      <span>${icon(iconName)}</span>
      <strong>${title}</strong>
      <small>${body}</small>
    </div>
  `;
}

function metricCard(detail, title, value, subtitle, iconName) {
  return `
    <button class="metric-card" data-detail="${detail}">
      <div class="metric-icon">${icon(iconName)}</div>
      <span>${title}</span>
      <strong>${value}</strong>
      <small>${subtitle}</small>
    </button>
  `;
}

function detailScreen(detail) {
  const configs = {
    today: { title: "今日账本", subtitle: "只显示今天发生的账单", filters: dateRangeForPreset("today") },
    "month-income": { title: "本月收入", subtitle: "本月每一笔收入", filters: { ...dateRangeForPreset("month"), direction: "income" } },
    "month-expense": { title: "本月支出", subtitle: "本月每一笔支出", filters: { ...dateRangeForPreset("month"), direction: "expense" } },
    recent: { title: "最近交易", subtitle: "按时间降序排列", filters: {} }
  };
  const config = configs[detail] || configs.recent;
  const rows = queryTransactions(state.transactions, config.filters);
  return `
    <section class="topbar">
      <button class="ghost" data-action="back-dashboard">${icon("back")}返回</button>
      <div>
        <p class="eyebrow">${config.subtitle}</p>
        <h1>${config.title}</h1>
      </div>
    </section>
    ${transactionList(rows, { compact: false })}
  `;
}

function transactionsScreen() {
  const rows = queryTransactions(state.transactions, { search: ui.search });
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">流水管理</p>
        <h1>录入、修正、删除每一笔账单</h1>
      </div>
      <button class="primary" data-action="open-new">${icon("plus")}新增</button>
    </section>
    <section class="toolbar">
      <label class="search">${icon("search")}<input data-field="search" value="${escapeAttr(ui.search)}" placeholder="搜索标题、来源、商户" /></label>
      <button class="danger" data-action="delete-selected" ${state.selectedIds.length ? "" : "disabled"}>${icon("trash")}删除已选 ${state.selectedIds.length || ""}</button>
    </section>
    ${transactionList(rows, { selectable: true })}
  `;
}

function importScreen() {
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">导入中心</p>
        <h1>导入微信、银行或快捷账单</h1>
      </div>
    </section>
    <section class="import-grid">
      <article class="panel upload-panel">
        <div class="upload-art">${icon("basket")}</div>
        <h2>选择账单文件</h2>
        <p>支持 CSV、TXT、HTML/XLS、XLSX 和可抽取文本的 PDF。导入后只显示识别结果，不展示乱码原文。</p>
        <input id="file-input" type="file" accept=".csv,.txt,.xls,.xlsx,.pdf,text/csv,application/pdf" hidden />
        <button class="primary" data-action="pick-file">${icon("upload")}选择文件</button>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>快捷文本</h2><span>一句话记账</span></div>
        <form data-form="quick">
          <input name="quick" placeholder="例：午餐 45 微信支付" />
          <button class="primary" type="submit">${icon("plus")}记入账本</button>
        </form>
        ${ui.importMessage ? `<div class="toast success">${escapeHTML(ui.importMessage)}</div>` : ""}
        ${ui.importError ? `<div class="toast error">${escapeHTML(ui.importError)}</div>` : ""}
      </article>
    </section>
  `;
}

function billsScreen() {
  const bills = monthlyBills(state.transactions, state.categories);
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">月度账单</p>
        <h1>按月查看净额</h1>
      </div>
    </section>
    <section class="bill-layout bill-layout-summary">
      <div class="bill-list bill-summary-list">${bills.map((bill) => {
        const open = ui.selectedMonth === bill.month;
        return `
          <article class="bill-group ${open ? "open" : ""}">
            <button class="bill-item ${open ? "active" : ""}" data-month="${escapeAttr(bill.month)}" aria-expanded="${open}">
              <span class="bill-month">
                <strong>${bill.month}</strong>
                <small>${bill.count} 笔流水</small>
              </span>
              <span class="bill-net ${bill.net >= 0 ? "income" : "expense"}">
                <small>净额</small>
                <strong>${formatCNY(bill.net)}</strong>
              </span>
              <span class="bill-chevron">${icon("chevron")}</span>
            </button>
            ${open ? `
              <div class="bill-detail">
                <div class="mini-metrics">
                  <div><span>收入</span><strong>${formatCNY(bill.income)}</strong></div>
                  <div><span>支出</span><strong>${formatCNY(bill.expense)}</strong></div>
                  <div><span>结余</span><strong>${formatCNY(bill.net)}</strong></div>
                </div>
                <div class="bars">${bill.categories.map((item) => barRow(item.name, item.expense || item.total, Math.max(bill.expense, 1))).join("") || empty("暂无分类统计")}</div>
                ${transactionList(bill.transactions, { compact: true })}
              </div>
            ` : ""}
          </article>
        `;
      }).join("") || empty("暂无月度账单")}</div>
    </section>
  `;
}

function moreScreen() {
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">更多</p>
        <h1>分类、导出与本地设置</h1>
      </div>
    </section>
    <section class="more-grid">
      <article class="panel">
        <div class="panel-head"><h2>分类校准</h2><span>${state.categories.length} 个分类</span></div>
        <div class="category-list">${state.categories.map((category) => `
          <div class="category-row">
            <span class="dot" style="--dot:${category.color}"></span>
            <strong>${category.name}</strong>
            <small>${directionLabel(category.direction)}</small>
          </div>
        `).join("")}</div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>导出账本</h2><span>JSON / CSV</span></div>
        <label class="check-row"><input type="checkbox" data-setting="hideNamesOnExport" ${state.settings.hideNamesOnExport ? "checked" : ""} />导出时隐藏标题、商户和备注</label>
        <div class="button-row">
          <button class="secondary" data-action="export-backup">${icon("download")}导出完整备份</button>
          <button class="secondary" data-action="export-csv">${icon("download")}导出表格</button>
        </div>
        <input id="backup-input" type="file" accept=".json,application/json" hidden />
        <div class="button-row backup-actions">
          <button class="secondary" data-action="pick-backup">${icon("upload")}恢复完整备份</button>
        </div>
        ${ui.backupMessage ? `<div class="toast success">${escapeHTML(ui.backupMessage)}</div>` : ""}
        ${ui.backupError ? `<div class="toast error">${escapeHTML(ui.backupError)}</div>` : ""}
        <p class="soft-text">完整备份包含流水、分类、学习规则和设置，只保存在你手里，适合在 iPhone 上定期导出到“文件”。</p>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>本地安装</h2><span>Safari</span></div>
        ${installStatusCard()}
      </article>
    </section>
  `;
}

function installCardText() {
  if (ui.pwaStatus.installed && ui.pwaStatus.offlineReady) return "已安装，可离线使用";
  if (ui.pwaStatus.offlineReady) return "已缓存，可添加到主屏幕";
  return "查看简介与安装方式";
}

function installStatusCard() {
  const rows = [
    ["安装状态", ui.pwaStatus.installed ? "已从主屏幕启动" : "可添加到主屏幕"],
    ["离线缓存", ui.pwaStatus.offlineReady ? "已准备好" : "正在准备"],
    ["网络状态", ui.pwaStatus.online ? "在线" : "离线"],
    ["本地账本", ui.pwaStatus.durableLedgerReady ? "IndexedDB 已启用" : "快速缓存已启用"],
    ["系统持久化", ui.pwaStatus.storagePersisted ? "已请求持久保存" : "由 iOS 管理"],
    ["应用版本", ui.pwaStatus.appVersion],
    ["更新状态", updateStatusText()]
  ];
  return `
    <div class="status-list">${rows.map(([label, value]) => `
      <div class="status-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("")}</div>
    <p class="soft-text">在 iPhone Safari 打开 HTTPS 网址，点分享按钮，选择“添加到主屏幕”。安装后数据保存在 iPhone 本机，打开过一次并完成缓存后，断网也能启动和记账。</p>
    <div class="button-row">
      <button class="secondary" data-action="show-install">${icon("phone")}查看安装方式</button>
      <button class="secondary" data-action="check-update">${icon("refresh")}检查更新</button>
      ${ui.pwaStatus.updateAvailable ? `<button class="primary" data-action="reload-update">${icon("refresh")}立即更新</button>` : ""}
    </div>
  `;
}

function updateStatusText() {
  if (ui.pwaStatus.updateAvailable) return "新版本已就绪";
  if (ui.pwaStatus.checkingUpdate) return "正在检查";
  return ui.pwaStatus.offlineReady ? "已是当前缓存" : "等待缓存";
}

function transactionList(rows, options = {}) {
  return `
    <section class="transaction-list ${options.compact ? "compact" : ""}">
      ${rows.length ? rows.map((item) => transactionRow(item, options)).join("") : empty("暂无账单")}
    </section>
  `;
}

function transactionRow(item, options) {
  const selected = state.selectedIds.includes(item.id);
  const title = displayText(item.title, "未命名账单");
  const payment = displayText(item.paymentMethod || item.source || "手动", "手动");
  const classes = ["transaction-row", options.selectable ? "selectable" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  const row = `
    <article class="${classes}" data-swipe-foreground>
      ${options.selectable ? `<input type="checkbox" data-select="${item.id}" ${selected ? "checked" : ""} />` : ""}
      <button class="transaction-main" data-edit="${item.id}">
        <span class="category-badge">${categoryName(state.categories, item.categoryId)}</span>
        <strong>${escapeHTML(title)}</strong>
        <small>${formatDate(item.occurredAt)} · ${directionLabel(item.direction)} · ${escapeHTML(payment)}</small>
      </button>
      <button class="amount ${item.direction}" data-edit="${item.id}">${item.direction === "income" ? "+" : "-"}${formatCNY(item.amountCents)}</button>
    </article>
  `;
  if (!options.selectable) return row;
  return `
    <article class="transaction-swipe" data-swipe-row data-id="${item.id}">
      <button class="quick-delete" type="button" data-action="quick-delete" data-id="${item.id}">${icon("trash")}删除</button>
      ${row}
    </article>
  `;
}

function editDrawer() {
  if (ui.editingId === null) return "";
  const item = state.transactions.find((transaction) => transaction.id === ui.editingId);
  const model = item || { title: "", amountCents: 0, direction: "expense", occurredAt: new Date().toISOString(), source: "manual", paymentMethod: "", categoryId: "" };
  return `
    <div class="drawer-backdrop" data-action="close-editor"></div>
    <aside class="drawer">
      <form data-form="edit">
        <div class="panel-head"><h2>${item ? "修改账单" : "新增账单"}</h2><button class="icon-button" type="button" data-action="close-editor">${icon("close")}</button></div>
        <label>标题<input name="title" value="${escapeAttr(model.title)}" required /></label>
        <label>金额<input name="amount" type="number" step="0.01" min="0.01" value="${centsToMoney(model.amountCents || 0)}" required /></label>
        <label>类型<select name="direction">${option("expense", "支出", model.direction)}${option("income", "收入", model.direction)}${option("transfer", "转账", model.direction)}</select></label>
        <label>分类<select name="categoryId"><option value="">自动判断</option>${state.categories.map((category) => option(category.id, category.name, model.categoryId)).join("")}</select></label>
        <label>来源<select name="source">${["manual", "weChat", "bankStatement", "shortcut", "sms", "notificationSummary"].map((source) => option(source, sourceText(source), model.source)).join("")}</select></label>
        <label>支付方式<input name="paymentMethod" value="${escapeAttr(model.paymentMethod || "")}" /></label>
        <label>交易对方<input name="counterparty" value="${escapeAttr(model.counterparty || "")}" /></label>
        <label>日期时间<input name="occurredAt" type="datetime-local" value="${toLocalInputValue(model.occurredAt)}" /></label>
        <label>备注<textarea name="notes">${escapeHTML(model.notes || "")}</textarea></label>
        <div class="button-row">
          <button class="primary" type="submit">${icon("save")}保存</button>
          ${item ? `<button class="danger" type="button" data-action="delete-one" data-id="${item.id}">${icon("trash")}删除</button>` : ""}
        </div>
      </form>
    </aside>
  `;
}

function option(value, label, current) {
  return `<option value="${escapeAttr(value)}" ${value === current ? "selected" : ""}>${escapeHTML(label)}</option>`;
}

function barRow(label, amount, max) {
  const percent = Math.max(4, Math.round((amount / max) * 100));
  return `<div class="bar-row"><span>${escapeHTML(displayText(label, "未分类"))}</span><div><i style="width:${percent}%"></i></div><strong>${formatCNY(amount)}</strong></div>`;
}

function empty(text) {
  return `<div class="empty">${icon("flower")}<span>${escapeHTML(displayText(text, "暂无内容"))}</span></div>`;
}

function introSheet() {
  if (!ui.introOpen) return "";
  return `
    <div class="drawer-backdrop intro-backdrop" data-action="close-intro"></div>
    <section class="intro-sheet" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <button class="icon-button intro-close" type="button" data-action="close-intro">${icon("close")}</button>
      <div class="intro-sheet-head">
        <span class="intro-sheet-mark">${icon("pilot")}</span>
        <div>
          <h2 id="intro-title">MoneyPilot 简介</h2>
          <p>一个专注本地保存、快速记录和账单导入的轻量账本。</p>
        </div>
      </div>
      <div class="intro-sheet-grid">
        ${introStep("1", "打开网址", "用 iPhone Safari 打开已发布的 MoneyPilot 地址。")}
        ${introStep("2", "添加到主屏幕", "点分享按钮，选择“添加到主屏幕”。")}
        ${introStep("3", "开始记账", "从桌面图标打开，数据保存在本机，可导出完整备份。")}
      </div>
      <div class="intro-note">
        <strong>隐私提示</strong>
        <span>MoneyPilot 不需要后台服务器保存你的账本。导入文件只在当前设备解析，界面会尽量隐藏无法识别的异常字符。</span>
      </div>
      <div class="button-row">
        ${deferredInstallPrompt ? `<button class="primary" data-action="prompt-install">${icon("download")}安装到此设备</button>` : ""}
        <button class="secondary" data-action="close-intro">${icon("save")}知道了</button>
      </div>
    </section>
  `;
}

function introStep(number, title, body) {
  return `
    <div class="intro-step">
      <span>${number}</span>
      <strong>${title}</strong>
      <small>${body}</small>
    </div>
  `;
}

function handleClick(event) {
  const tab = event.target.closest("[data-tab]")?.dataset.tab;
  if (tab) return setUI({ tab, detail: null });
  const detail = event.target.closest("[data-detail]")?.dataset.detail;
  if (detail) return setUI({ detail });
  const edit = event.target.closest("[data-edit]")?.dataset.edit;
  if (edit) return setUI({ editingId: edit });
  const month = event.target.closest("[data-month]")?.dataset.month;
  if (month) return setUI({ selectedMonth: ui.selectedMonth === month ? null : month });

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "back-dashboard") setUI({ detail: null });
  if (action === "open-new") setUI({ editingId: "" });
  if (action === "close-editor") setUI({ editingId: null });
  if (action === "pick-file") document.querySelector("#file-input")?.click();
  if (action === "delete-selected") deleteSelected();
  if (action === "delete-one") deleteOne(event.target.closest("[data-id]").dataset.id);
  if (action === "quick-delete") deleteOne(event.target.closest("[data-id]").dataset.id);
  if (action === "export-backup") downloadBackup();
  if (action === "export-csv") downloadExport("csv");
  if (action === "pick-backup") document.querySelector("#backup-input")?.click();
  if (action === "show-install") showInstallInstructions();
  if (action === "close-intro") setUI({ introOpen: false });
  if (action === "prompt-install") promptNativeInstall();
  if (action === "check-update") checkForAppUpdate();
  if (action === "reload-update") activateAppUpdate();
}

function handleInput(event) {
  if (event.target.dataset.field === "search") setUI({ search: event.target.value });
  if (event.target.dataset.setting === "hideNamesOnExport") {
    setState({ settings: { ...state.settings, hideNamesOnExport: event.target.checked } });
  }
  if (event.target.dataset.select) {
    const id = event.target.dataset.select;
    const selectedIds = event.target.checked
      ? [...new Set([...state.selectedIds, id])]
      : state.selectedIds.filter((selected) => selected !== id);
    setState({ selectedIds });
  }
}

async function handleChange(event) {
  if (event.target.id === "backup-input") return restoreBackupFromInput(event);
  if (event.target.id !== "file-input") return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = await importFile(file, { categories: state.categories, rules: state.rules });
    const merged = mergeTransactions(state.transactions, imported);
    setState({ transactions: merged.transactions, selectedIds: [] });
    setUI({ importMessage: `成功导入 ${merged.added.length} 笔，跳过重复 ${merged.skipped.length} 笔。`, importError: "" });
  } catch (error) {
    setUI({ importError: error.message, importMessage: "" });
  } finally {
    event.target.value = "";
  }
}

async function restoreBackupFromInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const restored = await restoreBackupFile(file);
    Object.assign(state, { ...restored, selectedIds: [] });
    saveState(state);
    setUI({ backupMessage: `已恢复 ${state.transactions.length} 笔流水。`, backupError: "" });
  } catch (error) {
    setUI({ backupError: error.message, backupMessage: "" });
  } finally {
    event.target.value = "";
  }
}

function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === "quick") return submitQuick(values.quick, form);
  if (form.dataset.form === "edit") return submitEdit(values);
}

function submitQuick(text, form) {
  try {
    const transaction = parseQuickTransaction(text);
    const merged = mergeTransactions(state.transactions, [transaction]);
    setState({ transactions: merged.transactions });
    form.reset();
    setUI({ importMessage: "快捷账单已记入。", importError: "" });
  } catch (error) {
    setUI({ importError: error.message, importMessage: "" });
  }
}

function submitEdit(values) {
  try {
    if (ui.editingId) {
      let transactions = updateTransaction(state.transactions, ui.editingId, {
        title: values.title,
        amount: values.amount,
        direction: values.direction,
        categoryId: values.categoryId || undefined,
        source: values.source,
        paymentMethod: values.paymentMethod,
        counterparty: values.counterparty,
        occurredAt: values.occurredAt,
        notes: values.notes
      }, state.categories, state.rules);
      const updated = transactions.find((item) => item.id === ui.editingId);
      const rule = values.categoryId ? learnCategoryRule(updated, values.categoryId) : null;
      const rules = rule ? [...state.rules.filter((item) => item.keyword !== rule.keyword), rule] : state.rules;
      setState({ transactions, rules });
    } else {
      const transaction = createTransaction({
        title: values.title,
        amount: values.amount,
        direction: values.direction,
        categoryId: values.categoryId || undefined,
        source: values.source,
        paymentMethod: values.paymentMethod,
        counterparty: values.counterparty,
        occurredAt: values.occurredAt,
        notes: values.notes
      }, state.categories, state.rules);
      setState({ transactions: [transaction, ...state.transactions] });
    }
    setUI({ editingId: null });
  } catch (error) {
    alert(error.message);
  }
}

function deleteSelected() {
  if (!state.selectedIds.length) return;
  if (!confirm(`确定删除选中的 ${state.selectedIds.length} 笔账单吗？`)) return;
  setState({ transactions: deleteTransactions(state.transactions, state.selectedIds), selectedIds: [] });
}

function deleteOne(id) {
  if (!confirm("确定删除这笔账单吗？")) return;
  setState({ transactions: deleteTransactions(state.transactions, [id]), selectedIds: state.selectedIds.filter((item) => item !== id) });
  setUI({ editingId: null });
}

function downloadExport(kind) {
  const bundle = exportLedger(state.transactions, { hideNames: state.settings.hideNamesOnExport });
  const content = bundle[kind];
  const type = kind === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `money-pilot-${new Date().toISOString().slice(0, 10)}.${kind}`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBackup() {
  const content = exportBackup(state);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `money-pilot-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setUI({ backupMessage: "完整备份已生成，请在 iPhone 下载面板中保存到“文件”。", backupError: "" });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toLocalInputValue(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function sourceText(source) {
  return {
    manual: "手动录入",
    weChat: "微信账单",
    bankStatement: "银行账单",
    shortcut: "快捷记账",
    sms: "短信",
    notificationSummary: "通知摘要"
  }[source] || source;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

function displayText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/[\uFFFD]+/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  if (/^(?:Ã|Â|å|æ|ç|¤|¥|¨|©|±|¶|¿)+$/.test(text)) return fallback;
  return text;
}

function icon(name) {
  const paths = {
    pilot: '<path d="M8 8c2-5 6-7 10-7s8 2 10 7c4 2 6 6 6 10 0 8-7 14-16 14S2 26 2 18c0-4 2-8 6-10Z"/><path d="m10 7-3-6c5 1 8 4 10 8M26 7l3-6c-5 1-8 4-10 8" opacity=".55"/><circle cx="13" cy="18" r="1.8"/><circle cx="23" cy="18" r="1.8"/><path d="M15 23c2 2 4 2 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    sparkle: '<path d="M18 2l3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z"/><path d="M7 22l1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4Z"/>',
    tail: '<path d="M6 24c9 4 23-1 23-10 0-5-4-8-8-8-6 0-9 6-6 10 2 3 7 2 8-1"/><path d="M6 24c3 5 10 7 16 5"/>',
    basket: '<path d="M7 13h22l-2 16H9L7 13Z"/><path d="M12 13 18 4l6 9"/><path d="M13 19h10M12 24h12"/>',
    book: '<path d="M8 5h14a6 6 0 0 1 6 6v19H12a4 4 0 0 0-4 4V5Z"/><path d="M8 30a4 4 0 0 1 4-4h16"/>',
    flower: '<circle cx="18" cy="18" r="4"/><path d="M18 3c4 5 4 8 0 11-4-3-4-6 0-11ZM18 33c-4-5-4-8 0-11 4 3 4 6 0 11ZM3 18c5-4 8-4 11 0-3 4-6 4-11 0ZM33 18c-5 4-8 4-11 0 3-4 6-4 11 0Z"/>',
    phone: '<rect x="11" y="3" width="14" height="30" rx="4"/><path d="M16 28h4"/>',
    plus: '<path d="M18 7v22M7 18h22"/>',
    calendar: '<rect x="5" y="7" width="26" height="24" rx="4"/><path d="M11 3v8M25 3v8M5 15h26"/>',
    income: '<path d="M18 30V6"/><path d="m9 15 9-9 9 9"/><path d="M7 30h22"/>',
    expense: '<path d="M18 6v24"/><path d="m9 21 9 9 9-9"/><path d="M7 6h22"/>',
    clock: '<circle cx="18" cy="18" r="14"/><path d="M18 9v10l7 4"/>',
    search: '<circle cx="16" cy="16" r="10"/><path d="m24 24 7 7"/>',
    trash: '<path d="M7 10h22M14 10V6h8v4M11 10l1 21h12l1-21"/><path d="M16 15v11M21 15v11"/>',
    upload: '<path d="M18 25V6"/><path d="m9 15 9-9 9 9"/><path d="M6 28h24"/>',
    download: '<path d="M18 6v19"/><path d="m9 16 9 9 9-9"/><path d="M6 30h24"/>',
    refresh: '<path d="M29 12a12 12 0 0 0-21-4l-3 3"/><path d="M5 4v7h7"/><path d="M7 24a12 12 0 0 0 21 4l3-3"/><path d="M31 32v-7h-7"/>',
    back: '<path d="M21 8 11 18l10 10"/><path d="M12 18h18"/>',
    chevron: '<path d="m12 15 6 6 6-6"/>',
    close: '<path d="M9 9l18 18M27 9 9 27"/>',
    save: '<path d="M8 5h17l4 4v22H8V5Z"/><path d="M12 5v10h12V5M13 25h10"/>',
    shield: '<path d="M18 4 29 8v8c0 8-5 13-11 16C12 29 7 24 7 16V8l11-4Z"/><path d="m13 18 4 4 7-8"/>'
  };
  return `<svg class="icon" viewBox="0 0 36 36" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
}

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
app.addEventListener("change", handleChange);
app.addEventListener("submit", handleSubmit);
app.addEventListener("touchstart", handleSwipeStart, { passive: true });
app.addEventListener("touchmove", handleSwipeMove, { passive: false });
app.addEventListener("touchend", handleSwipeEnd, { passive: true });
app.addEventListener("touchcancel", handleSwipeEnd, { passive: true });
app.addEventListener("mousedown", handleMouseSwipeStart);
document.addEventListener("mousemove", handleMouseSwipeMove);
document.addEventListener("mouseup", handleMouseSwipeEnd);

if (!state.categories?.length) state.categories = DEFAULT_CATEGORIES;
render();
lockPageZoom();
initializePWA();

function lockPageZoom() {
  document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("gestureend", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.scale && event.scale !== 1) event.preventDefault();
  }, { passive: false });

  let lastTouchEndedAt = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEndedAt <= 300) event.preventDefault();
    lastTouchEndedAt = now;
  }, { passive: false });
}

function handleSwipeStart(event) {
  const row = event.target.closest("[data-swipe-row]");
  if (!row || event.touches.length !== 1) return;
  const touch = event.touches[0];
  startSwipe(row, touch.clientX, touch.clientY, "touch");
}

function handleSwipeMove(event) {
  if (!swipeGesture || swipeGesture.source !== "touch" || event.touches.length !== 1) return;
  const touch = event.touches[0];
  moveSwipe(touch.clientX, touch.clientY, event);
}

function handleSwipeEnd() {
  endSwipe();
}

function handleMouseSwipeStart(event) {
  const row = event.target.closest("[data-swipe-row]");
  if (!row || event.button !== 0) return;
  startSwipe(row, event.clientX, event.clientY, "mouse");
}

function handleMouseSwipeMove(event) {
  if (!swipeGesture || swipeGesture.source !== "mouse") return;
  moveSwipe(event.clientX, event.clientY, event);
}

function handleMouseSwipeEnd() {
  if (!swipeGesture || swipeGesture.source !== "mouse") return;
  endSwipe();
}

function startSwipe(row, clientX, clientY, source) {
  swipeGesture = {
    row,
    foreground: row.querySelector("[data-swipe-foreground]"),
    startX: clientX,
    startY: clientY,
    source,
    lastOffset: 0,
    active: false
  };
}

function moveSwipe(clientX, clientY, event) {
  if (!swipeGesture || !swipeGesture.foreground) return;
  const dx = clientX - swipeGesture.startX;
  const dy = clientY - swipeGesture.startY;
  if (!swipeGesture.active && Math.abs(dx) < 14) return;
  if (!swipeGesture.active && Math.abs(dy) > Math.abs(dx)) return;

  swipeGesture.active = true;
  const offset = Math.max(0, Math.min(dx, 96));
  if (offset > 0 || swipeGesture.row.classList.contains("quick-delete-open")) event.preventDefault();
  closeOtherSwipeRows(swipeGesture.row);
  swipeGesture.row.classList.add("swiping");
  swipeGesture.lastOffset = offset;
  swipeGesture.foreground.style.transform = `translateX(${offset}px)`;
}

function endSwipe() {
  if (!swipeGesture || !swipeGesture.foreground) {
    swipeGesture = null;
    return;
  }
  const shouldOpen = swipeGesture.lastOffset >= 56;
  swipeGesture.row.classList.toggle("quick-delete-open", shouldOpen);
  swipeGesture.row.classList.remove("swiping");
  swipeGesture.foreground.style.transform = "";
  swipeGesture = null;
}

function closeOtherSwipeRows(currentRow) {
  app.querySelectorAll("[data-swipe-row].quick-delete-open").forEach((row) => {
    if (row !== currentRow) row.classList.remove("quick-delete-open");
  });
}

async function initializePWA() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setUI({ pwaStatus: { ...ui.pwaStatus, installed: isStandalone() } });
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setUI({ pwaStatus: { ...ui.pwaStatus, installed: true } });
  });
  window.addEventListener("online", () => setUI({ pwaStatus: { ...ui.pwaStatus, online: true } }));
  window.addEventListener("offline", () => setUI({ pwaStatus: { ...ui.pwaStatus, online: false } }));

  const [offlineReady, storagePersisted, durableLedgerReady] = await Promise.all([
    registerServiceWorker(),
    requestPersistentStorage(),
    hydratePersistentLedger()
  ]);
  setUI({
    pwaStatus: {
      installed: isStandalone(),
      offlineReady,
      online: navigator.onLine,
      storagePersisted,
      durableLedgerReady,
      appVersion: APP_VERSION,
      updateAvailable: ui.pwaStatus.updateAvailable,
      checkingUpdate: false
    }
  });
}

async function hydratePersistentLedger() {
  try {
    const currentSavedAt = Date.parse(state.meta?.savedAt || 0);
    const persisted = await loadPersistentState();
    const persistedSavedAt = Date.parse(persisted.meta?.savedAt || 0);
    if (persistedSavedAt > currentSavedAt) {
      Object.assign(state, { ...persisted, selectedIds: [] });
      render();
    }
    return true;
  } catch {
    return false;
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    serviceWorkerRegistration = registration;
    registration.addEventListener("updatefound", () => trackInstallingWorker(registration.installing));
    trackInstallingWorker(registration.installing || registration.waiting);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    await navigator.serviceWorker.ready;
    registration.update?.();
    return true;
  } catch {
    return false;
  }
}

function trackInstallingWorker(worker) {
  if (!worker) return;
  worker.addEventListener?.("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      setUI({ pwaStatus: { ...ui.pwaStatus, updateAvailable: true, checkingUpdate: false } });
    }
  });
}

async function checkForAppUpdate() {
  setUI({ pwaStatus: { ...ui.pwaStatus, checkingUpdate: true } });
  try {
    const registration = serviceWorkerRegistration || await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    setUI({ pwaStatus: { ...ui.pwaStatus, checkingUpdate: false, updateAvailable: Boolean(registration?.waiting) } });
  } catch {
    setUI({ pwaStatus: { ...ui.pwaStatus, checkingUpdate: false } });
  }
}

function activateAppUpdate() {
  const waiting = serviceWorkerRegistration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  window.location.reload();
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function showInstallInstructions() {
  setUI({ introOpen: true });
}

async function promptNativeInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    return;
  }
  setUI({ introOpen: true });
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}
