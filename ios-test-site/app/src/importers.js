import { createTransaction } from "./domain.js";

export async function importFile(file, context = {}) {
  if (!file) throw new Error("请选择要导入的账单文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name || "";
  const lower = name.toLowerCase();

  if (lower.endsWith(".xlsx") || startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return importWeChatRows(await extractXLSXRows(bytes), context);
  }

  if (lower.endsWith(".pdf") || startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    const text = await extractPDFText(bytes);
    return importWeChatText(text, context);
  }

  const text = decodeText(bytes);
  if (lower.endsWith(".xls")) return importWeChatText(htmlTableText(text), context);
  return importWeChatText(text, context);
}

export function importWeChatText(text, context = {}) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const columnPdfRecords = recordsFromColumnPDFLines(lines, context);
  if (columnPdfRecords.length) return columnPdfRecords;

  const rows = lines.map(splitLooseRow);
  if (rows.some(isHeaderRow)) return importWeChatRows(rows, context);

  const records = lines.map((line) => recordFromLooseLine(line, context)).filter(Boolean);
  if (!records.length) throw new Error("没有识别到账单记录，请确认文件来自微信账单导出。");
  return records;
}

export function importWeChatRows(rows, context = {}) {
  const headerIndex = rows.findIndex(isHeaderRow);
  if (headerIndex < 0) return importWeChatText(rows.map((row) => row.join("\t")).join("\n"), context);
  const header = rows[headerIndex].map(normalizedHeader);
  const records = rows
    .slice(headerIndex + 1)
    .map((row) => recordFromRow(row, header, context))
    .filter(Boolean);
  if (!records.length) throw new Error("没有识别到账单记录，请检查文件表头是否完整。");
  return records;
}

export async function extractXLSXRows(bytes) {
  const archive = await readZipEntries(bytes);
  const sharedStrings = archive.get("xl/sharedStrings.xml")
    ? parseSharedStrings(decodeUTF8(archive.get("xl/sharedStrings.xml")))
    : [];
  const sheetNames = [...archive.keys()]
    .filter((name) => name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml"))
    .sort();
  const rows = [];
  for (const name of sheetNames) {
    rows.push(...parseSheetRows(decodeUTF8(archive.get(name)), sharedStrings));
  }
  if (!rows.length) throw new Error("Excel 文件里没有可读取的工作表。");
  return rows;
}

export async function extractPDFText(bytes) {
  const raw = decodeLatin1(bytes);
  const chunks = [raw];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(raw))) {
    const before = raw.slice(Math.max(0, match.index - 220), match.index);
    if (!before.includes("FlateDecode")) continue;
    const start = match.index + match[0].indexOf(match[1]);
    const streamBytes = bytes.slice(start, start + match[1].length);
    try {
      chunks.push(decodeLatin1(await inflate(streamBytes, "deflate")));
    } catch {
      try {
        chunks.push(decodeLatin1(await inflate(streamBytes, "deflate-raw")));
      } catch {
        continue;
      }
    }
  }

  const text = chunks.map(extractPDFStrings).join("\n").replace(/\s+\n/g, "\n").trim();
  if (!text) {
    throw new Error("这个 PDF 没有可抽取文本，请改用微信导出的 Excel 文件。");
  }
  return text;
}

function recordFromRow(row, header, context) {
  const values = {};
  header.forEach((name, index) => {
    if (name) values[name] = String(row[index] ?? "").trim();
  });
  const dateText = firstValue(values, ["交易时间", "时间", "日期"]);
  const amountText = firstValue(values, ["金额", "金额元", "收支金额"]);
  if (!dateText || !amountText) return null;

  const direction = parseDirection(firstValue(values, ["收支", "收支类型", "交易方向"]) || "", amountText);
  const counterparty = firstValue(values, ["交易对方", "对方", "商户"]);
  const product = firstValue(values, ["商品", "商品说明", "交易说明"]);
  const type = firstValue(values, ["交易类型", "类型"]);
  const title = [product, counterparty, type].filter(Boolean)[0] || "微信账单";
  const draft = {
    title,
    amountCents: parseAmountCents(amountText),
    direction,
    occurredAt: parseDate(dateText).toISOString(),
    merchantName: counterparty,
    counterparty,
    accountId: "wechat",
    paymentMethod: firstValue(values, ["支付方式", "支付类型"]) || "微信支付",
    source: "weChat",
    sourceRecordId: firstValue(values, ["交易单号", "微信支付单号", "商户单号"]),
    rawPayload: row.join("\t")
  };
  return createTransaction(draft, context.categories, context.rules);
}

