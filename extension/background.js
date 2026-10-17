"use strict";

// Reader is imported by background-bootstrap.js.

const DB_NAME = "eipa-user-dictionary";
const DB_VERSION = 1;
const STORE = "files";
const MDX_KEY = "primary-mdx";
let readerPromise = null;
let activeRevision = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开词典数据库"));
  });
}

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error("读取词典失败"));
    });
  } finally { db.close(); }
}

function htmlText(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();
}

function extractIpa(definition) {
  const html = String(definition || "");
  const values = [];
  const re = /<span\b[^>]*class\s*=\s*["'][^"']*\bipa\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  for (const match of html.matchAll(re)) {
    const text = htmlText(match[1]);
    if (text && !values.includes(text)) values.push(text);
  }
  if (!values.length) {
    // Conservative fallback for dictionaries that use an element id instead of class.
    const fallback = html.match(/<(?:span|div)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:phon|pron|ipa)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    const text = fallback ? htmlText(fallback[1]) : "";
    if (text) values.push(text);
  }
  return values.join(" | ");
}


function extractInflectionMetadata(definition, surfaceWord = "") {
  const html = String(definition || "");
  const surface = String(surfaceWord || "").toLowerCase().replaceAll("’", "'").trim();

  // ECDICT / concise-bing stores an explicit backward relation in .orm, e.g.
  // "polarising 是 polarise 的现在分词".  Treat this dictionary-authored
  // relation as stronger evidence than spelling reversal.
  const relationTexts = [];
  const ormRe = /<span\b[^>]*class\s*=\s*["'][^"']*\borm\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  for (const match of html.matchAll(ormRe)) {
    const text = htmlText(match[1]).replace(/\s+/g, " ").trim();
    if (text && !relationTexts.includes(text)) relationTexts.push(text);
  }

  const kindForLabel = (label) => {
    const value = String(label || "");
    if (value.includes("现在分词") || value.includes("現在分詞") || value.includes("動名詞") || value.includes("动名词") || /\bing\s*形式/i.test(value)) return "progressive-ing";
    if (value.includes("过去式") || value.includes("過去式") || value.includes("过去分词") || value.includes("過去分詞") || /\bed\s*形式/i.test(value)) return "past-ed";
    if (value.includes("第三人称单数") || value.includes("第三人稱單數") || value.includes("三单") || value.includes("三單") || value.includes("复数") || value.includes("複數")) return "plural-s";
    if (value.includes("所有格")) return "possessive-s";
    return "";
  };

  let relation = null;
  for (const text of relationTexts) {
    const match = text.match(/^([A-Za-z]+(?:['’][A-Za-z]+)?)\s*是\s*([A-Za-z]+(?:['’][A-Za-z]+)?)\s*的\s*(.+)$/i);
    if (!match) continue;
    const relationSurface = match[1].toLowerCase().replaceAll("’", "'");
    const base = match[2].toLowerCase().replaceAll("’", "'");
    const label = match[3].trim();
    if (surface && relationSurface !== surface) continue;
    relation = { base, kind: kindForLabel(label), label, raw: text, evidence: "orm" };
    break;
  }

  // A number of ECDICT-derived entries omit .orm but state the lemma directly
  // in the definition, e.g. "airdrop的现在分词".  This is still explicit MDX
  // evidence and can safely break a spelling tie such as airdrop / airdropp.
  if (!relation) {
    const definitionTexts = [];
    const dcnRe = /<span\b[^>]*class\s*=\s*["'][^"']*\bdcn\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
    for (const match of html.matchAll(dcnRe)) {
      const text = htmlText(match[1]).replace(/\s+/g, " ").trim();
      if (text) definitionTexts.push(text);
    }
    for (const text of definitionTexts) {
      const match = text.match(/(?:^|[\s(（])([A-Za-z]+(?:['’][A-Za-z]+)?)\s*的\s*((?:现在|現在)分词|(?:过去|過去)式(?:和(?:过去|過去)分词)?|(?:过去|過去)分词|第三人[称稱]单数|三[单單]形式|[复複]数|ing\s*形式|ed\s*形式)(?=$|[\s)）;,，；])/i);
      if (!match) continue;
      const base = match[1].toLowerCase().replaceAll("’", "'");
      const label = match[2].trim();
      relation = { base, kind: kindForLabel(label), label, raw: text, evidence: "definition" };
      break;
    }
  }

  // Some entries do not carry a backward .orm relation, while their lemma has
  // an explicit forward tense/form list in .frm.  Return those forms too so
  // the content script can use them to break otherwise-valid spelling ties.
  const forms = [];
  const frmRe = /<span\b[^>]*class\s*=\s*["'][^"']*\bfrm\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  for (const match of html.matchAll(frmRe)) {
    const text = htmlText(match[1]);
    for (const token of text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []) {
      const normalized = token.toLowerCase().replaceAll("’", "'");
      if (normalized && !forms.includes(normalized)) forms.push(normalized);
    }
  }

  return { relation, forms };
}

function extractMeaning(definition) {
  const html = String(definition || "");

  // ECDICT/concise-bing style: each definition row contains a POS span and a
  // definition span. Preserve dictionary order and group repeated POS labels.
  const grouped = new Map();
  const unlabelled = [];
  const rowRe = /<div\b[^>]*class\s*=\s*["'][^"']*\bdcb\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  for (const row of html.matchAll(rowRe)) {
    const body = row[1] || "";
    const posMatch = body.match(/<span\b[^>]*class\s*=\s*["'][^"']*\bpos\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const defMatch = body.match(/<span\b[^>]*class\s*=\s*["'][^"']*\bdcn\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const pos = posMatch ? htmlText(posMatch[1]).replace(/\s+/g, " ").trim() : "";
    const meaning = defMatch ? htmlText(defMatch[1]).replace(/\s+/g, " ").trim() : "";
    if (!meaning) continue;
    if (!pos) {
      if (!unlabelled.includes(meaning)) unlabelled.push(meaning);
      continue;
    }
    if (!grouped.has(pos)) grouped.set(pos, []);
    const values = grouped.get(pos);
    if (!values.includes(meaning)) values.push(meaning);
  }

  if (grouped.size || unlabelled.length) {
    const lines = [];
    for (const [pos, meanings] of grouped) {
      if (meanings.length) lines.push(`${pos} ${meanings.join("；")}`);
    }
    for (const meaning of unlabelled) lines.push(meaning);
    return lines.join("\n");
  }

  // Generic fallback for other MDX dictionaries that expose only definition /
  // meaning / translation fields and no explicit part-of-speech structure.
  const values = [];
  const selectors = [
    /<(?:span|div)\b[^>]*class\s*=\s*["'][^"']*\bdcn\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/gi,
    /<(?:span|div)\b[^>]*class\s*=\s*["'][^"']*\b(?:definition|meaning|translation|trans|def)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/gi
  ];
  for (const re of selectors) {
    for (const match of html.matchAll(re)) {
      const text = htmlText(match[1]).replace(/\s+/g, " ").trim();
      if (text && !values.includes(text)) values.push(text);
      if (values.length >= 3) break;
    }
    if (values.length) break;
  }
  return values.slice(0, 3).join("；");
}

async function getReader({ force = false } = {}) {
  const local = await chrome.storage.local.get({ userDictionaryEnabled: false, userDictionaryRevision: 0 });
  if (!local.userDictionaryEnabled) return null;
  if (!force && readerPromise && activeRevision === local.userDictionaryRevision) return readerPromise;
  activeRevision = local.userDictionaryRevision;
  readerPromise = (async () => {
    const stored = await idbGet(MDX_KEY);
    if (!stored?.blob) return null;
    const reader = new globalThis.EIPA_MDX.MdxReader(stored.blob, stored.name || "dictionary.mdx");
    await reader.init();
    return reader;
  })();
  try { return await readerPromise; }
  catch (error) { readerPromise = null; throw error; }
}

async function lookupBatch(words) {
  const reader = await getReader();
  if (!reader) return {};
  const out = Object.create(null);
  const unique = [...new Set((words || []).map((w) => String(w || "").toLowerCase()).filter(Boolean))].slice(0, 1200);
  // Sequential lookup deliberately reuses adjacent MDX key/record block caches and
  // avoids a large decompression burst on pages with many unique words.
  for (const word of unique) {
    try {
      const hit = await (reader.lookupExact ? reader.lookupExact(word) : reader.lookup(word));
      if (!hit) continue;
      const ipa = extractIpa(hit.definition);
      const meaning = extractMeaning(hit.definition);
      const inflection = extractInflectionMetadata(hit.definition, word);
      out[word] = { ipa, meaning, key: hit.key, exists: true, relation: inflection.relation, forms: inflection.forms };
    } catch (error) {
      console.warn("[Contextual English IPA] MDX lookup failed", word, error);
    }
  }
  return out;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "EIPA_USER_DICT_RELOAD") {
    activeRevision = null;
    readerPromise = null;
    getReader({ force: true }).then((reader) => {
      if (!reader) return sendResponse({ ok: true, loaded: false });
      sendResponse({ ok: true, loaded: true, title: reader.attrs?.Title || "", entries: reader.numEntries || 0, encoding: reader.encoding || "" });
    }).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message.type === "EIPA_USER_DICT_LOOKUP_BATCH") {
    lookupBatch(message.words).then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error), results: {} }));
    return true;
  }
  if (message.type === "EIPA_USER_DICT_STATUS") {
    getReader().then((reader) => sendResponse({ ok: true, loaded: Boolean(reader), title: reader?.attrs?.Title || "", entries: reader?.numEntries || 0 }))
      .catch((error) => sendResponse({ ok: false, loaded: false, error: String(error?.message || error) }));
    return true;
  }
});