function recordsFromColumnPDFLines(lines, context) {
  const headerStart = lines.findIndex((line) => normalizedHeader(line) === "交易时间");
  if (headerStart < 0) return [];
  const header = [];
  let cursor = headerStart;
  while (cursor < lines.length && KNOWN_HEADERS.has(normalizedHeader(lines[cursor]))) {
    header.push(normalizedHeader(lines[cursor]));
    cursor += 1;
  }
  if (header.length < 4) return [];

  const records = [];
  let row = [];
  for (const line of lines.slice(cursor).filter((item) => !KNOWN_HEADERS.has(normalizedHeader(item)))) {
    if (looksLikeDate(line) && row.length) {
      const record = recordFromRow(padded(row, header.length), header, context);
      if (record) records.push(record);
      row = [];
    }
    row.push(line);
    if (row.length === header.length) {
      const record = recordFromRow(row, header, context);
      if (record) records.push(record);
      row = [];
    }
  }
  if (row.length) {
    const record = recordFromRow(padded(row, header.length), header, context);
    if (record) records.push(record);
  }
  return records;
}

function recordFromLooseLine(line, context) {
  const dateText = line.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/)?.[0];
  const amountMatches = [...line.matchAll(/[¥￥]?\s*[-+]?\d+(?:\.\d{1,2})?/g)].map((match) => match[0]);
  const amountText = amountMatches.at(-1);
  if (!dateText || !amountText) return null;
  const title = line
    .replace(dateText, "")
    .replace(amountText, "")
    .replaceAll("收入", "")
    .replaceAll("支出", "")
    .replaceAll("微信支付", "")
    .replaceAll("微信", "")
    .replaceAll("支付", "")
    .replace(/\s+/g, " ")
    .trim();
  return createTransaction({
    title: title || "微信账单",
    amountCents: parseAmountCents(amountText),
    direction: parseDirection(line, amountText),
    occurredAt: parseDate(dateText).toISOString(),
    merchantName: title || undefined,
    counterparty: title || undefined,
    accountId: "wechat",
    paymentMethod: "微信支付",
    source: "weChat",
    rawPayload: line
  }, context.categories, context.rules);
}

async function readZipEntries(bytes) {
  const eocdOffset = lastIndexOf(bytes, [0x50, 0x4b, 0x05, 0x06]);
  if (eocdOffset < 0) throw new Error("Excel 文件结构不完整。");
  const entryCount = u16(bytes, eocdOffset + 10);
  let offset = u32(bytes, eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (u32(bytes, offset) !== 0x02014b50) throw new Error("Excel 中央目录无法读取。");
    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const fileNameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localHeaderOffset = u32(bytes, offset + 42);
    const nameStart = offset + 46;
    const fileName = decodeUTF8(bytes.slice(nameStart, nameStart + fileNameLength));
    if (fileName.endsWith(".xml")) {
      entries.set(fileName, await readLocalFile(bytes, localHeaderOffset, method, compressedSize));
    }
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function readLocalFile(bytes, offset, method, compressedSize) {
  if (u32(bytes, offset) !== 0x04034b50) throw new Error("Excel 本地文件头无法读取。");
  const fileNameLength = u16(bytes, offset + 26);
  const extraLength = u16(bytes, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflate(compressed, "deflate-raw");
  throw new Error(`Excel 压缩方式暂不支持：${method}。`);
}

async function inflate(bytes, format) {
  if (!globalThis.DecompressionStream) throw new Error("当前浏览器无法解压这个 Excel 文件。");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseSharedStrings(xml) {
  return fragments(xml, "<si", "</si>").map(xmlText);
}

function parseSheetRows(xml, sharedStrings) {
  return fragments(xml, "<row", "</row>")
    .map((rowXML) =>
      fragments(rowXML, "<c", "</c>").map((cellXML) => {
        if (cellXML.includes('t="s"')) return sharedStrings[Number(firstTagValue(cellXML, "v"))] || "";
        if (cellXML.includes('t="inlineStr"')) return xmlText(cellXML);
        return firstTagValue(cellXML, "v") ? xmlUnescape(firstTagValue(cellXML, "v")) : xmlText(cellXML);
      })
    )
    .filter((row) => row.some((cell) => cell.trim()));
}

function extractPDFStrings(text) {
  const values = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  const hex = /<([0-9a-fA-F\s]{4,})>/g;
  let match;
  while ((match = literal.exec(text))) values.push(unescapePDFLiteral(match[0].slice(1, -1)));
  while ((match = hex.exec(text))) values.push(decodePDFHex(match[1]));
  return values.join("\n");
}

function unescapePDFLiteral(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePDFHex(value) {
  const clean = value.replace(/\s/g, "");
  const bytes = [];
  for (let index = 0; index < clean.length - 1; index += 2) bytes.push(parseInt(clean.slice(index, index + 2), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = "";
    for (let index = 2; index < bytes.length - 1; index += 2) result += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return result;
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function htmlTableText(text) {
  return text
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&yen;", "¥");
}

function splitLooseRow(line) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(",")) return parseCSVLine(line);
  return line.split(/\s+/).filter(Boolean);
}

function parseCSVLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function isHeaderRow(row) {
  const joined = row.map(normalizedHeader).join("|");
  return joined.includes("交易时间") && (joined.includes("金额") || joined.includes("收支"));
}

function normalizedHeader(value) {
  return String(value ?? "")
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll("(元)", "")
    .replaceAll("/", "")
    .trim();
}

function firstValue(values, keys) {
  for (const key of keys) {
    const value = String(values[key] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

function parseDirection(directionText, amountText) {
  const text = `${directionText} ${amountText}`;
  if (text.includes("收入") || text.includes("收款") || text.includes("+")) return "income";
  if (text.includes("转账")) return "transfer";
  return "expense";
}

function parseAmountCents(value) {
  const number = Number(String(value).replace(/[¥￥元,+\s]/g, "").replace("-", ""));
  if (!Number.isFinite(number)) throw new Error(`金额格式无效：${value}`);
  return Math.round(number * 100);
}

function parseDate(value) {
  const normalized = String(value).replaceAll("/", "-").trim();
  const serial = Number(normalized);
  if (Number.isFinite(serial) && serial > 20000) return new Date((serial - 25569) * 86400 * 1000);
  const date = new Date(normalized.includes("T") ? normalized : normalized.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) throw new Error(`日期格式无效：${value}`);
  return date;
}

function looksLikeDate(value) {
  return /20\d{2}[-/]\d{1,2}[-/]\d{1,2}/.test(value);
}

function padded(row, count) {
  return row.length >= count ? row : [...row, ...Array(count - row.length).fill("")];
}

function decodeText(bytes) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return utf8;
  return decodeLatin1(bytes);
}

function decodeUTF8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeLatin1(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function lastIndexOf(bytes, signature) {
  for (let index = bytes.length - signature.length; index >= 0; index -= 1) {
    if (signature.every((value, offset) => bytes[index + offset] === value)) return index;
  }
  return -1;
}

function fragments(text, startMarker, endMarker) {
  const result = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(startMarker, cursor);
    if (start < 0) break;
    const end = text.indexOf(endMarker, start);
    if (end < 0) break;
    result.push(text.slice(start, end + endMarker.length));
    cursor = end + endMarker.length;
  }
  return result;
}

function firstTagValue(text, tag) {
  const start = text.indexOf(`<${tag}>`);
  const end = text.indexOf(`</${tag}>`, start);
  return start >= 0 && end >= 0 ? text.slice(start + tag.length + 2, end) : "";
}

function xmlText(fragment) {
  return xmlUnescape(fragment.replace(/<[^>]+>/g, "")).trim();
}

function xmlUnescape(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

const KNOWN_HEADERS = new Set([
  "交易时间",
  "交易类型",
  "交易对方",
  "商品",
  "商品说明",
  "交易说明",
  "收支",
  "收支类型",
  "交易方向",
  "金额",
  "金额元",
  "收支金额",
  "支付方式",
  "支付类型",
  "当前状态",
  "交易单号",
  "微信支付单号",
  "商户单号",
  "备注"
]);
