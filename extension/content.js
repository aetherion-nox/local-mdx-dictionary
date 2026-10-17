(() => {
  "use strict";

  function detectUiLanguage() {
    const raw = String(chrome.i18n?.getUILanguage?.() || navigator.language || "en").replaceAll("_", "-").toLowerCase();
    if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-mo") || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh")) return "zh-CN";
    if (raw.startsWith("ja")) return "ja";
    if (raw.startsWith("ko")) return "ko";
    return "en";
  }

  const DEFAULTS = {
    enabled: true,
    fontSize: 56,
    color: "#d14b4b",
    observeChanges: true,
    allowIpaSelection: false,
    showMeaning: false,
    hoverToShow: false,
    selectionToLookup: true,
    showMissingPopup: false,
    autoLookupOnEdit: false,
    onDemandMode: true,
    demandPopupPosition: "below",
    uiLanguage: detectUiLanguage()
  };

  const UI_STRINGS = {
    "zh-CN": {
      exact: "用户 MDX 精确词条（全部读音）", derived: "MDX 已确认原型 + 确定性词形后缀", unknown: "MDX 无精确音标，且无法唯一确认规则变形", mdx: "用户 MDX",
      past: "推测为 {base} 的过去式 / 过去分词", progressive: "推测为 {base} 的现在分词 / 动名词", possessive: "推测为 {base} 的所有格", plural: "推测为 {base} 的复数 / 第三人称单数"
    },
    "zh-TW": {
      exact: "使用者 MDX 精確詞條（全部讀音）", derived: "MDX 已確認原形 + 確定性詞形詞尾", unknown: "MDX 無精確音標，且無法唯一確認規則變形", mdx: "使用者 MDX",
      past: "推測為 {base} 的過去式 / 過去分詞", progressive: "推測為 {base} 的現在分詞 / 動名詞", possessive: "推測為 {base} 的所有格", plural: "推測為 {base} 的複數 / 第三人稱單數"
    },
    en: {
      exact: "Exact user MDX entry (all pronunciations)", derived: "MDX-confirmed lemma + deterministic inflection", unknown: "No exact MDX IPA and no unique regular inflection", mdx: "User MDX",
      past: "Inferred as the past tense / past participle of {base}", progressive: "Inferred as the present participle / gerund of {base}", possessive: "Inferred as the possessive of {base}", plural: "Inferred as the plural / third-person singular of {base}"
    },
    ja: {
      exact: "ユーザーMDXの完全一致項目（全発音）", derived: "MDXで確認した原形 + 規則的な語形変化", unknown: "MDXに完全一致するIPAがなく、規則変化も一意に確定できません", mdx: "ユーザーMDX",
      past: "{base} の過去形 / 過去分詞と推定", progressive: "{base} の現在分詞 / 動名詞と推定", possessive: "{base} の所有格と推定", plural: "{base} の複数形 / 三人称単数現在形と推定"
    },
    ko: {
      exact: "사용자 MDX 정확 일치 항목(모든 발음)", derived: "MDX에서 확인한 원형 + 규칙적 굴절", unknown: "MDX에 정확한 IPA가 없고 규칙 굴절도 하나로 확정할 수 없음", mdx: "사용자 MDX",
      past: "{base}의 과거형 / 과거분사로 추정", progressive: "{base}의 현재분사 / 동명사로 추정", possessive: "{base}의 소유격으로 추정", plural: "{base}의 복수형 / 3인칭 단수 현재형으로 추정"
    }
  };

  function uiText(key, vars = {}) {
    const table = UI_STRINGS[settings?.uiLanguage] || UI_STRINGS.en;
    let value = table[key] || UI_STRINGS.en[key] || key;
    for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }

  const QUERY_UI = {
    "zh-CN": { search: "查词", edit: "编辑查询词", automatic: "输入时自动查词", loading: "正在查询…", missing: "未找到词条", empty: "请输入要查询的内容", manual: "按回车或点击查词", failed: "查询失败：", close: "关闭" },
    "zh-TW": { search: "查詞", edit: "編輯查詢詞", automatic: "輸入時自動查詞", loading: "正在查詢…", missing: "找不到詞條", empty: "請輸入查詢內容", manual: "按 Enter 或點擊查詞", failed: "查詢失敗：", close: "關閉" },
    en: { search: "Search", edit: "Edit lookup text", automatic: "Search as you type", loading: "Looking up…", missing: "No entry found", empty: "Enter text to look up", manual: "Press Enter or click Search", failed: "Lookup failed: ", close: "Close" },
    ja: { search: "検索", edit: "検索語を編集", automatic: "入力中に自動検索", loading: "検索中…", missing: "見つかりません", empty: "検索語を入力してください", manual: "Enter キーか検索ボタンで検索", failed: "検索に失敗しました：", close: "閉じる" },
    ko: { search: "검색", edit: "검색어 편집", automatic: "입력 중 자동 검색", loading: "검색 중…", missing: "결과 없음", empty: "검색할 내용을 입력하세요", manual: "Enter 또는 검색 버튼을 누르세요", failed: "검색 실패: ", close: "닫기" }
  };
  function queryText(key) {
    return (QUERY_UI[settings.uiLanguage] || QUERY_UI.en)[key];
  }

  const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-‐][\p{L}\p{M}\p{N}]+)*/gu;
  // Preserve Latin hyphenated words, but segment contiguous scripts without
  // spaces (Chinese/Japanese/Thai/etc.) for click and hover lookups.
  function* wordMatches(text) {
    for (const match of String(text || '').matchAll(WORD_RE)) {
      if (!/[^\u0000-\u024f]/u.test(match[0]) || !Intl.Segmenter) { yield match; continue; }
      const locale = document.documentElement?.lang || navigator.language || 'und';
      let segmenter;
      try { segmenter = new Intl.Segmenter(locale, { granularity: 'word' }); }
      catch { yield match; continue; }
      for (const part of segmenter.segment(match[0])) {
        if (!part.isWordLike) continue;
        yield { 0: part.segment, index: match.index + part.index };
      }
    }
  }
  const WORD_SEARCH_CONTAINER_SELECTOR = [
    "p", "li", "dd", "dt", "blockquote", "figcaption", "caption", "td", "th",
    "h1", "h2", "h3", "h4", "h5", "h6", "button", "label", "summary", "a"
  ].join(",");
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "CODE", "PRE", "KBD", "SAMP", "SVG", "MATH", "CANVAS", "VIDEO", "AUDIO",
    "IFRAME", "OBJECT", "EMBED", "HEAD", "TITLE"
  ]);

  const phonology = globalThis.EIPA_PHONOLOGY;
  const wrappers = new Set();
  const queuedRoots = new WeakSet();
  const measureQueue = new Set();
  const userDictCache = new Map();
  const userMeaningCache = new Map();
  const userEntryCache = new Map();
  const userRelationCache = new Map();
  const userFormsCache = new Map();

  let settings = { ...DEFAULTS };
  let observer = null;
  let discoveryQueue = [];
  let analysisQueue = [];
  let scanScheduled = false;
  let scanScheduleHandle = null;
  let scanScheduleKind = "";
  let scanRunning = false;
  let measureScheduled = false;
  let selectionUpdateScheduled = false;
  let compoundReconcileScheduled = false;
  let compoundReconcileRunning = false;
  let compoundGroupSerial = 0;
  let generation = 0;
  let mutating = false;
  let lifecycleStarted = false;
  let lastUrl = location.href;
  let measureCanvas = null;
  let demandPopup = null;
  let demandEditTimer = null;
  let demandAnchorRange = null;
  let demandAnchorWord = null;
  let demandRequestId = 0;
  let demandOpenRequestId = 0;
  let demandSelectionTimer = null;
  const demandSelectionProbeTimers = new Set();
  let demandPositionScheduled = false;
  let demandSelectionWatchTimer = null;
  let lastDemandSelectionSignature = "";
  let dismissedDemandSelectionSignature = "";
  let demandTouchHoldTimer = null;
  let demandTouchPoint = null;
  let demandTouchMoved = false;
  let demandPopupTrigger = "";
  let demandHoverTimer = null;
  let demandSelectingPointer = false;

  // v4 is a dictionary viewer; do not rewrite page text into IPA-labelled spans.
  function fullModeActive() { return false; }
  function demandModeActive() { return Boolean(settings.enabled); }

  function normalizeWord(word) {
    return String(word || "").toLowerCase().replaceAll("’", "'");
  }

  function normalizeDisplayIpa(ipa) {
    // Display policy: the MDX IPA field is the authority.  Do not rewrite
    // symbols, remove [] or / / delimiters, strip region labels, or otherwise
    // "clean" dictionary text.  Trim only accidental outer whitespace added
    // by HTML extraction / transport.
    const value = String(ipa || "").trim();
    return value || "UNKNOWN";
  }

  function morphologyLookupWords(word) {
    if (!phonology?.morphologyCandidates) return [];
    return phonology.morphologyCandidates(word).map((candidate) => candidate.base);
  }

  async function lookupUserDictionaryBatch(words) {
    const missing = [...new Set((words || []).map(normalizeWord).filter(Boolean))]
      .filter((word) => !userDictCache.has(word));
    if (!missing.length) return;
    for (let i = 0; i < missing.length; i += 500) {
      const batch = missing.slice(i, i + 500);
      try {
        const response = await chrome.runtime.sendMessage({ type: "EIPA_USER_DICT_LOOKUP_BATCH", words: batch });
        const results = response?.ok ? (response.results || {}) : {};
        for (const word of batch) {
          userDictCache.set(word, results[word]?.ipa || null);
          userMeaningCache.set(word, results[word]?.meaning || null);
          userEntryCache.set(word, Boolean(results[word]?.exists));
          userRelationCache.set(word, results[word]?.relation || null);
          userFormsCache.set(word, Array.isArray(results[word]?.forms) ? results[word].forms : []);
        }
      } catch (error) {
        console.warn("[Contextual English IPA] User MDX lookup unavailable", error);
        for (const word of batch) {
          userDictCache.set(word, null);
          userMeaningCache.set(word, null);
          userEntryCache.set(word, false);
          userRelationCache.set(word, null);
          userFormsCache.set(word, []);
        }
      }
    }
  }

  function userDictionaryCandidates(raw) {
    // INTERNAL-ONLY pronunciation candidates for deterministic inflection
    // calculations.  Exact MDX text shown to the user is handled separately
    // by dictionaryAll() and is never passed through this parser.
    if (!raw) return [];
    const text = String(raw).trim();

    // background.js joins multiple explicit .ipa fields with " | ".  Split
    // only on that transport separator; do not treat semicolons or other
    // dictionary punctuation as pronunciation separators.
    const pieces = text.split(/\s+\|\s+/g);
    const out = [];
    for (let piece of pieces) {
      piece = piece.trim();
      if (!piece) continue;

      // For suffix phonology only, unwrap a single conventional IPA wrapper.
      // This never changes what is displayed for an exact dictionary entry.
      let internal = piece;
      const fullyWrapped = internal.match(/^\s*(?:\[([^\]]+)\]|\/([^/]+)\/)\s*$/);
      if (fullyWrapped) internal = (fullyWrapped[1] || fullyWrapped[2] || "").trim();

      // Some dictionaries prefix the wrapper with a standalone region label.
      // Accept that only for internal suffix calculation; preserve the label
      // verbatim in the UI.
      const labeledWrapped = internal.match(/^\s*(?:BrE|NAmE|AmE|US|UK)\s*[:：-]?\s*(?:\[([^\]]+)\]|\/([^/]+)\/)\s*$/i);
      if (labeledWrapped) internal = (labeledWrapped[1] || labeledWrapped[2] || "").trim();

      if (internal && !out.includes(internal)) out.push(internal);
    }
    return out;
  }

  function extensionElement(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest?.('.eipa-word[data-eipa-owned="true"], .eipa-label[data-eipa-ignore="true"], .eipa-inference-note[data-eipa-ignore="true"], .eipa-demand-popup[data-eipa-ignore="true"]') || null;
  }

  function isEditable(parent) {
    return Boolean(parent.closest("[contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"));
  }

  function shouldSkipTextNode(node) {
    const parent = node?.parentElement;
    if (!parent || !node.nodeValue || !/[\p{L}\p{M}\p{N}]/u.test(node.nodeValue)) return true;
    if (parent.closest('.eipa-word[data-eipa-owned="true"], .eipa-label[data-eipa-ignore="true"], .eipa-inference-note[data-eipa-ignore="true"], .eipa-demand-popup[data-eipa-ignore="true"]')) return true;
    if (SKIP_TAGS.has(parent.tagName)) return true;
    if (isEditable(parent)) return true;
    if (parent.closest("[aria-hidden='true'], [hidden]")) return true;
    return false;
  }


  function dictionaryPronunciations(rawMdxIpa) {
    return userDictionaryCandidates(rawMdxIpa);
  }

  function dictionaryAll(rawMdxIpa) {
    // Exact MDX surface-form pronunciation: display the dictionary field as-is.
    // No bracket removal, region-label removal, symbol normalization, splitting,
    // or reassembly.  Only trim outer transport whitespace.
    const value = String(rawMdxIpa || "").trim();
    return value || null;
  }

  function normalizeMeaningText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function compactMeaning(value, limitPerLine = 34) {
    const text = normalizeMeaningText(value);
    if (!text) return "";
    return text.split("\n").map((line) => {
      const chars = Array.from(line);
      return chars.length > limitPerLine ? `${chars.slice(0, limitPerLine).join("")}…` : line;
    }).join("\n");
  }

  function wrapperMeaningTitle(wrapper) {
    return String(wrapper?.dataset?.eipaMeaningFull || "").trim();
  }

  function wrapperInferenceTitle(wrapper) {
    return String(wrapper?.dataset?.eipaInference || "").trim();
  }

  function visibleSecondaryText(wrapper) {
    const lines = [];
    if (settings.showMeaning) {
      const meaning = compactMeaning(wrapperMeaningTitle(wrapper));
      if (meaning) lines.push(meaning);
    }
    const inference = wrapperInferenceTitle(wrapper);
    if (inference) lines.push(inference);
    return lines.join("\n");
  }

  function sourceLabel(source) {
    if (source === "user-mdx") return uiText("exact");
    if (source === "mdx-inflection-rule" || source === "mdx-explicit-inflection") return uiText("derived");
    if (source === "unknown") return uiText("unknown");
    return uiText("mdx");
  }

  function refreshWrapperTitle(wrapper) {
    if (!(wrapper instanceof Element)) return;
    const source = wrapper.dataset.eipaPronunciationSource || "";
    const meaning = wrapperMeaningTitle(wrapper);
    const inference = wrapperInferenceTitle(wrapper);
    wrapper.title = [source ? sourceLabel(source) : "", meaning, inference].filter(Boolean).join(" · ");
  }

  function applyMeaningMode(wrapper) {
    if (!(wrapper instanceof Element)) return;
    const secondary = visibleSecondaryText(wrapper);
    wrapper.dataset.eipaMeaning = secondary;
    const visible = Boolean(secondary);
    wrapper.classList.toggle("eipa-has-meaning", visible);
    if (visible) {
      const lines = Math.max(1, secondary.split("\n").filter(Boolean).length);
      wrapper.style.setProperty("--eipa-meaning-reserve", `${Math.max(29, 18 + lines * 13)}px`);
    } else {
      wrapper.style.removeProperty("--eipa-meaning-reserve");
    }
    measureQueue.add(wrapper);
  }

  function setWrapperMeaning(wrapper, meaning = "") {
    if (!(wrapper instanceof Element)) return;
    wrapper.dataset.eipaMeaningFull = normalizeMeaningText(meaning);
    applyMeaningMode(wrapper);
    refreshWrapperTitle(wrapper);
  }

  function setWrapperInference(wrapper, inference = "") {
    if (!(wrapper instanceof Element)) return;
    wrapper.dataset.eipaInference = String(inference || "").trim();
    applyMeaningMode(wrapper);
    refreshWrapperTitle(wrapper);
  }

  function setWrapperIpa(wrapper, ipa, pronunciationSource = null) {
    if (!(wrapper instanceof Element)) return;
    wrapper.dataset.eipaIpa = ipa || "";
    if (pronunciationSource != null) wrapper.dataset.eipaPronunciationSource = pronunciationSource || "";
    const label = wrapper.querySelector(":scope > .eipa-label");
    if (label) label.textContent = ipa || "";
    refreshWrapperTitle(wrapper);
    measureQueue.add(wrapper);
  }

  function textGapBetween(left, right) {
    if (!(left instanceof Element) || !(right instanceof Element) || !left.isConnected || !right.isConnected) return null;
    try {
      const range = document.createRange();
      range.setStartAfter(left);
      range.setEndBefore(right);
      return range.toString();
    } catch {
      return null;
    }
  }

  function sameRenderedLine(parts) {
    if (!Array.isArray(parts) || parts.length < 2) return false;
    try {
      const rects = parts.map((part) => part.getBoundingClientRect());
      if (rects.some((rect) => !rect.width && !rect.height)) return false;
      const top = rects[0].top;
      const tolerance = Math.max(3, rects[0].height * 0.55);
      return rects.every((rect) => Math.abs(rect.top - top) <= tolerance);
    } catch {
      return false;
    }
  }

  function logicalSurfaceForWrappers(parts) {
    if (!Array.isArray(parts) || parts.length < 2 || !sameRenderedLine(parts)) return null;
    let surface = baseTextOfWrapper(parts[0]);
    if (!surface) return null;
    for (let i = 1; i < parts.length; i += 1) {
      const gap = textGapBetween(parts[i - 1], parts[i]);
      if (gap == null || !/^[’']?$/.test(gap)) return null;
      const piece = baseTextOfWrapper(parts[i]);
      if (!piece) return null;
      surface += gap + piece;
    }
    return surface;
  }

  function clearCompoundMarkers(wrapper) {
    if (!(wrapper instanceof Element)) return;
    wrapper.classList.remove("eipa-compound-head", "eipa-compound-tail");
    wrapper.removeAttribute("data-eipa-compound-group");
    wrapper.style.removeProperty("--eipa-label-left");
  }

  function positionCompoundGroup(head, parts) {
    if (!(head instanceof Element) || !head.isConnected || !parts?.length) return;
    try {
      const firstRect = parts[0].getBoundingClientRect();
      const lastRect = parts[parts.length - 1].getBoundingClientRect();
      if (!firstRect.width || !lastRect.width) return;
      // Only offset the label when all fragments are on the same rendered line.
      if (Math.abs(firstRect.top - lastRect.top) > Math.max(firstRect.height, lastRect.height) * 0.65) return;
      const visualLeft = Math.min(firstRect.left, lastRect.left);
      const visualRight = Math.max(firstRect.right, lastRect.right);
      const center = (visualLeft + visualRight) / 2;
      head.style.setProperty("--eipa-label-left", `${Math.round((center - firstRect.left) * 10) / 10}px`);
    } catch {}
  }

  async function reconcileSplitInflections() {
    if (compoundReconcileRunning || !fullModeActive()) return;
    compoundReconcileRunning = true;
    try {
      const list = [...document.querySelectorAll('.eipa-word[data-eipa-owned="true"]')];
      // We only join words that are morphologically recognisable after concatenation.
      // This avoids joining arbitrary adjacent styled words that happen to have no literal space.
      for (let i = 0; i < list.length - 1; i += 1) {
        const head = list[i];
        if (!head.isConnected || head.classList.contains("eipa-compound-tail")) continue;

        let matched = null;
        // Try up to three DOM fragments; longest first handles e.g. watch + e + s.
        for (let length = Math.min(3, list.length - i); length >= 2; length -= 1) {
          const parts = list.slice(i, i + length);
          if (parts.some((part) => !part.isConnected || part.classList.contains("eipa-compound-head") || part.classList.contains("eipa-compound-tail"))) continue;
          const surface = logicalSurfaceForWrappers(parts);
          if (!surface || !/^[A-Za-z]+(?:[’'][A-Za-z]+)?$/.test(surface)) continue;
          const normalized = normalizeWord(surface);
          const morph = phonology?.morphologyCandidates?.(normalized) || [];
          if (!morph.length) continue;

          await lookupUserDictionaryBatch([normalized, ...morph.map((candidate) => candidate.base)]);
          const result = await resolvePronunciation({
            original: surface,
            normalized,
            userDictionaryValue: userDictCache.get(normalized) || null,
            userDictionaryMeaning: userMeaningCache.get(normalized) || null
          });
          if (!result?.ipa || result.ipa === "UNKNOWN") continue;
          matched = { parts, surface, result };
          break;
        }

        if (!matched) continue;
        const { parts, result } = matched;
        const group = `g${++compoundGroupSerial}`;
        const first = parts[0];
        first.classList.add("eipa-compound-head");
        first.dataset.eipaCompoundGroup = group;
        first.dataset.eipaCompoundSurface = matched.surface;
        setWrapperIpa(first, normalizeDisplayIpa(result.ipa), result.source || "mdx-inflection-rule");
        setWrapperMeaning(first, result.meaning || "");
        setWrapperInference(first, result.inferenceNote || "");
        first.style.setProperty("--eipa-stack-side-reserve", "0px");

        for (const tail of parts.slice(1)) {
          tail.classList.add("eipa-compound-tail");
          tail.dataset.eipaCompoundGroup = group;
          tail.dataset.eipaCompoundSurface = matched.surface;
          setWrapperIpa(tail, "", result.source || "mdx-inflection-rule");
          setWrapperMeaning(tail, "");
          setWrapperInference(tail, "");
          tail.style.setProperty("--eipa-stack-side-reserve", "0px");
        }

        requestAnimationFrame(() => positionCompoundGroup(first, parts));
        i += parts.length - 1;
      }
      scheduleMeasure();
    } catch (error) {
      console.warn("[Contextual English IPA] split-inflection reconciliation failed", error);
    } finally {
      compoundReconcileRunning = false;
    }
  }

  function scheduleCompoundReconcile() {
    if (compoundReconcileScheduled || !fullModeActive()) return;
    compoundReconcileScheduled = true;
    setTimeout(() => {
      compoundReconcileScheduled = false;
      void reconcileSplitInflections();
    }, 35);
  }

  function inferredFormNote(lemma, kind) {
    const base = String(lemma || "").trim();
    if (!base) return "";
    if (kind === "past-ed") return uiText("past", { base });
    if (kind === "progressive-ing") return uiText("progressive", { base });
    if (kind === "possessive-s") return uiText("possessive", { base });
    if (kind === "plural-s" || kind === "plural-ves") return uiText("plural", { base });
    return "";
  }

  function sameInflectionFamily(candidateKind, relationKind) {
    if (!candidateKind || !relationKind) return false;
    if (candidateKind === relationKind) return true;
    return relationKind === "plural-s" && candidateKind === "plural-ves";
  }

  function explicitRelationCandidate(word) {
    const relation = userRelationCache.get(word) || null;
    if (!relation?.base) return { relation: null, candidate: null, blocked: false };
    if (!relation.kind || !phonology?.morphologyCandidates) return { relation, candidate: null, blocked: true };
    const base = normalizeWord(relation.base);
    const candidates = phonology.morphologyCandidates(word);
    const matches = candidates.filter((candidate) =>
      candidate.base === base && sameInflectionFamily(candidate.kind, relation.kind)
    );
    if (matches.length !== 1) return { relation, candidate: null, blocked: true };
    return { relation, candidate: matches[0], blocked: false };
  }

  async function deriveByExplicitDictionaryRelation(args) {
    const selected = explicitRelationCandidate(args.normalized);
    if (!selected.relation) return { result: null, blocked: false };
    if (selected.blocked || !selected.candidate) return { result: null, blocked: true };

    const { candidate } = selected;
    await lookupUserDictionaryBatch([candidate.base]);
    const baseIpas = dictionaryPronunciations(userDictCache.get(candidate.base) || null);
    if (!baseIpas.length) return { result: null, blocked: true };
    const derived = phonology.appendInflectionAll(baseIpas, candidate.kind);
    if (!derived.length) return { result: null, blocked: true };

    return {
      blocked: false,
      result: {
        ipa: derived.join(" | "),
        meaning: args.userDictionaryMeaning || userMeaningCache.get(candidate.base) || "",
        confidence: "high",
        source: "mdx-explicit-inflection",
        pos: "",
        lemma: candidate.base,
        inflection: candidate.kind,
        // The surface entry itself supplied the lemma relation, so this is not
        // merely an inferred spelling form and needs no inference warning.
        inferenceNote: ""
      }
    };
  }

  async function deriveByMorphology(args) {
    if (!phonology?.morphologyCandidates || !phonology?.appendInflectionAll) return null;
    const candidates = phonology.morphologyCandidates(args.normalized);
    if (!candidates.length) return null;

    await lookupUserDictionaryBatch(candidates.map((candidate) => candidate.base));

    // Only derive when spelling reversal identifies one unique MDX lemma and
    // one inflection type. Never choose among different plausible lemmas.
    // If that single lemma has several pronunciations, keep every one.
    const validPairs = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const baseRaw = userDictCache.get(candidate.base) || null;
      const baseIpas = dictionaryPronunciations(baseRaw);
      if (!baseIpas.length) continue;
      const key = `${candidate.base}\u0000${candidate.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      validPairs.push({ candidate, baseIpas });
    }
    if (!validPairs.length) return null;

    // If a candidate lemma explicitly lists this surface in the MDX forward
    // form field, prefer that dictionary-authored relation over spelling alone.
    const formConfirmed = validPairs.filter((item) =>
      (userFormsCache.get(item.candidate.base) || []).includes(args.normalized)
    );
    const pool = formConfirmed.length ? formConfirmed : validPairs;

    const lemmas = [...new Set(pool.map((item) => item.candidate.base))];
    const kinds = [...new Set(pool.map((item) => item.candidate.kind))];
    if (lemmas.length !== 1 || kinds.length !== 1) return null;

    const lemma = lemmas[0];
    const kind = kinds[0];
    const baseIpas = [];
    for (const item of pool) {
      if (item.candidate.base !== lemma || item.candidate.kind !== kind) continue;
      for (const ipa of item.baseIpas) if (!baseIpas.includes(ipa)) baseIpas.push(ipa);
    }

    const derived = phonology.appendInflectionAll(baseIpas, kind);
    if (!derived.length) return null;
    return {
      ipa: derived.join(" | "),
      meaning: args.userDictionaryMeaning || userMeaningCache.get(lemma) || "",
      confidence: "high",
      source: "mdx-inflection-rule",
      pos: "",
      lemma,
      inflection: kind,
      inferenceNote: userEntryCache.get(args.normalized) === true ? "" : inferredFormNote(lemma, kind)
    };
  }

  async function resolvePronunciation(args) {
    // 1) Exact MDX surface form always wins. Display every pronunciation from
    // the MDX entry in dictionary order, with no contextual selection or IPA
    // symbol conversion.
    const exactIpa = dictionaryAll(args.userDictionaryValue);
    if (exactIpa) return { ipa: exactIpa, meaning: args.userDictionaryMeaning || "", confidence: "high", source: "user-mdx", pos: "", inferenceNote: "" };

    // 2) If the exact MDX entry explicitly identifies its lemma/form relation,
    // use that relation before spelling reversal.  The relation still has to be
    // compatible with a supported deterministic spelling/phonology rule.  If a
    // dictionary relation exists but cannot be derived safely, do not ignore it
    // and guess a different lemma.
    const explicit = await deriveByExplicitDictionaryRelation(args);
    if (explicit.result?.ipa) return explicit.result;
    if (explicit.blocked) {
      return { ipa: "UNKNOWN", meaning: args.userDictionaryMeaning || "", confidence: "low", source: "unknown", pos: "", inferenceNote: "" };
    }

    // 3) Otherwise try s/es/ves/ing/ed/'s spelling reversal.  Prefer a lemma
    // whose MDX forward-form list explicitly contains the surface; if there is
    // no such metadata, require one unique MDX lemma and inflection type.
    const morphologyResult = await deriveByMorphology(args);
    if (morphologyResult?.ipa) return morphologyResult;

    // 4) Nothing else guesses a pronunciation.
    return { ipa: "UNKNOWN", meaning: args.userDictionaryMeaning || "", confidence: "low", source: "unknown", pos: "", inferenceNote: "" };
  }

  function rangeForWordHit(node, start, end) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range;
  }

  function makeWordHit(node, match) {
    const original = match[0];
    const start = match.index;
    const end = start + original.length;
    return {
      node,
      start,
      end,
      original,
      normalized: normalizeWord(original),
      range: rangeForWordHit(node, start, end)
    };
  }

  function wordHitAtOffset(node, offset) {
    if (!(node instanceof Text) || shouldSkipTextNode(node)) return null;
    const text = node.nodeValue || "";
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, text.length));
    for (const match of wordMatches(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if ((safeOffset >= start && safeOffset < end) || (safeOffset === end && end > start)) {
        return makeWordHit(node, match);
      }
    }
    return null;
  }

  function pointInsideWordRange(range, clientX, clientY, tolerance = 1) {
    const rects = [...range.getClientRects()];
    return rects.some((rect) =>
      clientX >= rect.left - tolerance && clientX <= rect.right + tolerance &&
      clientY >= rect.top - tolerance && clientY <= rect.bottom + tolerance
    );
  }

  function composedParentElement(element) {
    if (!(element instanceof Element)) return null;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode?.();
    return root?.host instanceof Element ? root.host : null;
  }

  function pointElementStack(clientX, clientY) {
    const elements = [];
    const seenElements = new Set();
    const seenRoots = new Set();

    const addElement = (element) => {
      if (!(element instanceof Element) || seenElements.has(element) || extensionElement(element)) return;
      seenElements.add(element);
      elements.push(element);
    };

    // Modern sites often place an invisible link/card layer above the visible
    // heading. elementFromPoint() returns only that top layer. elementsFromPoint()
    // lets us inspect the whole stack at the pointer coordinate instead.
    const visitRoot = (root, depth = 0) => {
      if (!root || seenRoots.has(root) || depth > 8 || elements.length >= 48) return;
      seenRoots.add(root);

      let stack = [];
      try {
        if (typeof root.elementsFromPoint === "function") stack = root.elementsFromPoint(clientX, clientY) || [];
        else {
          const single = root.elementFromPoint?.(clientX, clientY) || null;
          if (single) stack = [single];
        }
      } catch {
        stack = [];
      }

      for (const element of stack.slice(0, 24)) {
        addElement(element);
        if (element?.shadowRoot) visitRoot(element.shadowRoot, depth + 1);
        if (elements.length >= 48) break;
      }
    };

    visitRoot(document);
    return elements;
  }

  function wordHitFromPointByRects(clientX, clientY) {
    const pointElements = pointElementStack(clientX, clientY);
    if (!pointElements.length) return null;

    // Search from the smallest element under the pointer out through its composed
    // ancestors. Do not stop at the first <a>/<h*>: overlay anchors can be empty
    // while the real visible text lives in a sibling inside the same card.
    const roots = [];
    const seenRoots = new Set();
    for (const start of pointElements) {
      let element = start;
      for (let depth = 0; element && depth < 16; depth += 1) {
        if (element === document.body || element === document.documentElement) break;
        if (!extensionElement(element) && !seenRoots.has(element)) {
          seenRoots.add(element);
          roots.push(element);
        }
        element = composedParentElement(element);
      }
    }

    let visitedNodes = 0;
    let visitedWords = 0;
    const seenTextNodes = new WeakSet();
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (seenTextNodes.has(node) || shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        seenTextNodes.add(node);
        visitedNodes += 1;
        // This path is only a fallback after the native caret APIs fail. A larger
        // budget improves compatibility with deeply nested React/Next-style cards,
        // while Range geometry below still prevents matching unrelated text.
        if (visitedNodes > 700 || visitedWords > 5000) return null;
        for (const match of wordMatches(node.nodeValue)) {
          visitedWords += 1;
          const hit = makeWordHit(node, match);
          if (pointInsideWordRange(hit.range, clientX, clientY, 6)) return hit;
          if (visitedWords > 5000) return null;
        }
      }
    }
    return null;
  }

  function wordHitFromPoint(clientX, clientY) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      try {
        const position = document.caretPositionFromPoint(clientX, clientY);
        node = position?.offsetNode || null;
        offset = position?.offset || 0;
      } catch {}
    }
    if (!(node instanceof Text) && document.caretRangeFromPoint) {
      try {
        const range = document.caretRangeFromPoint(clientX, clientY);
        node = range?.startContainer || null;
        offset = range?.startOffset || 0;
      } catch {}
    }
    if (node instanceof Text) {
      const candidates = [wordHitAtOffset(node, offset)];
      if (offset > 0) candidates.push(wordHitAtOffset(node, offset - 1));
      for (const hit of candidates) {
        if (hit && pointInsideWordRange(hit.range, clientX, clientY, 3)) return hit;
      }
    }
    return wordHitFromPointByRects(clientX, clientY);
  }

  function wordHitOverlappingRange(node, selectionStart, selectionEnd) {
    if (!(node instanceof Text) || shouldSkipTextNode(node)) return null;
    const text = node.nodeValue || "";
    const from = Math.max(0, Math.min(selectionStart, selectionEnd, text.length));
    const to = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), text.length));
    if (to <= from) return null;
    for (const match of wordMatches(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if (end > from && start < to) return makeWordHit(node, match);
    }
    return null;
  }

  function textNodesIntersectingRange(range) {
    const nodes = [];
    const add = (node) => {
      if (node instanceof Text && !nodes.includes(node)) nodes.push(node);
    };
    add(range.startContainer);
    add(range.endContainer);
    const root = range.commonAncestorContainer instanceof Text
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
    if (!root || nodes.length >= 2) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && nodes.length < 60) {
      try {
        if (range.intersectsNode(node)) add(node);
      } catch {
        // Ignore nodes that cannot be tested by this Range implementation.
      }
    }
    return nodes;
  }

  function activeDocumentSelection() {
    const candidates = [];
    try { candidates.push(window.getSelection?.()); } catch {}
    try { candidates.push(document.getSelection?.()); } catch {}

    const activeRoot = document.activeElement?.getRootNode?.();
    if (activeRoot && activeRoot !== document && typeof activeRoot.getSelection === "function") {
      try { candidates.push(activeRoot.getSelection()); } catch {}
    }

    return candidates.find((selection) =>
      selection && selection.rangeCount > 0 && !selection.isCollapsed && String(selection).trim()
    ) || null;
  }

  function demandSelectionSignature(selection = activeDocumentSelection()) {
    if (!selection) return "";
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      return [
        String(selection).trim(),
        range.startOffset,
        range.endOffset,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      ].join("|");
    } catch {
      return String(selection).trim();
    }
  }

  function wordHitFromSelection() {
    if (!settings.selectionToLookup) return null;
    const selection = activeDocumentSelection();
    if (!selection) return null;

    let range;
    try {
      range = selection.getRangeAt(0);
    } catch {
      return null;
    }

    const popupElement = demandPopup;
    if (popupElement && popupElement.contains(range.commonAncestorContainer)) return null;
    // Query the selection as a single dictionary key. Never split into tokens,
    // apply Latin-character filtering, or silently shorten long selections.
    const selected = String(selection).trim();
    if (!selected) return null;
    return { node: range.startContainer, start: range.startOffset,
      end: range.endContainer === range.startContainer ? range.endOffset : range.startOffset,
      original: selected, normalized: normalizeWord(selected), range: range.cloneRange() };
  }

  function removeDemandPopupNode() {
    clearTimeout(demandEditTimer);
    demandEditTimer = null;
    demandPopup?.remove();
    demandPopup = null;
    demandAnchorRange = null;
    demandAnchorWord = null;
    demandPopupTrigger = "";
  }

  function hideDemandPopup() {
    demandOpenRequestId += 1;
    demandRequestId += 1;
    removeDemandPopupNode();
  }

  function applyDemandPopupSelectionMode() {
    if (!demandPopup) return;
    demandPopup.classList.toggle("eipa-selectable", Boolean(settings.allowIpaSelection));
  }

  function currentDemandAnchorRange() {
    const anchor = demandAnchorWord;
    if (anchor?.node?.isConnected && anchor.node instanceof Text) {
      const length = anchor.node.nodeValue?.length || 0;
      const start = Math.max(0, Math.min(anchor.start, length));
      const end = Math.max(start, Math.min(anchor.end, length));
      if (end > start) {
        try {
          const range = document.createRange();
          range.setStart(anchor.node, start);
          range.setEnd(anchor.node, end);
          demandAnchorRange = range;
          return range;
        } catch {
          // Fall through to the last valid cloned range.
        }
      }
    }
    return demandAnchorRange;
  }

  function exactWordRect(range) {
    if (!range) return null;
    const rects = [...range.getClientRects()].filter((rect) =>
      Number.isFinite(rect.left) && Number.isFinite(rect.top) &&
      rect.width > 0.2 && rect.height > 0.2
    );
    if (rects.length) {
      // A word can be split only on unusual overflow-wrap pages. Anchor above
      // the visually first fragment rather than above the whole selection box.
      rects.sort((a, b) => Math.abs(a.top - b.top) > 1 ? a.top - b.top : a.left - b.left);
      return rects[0];
    }
    const rect = range.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function positionDemandPopup() {
    demandPositionScheduled = false;
    if (!demandPopup || !demandPopup.isConnected) return;
    const rect = exactWordRect(currentDemandAnchorRange());
    if (!rect) return;

    const popup = demandPopup;
    const anchorCenter = rect.left + rect.width / 2;
    const gap = 7;

    // Choose the requested side unless it would clip the dictionary window.
    let placeBelow = settings.demandPopupPosition !== "above";
    const popupHeight = Math.min(popup.scrollHeight || 300, Math.round(innerHeight * .72), 650);
    const belowSpace = innerHeight - rect.bottom - gap;
    const aboveSpace = rect.top - gap;
    if (placeBelow && belowSpace < popupHeight && aboveSpace > belowSpace) placeBelow = false;
    else if (!placeBelow && aboveSpace < popupHeight && belowSpace > aboveSpace) placeBelow = true;
    popup.classList.toggle("eipa-below", placeBelow);
    popup.style.setProperty("max-height", `${Math.max(110, Math.min(popupHeight, placeBelow ? belowSpace : aboveSpace))}px`, "important");
    popup.style.setProperty("visibility", "hidden", "important");
    popup.style.setProperty("left", `${anchorCenter}px`, "important");
    popup.style.setProperty("top", `${placeBelow ? rect.bottom + gap : rect.top - gap}px`, "important");
    popup.style.setProperty("--eipa-arrow-x", "50%");

    const firstRect = popup.getBoundingClientRect();
    let left = anchorCenter;
    const margin = 5;
    if (firstRect.left < margin) left += margin - firstRect.left;
    if (firstRect.right > window.innerWidth - margin) {
      left -= firstRect.right - (window.innerWidth - margin);
    }

    popup.style.setProperty("left", `${left}px`, "important");
    const finalRect = popup.getBoundingClientRect();
    const arrowX = Math.max(9, Math.min(finalRect.width - 9, anchorCenter - finalRect.left));
    popup.style.setProperty("--eipa-arrow-x", `${arrowX}px`);
    popup.style.setProperty("visibility", "visible", "important");
  }

  function scheduleDemandPosition() {
    if (demandPositionScheduled || !demandPopup) return;
    demandPositionScheduled = true;
    requestAnimationFrame(positionDemandPopup);
  }

  function renderDemandPopup(hit, result, trigger = "click") {
    removeDemandPopupNode();
    if (!hit.node.isConnected || !demandModeActive()) return;

    const popup = document.createElement("span");
    popup.className = "eipa-demand-popup";
    popup.dataset.eipaIgnore = "true";
    popup.dataset.eipaWord = hit.original;
    popup.lang = "en";
    popup.setAttribute("role", "tooltip");
    popup.title = [hit.original, sourceLabel(result.source), result.meaning || "", result.inferenceNote || ""].filter(Boolean).join(" · ");
    const ipaLine = document.createElement("span");
    ipaLine.className = "eipa-demand-ipa";
    ipaLine.textContent = normalizeDisplayIpa(result.ipa);
    popup.appendChild(ipaLine);
    if (settings.showMeaning && result.meaning) {
      const meaningLine = document.createElement("span");
      meaningLine.className = "eipa-demand-meaning";
      meaningLine.textContent = result.meaning;
      popup.appendChild(meaningLine);
    }
    if (result.inferenceNote) {
      const inferenceLine = document.createElement("span");
      inferenceLine.className = "eipa-demand-inference";
      inferenceLine.textContent = result.inferenceNote;
      popup.appendChild(inferenceLine);
    }
    (document.documentElement || document.body).appendChild(popup);
    demandPopup = popup;
    demandPopupTrigger = trigger;
    demandAnchorRange = hit.range.cloneRange();
    demandAnchorWord = { node: hit.node, start: hit.start, end: hit.end };
    applyDemandPopupSelectionMode();
    positionDemandPopup();
  }

  // A popup owns its input and result region for its entire lifetime. Refreshing
  // the results must never replace the input: its focus, caret and IME state
  // need to survive rapid and out-of-order dictionary responses.
  async function lookupPopupText(popup, query, prefetchedResponse = null) {
    if (popup !== demandPopup || !demandModeActive()) return;
    clearTimeout(demandEditTimer);
    demandEditTimer = null;
    const word = String(query || "").trim();
    const results = popup.querySelector('.eipa-dict-results');
    const requestId = ++demandRequestId;
    popup.dataset.eipaWord = word;
    popup.dataset.eipaSearched = word;
    popup.setAttribute('aria-label', word || queryText('edit'));
    results.replaceChildren();

    function notify(message) {
      if (requestId !== demandRequestId || popup !== demandPopup) return;
      results.replaceChildren();
      const notice = document.createElement('p');
      notice.className = 'eipa-dict-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = message;
      results.append(notice);
      scheduleDemandPosition();
    }

    if (!word) { notify(queryText('empty')); return; }
    notify(queryText('loading'));
    try {
      const response = prefetchedResponse || await chrome.runtime.sendMessage({ type: 'DICT_LOOKUP', word });
      if (requestId !== demandRequestId || popup !== demandPopup || !demandModeActive()) return;
      if (!response?.ok) throw new Error(response?.error || 'Unknown error');
      const entries = (response.entries || []).filter(item => item.html || item.error);
      if (!entries.length) { notify(queryText('missing')); return; }
      const rendered = await Promise.all(entries.map(async item => ({
        ...item,
        srcdoc: item.html ? await globalThis.EIPA_DICT_RENDER.documentForEntry(item) : null
      })));
      if (requestId !== demandRequestId || popup !== demandPopup || !demandModeActive()) return;
      results.replaceChildren();
      for (const item of rendered) {
        const section = document.createElement('section');
        section.className = 'eipa-dict-section';
        const label = document.createElement('div');
        label.className = 'eipa-dict-source';
        label.textContent = item.dictionaryName + (item.key && item.key !== word ? ` · ${item.key}` : '');
        section.append(label);
        if (item.srcdoc) {
          const frame = document.createElement('iframe');
          frame.className = 'eipa-dict-frame';
          frame.setAttribute('sandbox', '');
          frame.setAttribute('referrerpolicy', 'no-referrer');
          frame.title = `${item.dictionaryName}: ${item.key}`;
          frame.srcdoc = item.srcdoc;
          section.append(frame);
        } else {
          const error = document.createElement('p');
          error.className = 'eipa-dict-notice';
          error.textContent = item.error || queryText('failed');
          section.append(error);
        }
        results.append(section);
      }
      scheduleDemandPosition();
    } catch (error) {
      notify(queryText('failed') + String(error?.message || error));
    }
  }

  async function showDemandPronunciation(hit, trigger = "click") {
    if (!hit || !demandModeActive() || (trigger === 'selection' && !settings.selectionToLookup) || !hit.node?.isConnected) return;
    // If misses should stay invisible, check before creating the popup. An
    // unknown lookup must not flash a loading box and immediately disappear.
    // Reuse this response for rendering, avoiding a second dictionary read.
    hideDemandPopup();
    const openRequest = ++demandOpenRequestId;
    let firstResponse = null;
    if (!settings.showMissingPopup) {
      try {
        firstResponse = await chrome.runtime.sendMessage({ type: 'DICT_LOOKUP', word: hit.original.trim() });
      } catch (error) {
        // An actual lookup failure is different from an absent dictionary key.
        // Keep it visible so configuration and file errors are diagnosable.
        firstResponse = { ok: false, error: String(error?.message || error) };
      }
      if (openRequest !== demandOpenRequestId || !demandModeActive() || !hit.node?.isConnected ||
          (trigger === 'selection' && !settings.selectionToLookup) ||
          (trigger === 'hover' && (!settings.hoverToShow || activeDocumentSelection()))) return;
      if (firstResponse?.ok && !(firstResponse.entries || []).some(item => item.html || item.error)) return;
    }
    const popup = document.createElement('div');
    popup.className = 'eipa-demand-popup eipa-dictionary-popup eipa-selectable';
    popup.dataset.eipaIgnore = 'true';
    popup.dataset.eipaWord = hit.original;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', hit.original);

    const header = document.createElement('div');
    header.className = 'eipa-dict-header';
    const queryRow = document.createElement('div');
    queryRow.className = 'eipa-dict-query-row';
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'eipa-dict-query';
    field.value = hit.original;
    field.setAttribute('aria-label', queryText('edit'));
    field.autocomplete = 'off';
    field.autocapitalize = 'off';
    field.spellcheck = false;
    field.dir = 'auto';
    const submit = document.createElement('button');
    submit.className = 'eipa-dict-search';
    submit.type = 'button';
    submit.textContent = queryText('search');
    const close = document.createElement('button');
    close.className = 'eipa-dict-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = queryText('close');
    close.setAttribute('aria-label', queryText('close'));
    close.addEventListener('click', hideDemandPopup);
    queryRow.append(field, submit, close);

    const options = document.createElement('label');
    options.className = 'eipa-dict-options';
    const automatic = document.createElement('input');
    automatic.type = 'checkbox';
    automatic.className = 'eipa-dict-auto';
    automatic.checked = Boolean(settings.autoLookupOnEdit);
    const label = document.createElement('span');
    label.textContent = queryText('automatic');
    options.append(automatic, label);
    header.append(queryRow, options);
    const results = document.createElement('div');
    results.className = 'eipa-dict-results';
    popup.append(header, results);

    let composing = false;
    const submitEditedText = () => void lookupPopupText(popup, field.value);
    const onEdit = () => {
      // Invalidate every pending response as soon as the query changes,
      // even if auto-search is off. Do not show results for the wrong input.
      clearTimeout(demandEditTimer);
      demandEditTimer = null;
      ++demandRequestId;
      results.replaceChildren();
      const notice = document.createElement('p');
      notice.className = 'eipa-dict-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = !field.value.trim() ? queryText('empty') :
        (automatic.checked ? queryText('loading') : queryText('manual'));
      results.append(notice);
      if (automatic.checked && !composing && field.value.trim()) {
        demandEditTimer = setTimeout(submitEditedText, 350);
      }
      scheduleDemandPosition();
    };
    field.addEventListener('compositionstart', () => {
      composing = true;
      clearTimeout(demandEditTimer);
      demandEditTimer = null;
    });
    field.addEventListener('compositionend', () => { composing = false; onEdit(); });
    field.addEventListener('input', onEdit);
    field.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hideDemandPopup(); }
      if (event.key === 'Enter' && !composing && !event.isComposing) {
        event.preventDefault();
        submitEditedText();
      }
    });
    submit.addEventListener('click', submitEditedText);
    automatic.addEventListener('change', () => {
      settings.autoLookupOnEdit = automatic.checked;
      chrome.storage.sync.set({ autoLookupOnEdit: automatic.checked }).catch(error =>
        console.warn('[Local Dictionary] could not save automatic lookup setting', error));
      if (automatic.checked && field.value.trim() && field.value.trim() !== popup.dataset.eipaSearched) {
        onEdit();
      } else if (!automatic.checked) {
        clearTimeout(demandEditTimer);
        demandEditTimer = null;
        // Cancel queued auto searches, but let an already submitted lookup
        // finish if it still matches the visible query.
        if (field.value.trim() !== popup.dataset.eipaSearched) onEdit();
      }
    });
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape' && event.target !== field) {
        event.preventDefault();
        hideDemandPopup();
      }
    });
    (document.documentElement || document.body).append(popup);
    demandPopup = popup;
    demandPopupTrigger = trigger;
    demandAnchorRange = hit.range.cloneRange();
    demandAnchorWord = { node: hit.node, start: hit.start, end: hit.end };
    positionDemandPopup();
    void lookupPopupText(popup, field.value, firstResponse);
  }

  function clearDemandSelectionProbes() {
    clearTimeout(demandSelectionTimer);
    demandSelectionTimer = null;
    for (const timer of demandSelectionProbeTimers) clearTimeout(timer);
    demandSelectionProbeTimers.clear();
  }

  function showDemandFromSelection({ ignoreDismissed = false } = {}) {
    if (!demandModeActive() || !settings.selectionToLookup || demandSelectingPointer) return false;
    const selection = activeDocumentSelection();
    if (!selection) return false;
    const signature = demandSelectionSignature(selection);
    if (!ignoreDismissed && signature && (signature === dismissedDemandSelectionSignature || signature === lastDemandSelectionSignature)) return false;
    const hit = wordHitFromSelection();
    if (!hit) return false;
    lastDemandSelectionSignature = signature;
    if (signature !== dismissedDemandSelectionSignature) dismissedDemandSelectionSignature = "";
    clearDemandSelectionProbes();
    void showDemandPronunciation(hit, "selection");
    return true;
  }

  function scheduleDemandSelectionProbes(delays = [0, 70, 160, 320, 650, 1100, 1700, 2400]) {
    if (!demandModeActive() || !settings.selectionToLookup || demandSelectingPointer) return;
    clearDemandSelectionProbes();

    for (const delay of delays) {
      const timer = setTimeout(() => {
        demandSelectionProbeTimers.delete(timer);
        if (!demandModeActive()) return;
        showDemandFromSelection();
      }, delay);
      demandSelectionProbeTimers.add(timer);
    }
  }

  function startDemandSelectionWatch() {
    if (demandSelectionWatchTimer) return;
    demandSelectionWatchTimer = setInterval(() => {
      if (!demandModeActive() || !settings.selectionToLookup || demandSelectingPointer || document.visibilityState === "hidden") return;
      const selection = activeDocumentSelection();
      if (!selection) {
        lastDemandSelectionSignature = "";
        return;
      }
      const signature = demandSelectionSignature(selection);
      if (!signature || signature === lastDemandSelectionSignature || signature === dismissedDemandSelectionSignature) return;
      showDemandFromSelection();
    }, 180);
  }

  function clearDemandHoverTimer() {
    clearTimeout(demandHoverTimer);
    demandHoverTimer = null;
  }

  function sameDemandWord(hit) {
    return Boolean(hit && demandAnchorWord && hit.node === demandAnchorWord.node && hit.start === demandAnchorWord.start && hit.end === demandAnchorWord.end);
  }

  function handleDemandPointerMove(event) {
    if (!demandModeActive() || !settings.hoverToShow || event.pointerType === "touch") return;
    if (demandPopup?.contains(event.target)) return;
    if (activeDocumentSelection()) return;
    const x = event.clientX;
    const y = event.clientY;
    ++demandOpenRequestId;
    clearDemandHoverTimer();
    demandHoverTimer = setTimeout(() => {
      demandHoverTimer = null;
      if (!demandModeActive() || !settings.hoverToShow || activeDocumentSelection()) return;
      const hit = wordHitFromPoint(x, y);
      if (!hit) {
        if (demandPopupTrigger === "hover") hideDemandPopup();
        return;
      }
      if (demandPopup && sameDemandWord(hit)) return;
      void showDemandPronunciation(hit, "hover");
    }, 90);
  }

  function handleDemandPointerOut(event) {
    if (!settings.hoverToShow || event.relatedTarget != null) return;
    clearDemandHoverTimer();
    ++demandOpenRequestId;
    if (demandPopupTrigger === "hover") hideDemandPopup();
  }

  function clearDemandTouchHold() {
    clearTimeout(demandTouchHoldTimer);
    demandTouchHoldTimer = null;
  }

  function showDemandFromRememberedTouch() {
    if (!demandModeActive() || !demandTouchPoint || demandTouchMoved) return false;
    // Do not let the touch fallback bypass the selection-lookup switch.
    if (!settings.selectionToLookup && activeDocumentSelection()) return false;
    if (showDemandFromSelection()) return true;
    const hit = wordHitFromPoint(demandTouchPoint.x, demandTouchPoint.y);
    if (!hit) return false;
    void showDemandPronunciation(hit, "touch");
    return true;
  }

  function handleDemandPointerDown(event) {
    if (!demandModeActive()) return;
    if (demandPopup && demandPopup.contains(event.target)) return;
    demandSelectingPointer = true;
    dismissedDemandSelectionSignature = demandSelectionSignature();
    clearDemandSelectionProbes();
    hideDemandPopup();
  }

  function handleDemandPointerUp(event) {
    demandSelectingPointer = false;
    if (!demandModeActive() || event.button > 0) return;
    if (demandPopup && demandPopup.contains(event.target)) return;
    const clientX = event.clientX;
    const clientY = event.clientY;

    if (settings.selectionToLookup) scheduleDemandSelectionProbes([60, 150, 300, 600, 1000, 1600, 2400]);
    setTimeout(() => {
      if (!demandModeActive()) return;
      if (settings.selectionToLookup && showDemandFromSelection()) return;
      if (activeDocumentSelection()) return;
      const hit = wordHitFromPoint(clientX, clientY);
      if (hit) void showDemandPronunciation(hit);
    }, 0);
  }

  function handleDemandTouchStart(event) {
    if (!demandModeActive() || demandPopup?.contains(event.target)) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    demandTouchPoint = { x: touch.clientX, y: touch.clientY };
    demandTouchMoved = false;
    clearDemandTouchHold();
    demandTouchHoldTimer = setTimeout(() => {
      demandTouchHoldTimer = null;
      showDemandFromRememberedTouch();
      if (settings.selectionToLookup) scheduleDemandSelectionProbes([80, 200, 420, 760, 1200, 1800, 2600]);
    }, 480);
  }

  function handleDemandTouchMove(event) {
    if (!demandTouchPoint) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    if (Math.hypot(touch.clientX - demandTouchPoint.x, touch.clientY - demandTouchPoint.y) > 14) {
      demandTouchMoved = true;
      clearDemandTouchHold();
    }
  }

  function handleDemandTouchEnd() {
    if (!demandModeActive()) return;
    clearDemandTouchHold();
    if (settings.selectionToLookup) scheduleDemandSelectionProbes([0, 80, 180, 360, 700, 1200, 1800, 2600]);
    setTimeout(showDemandFromRememberedTouch, 40);
  }

  function handleDemandTouchCancel() {
    clearDemandTouchHold();
    demandTouchPoint = null;
    demandTouchMoved = false;
  }

  function handleDemandContextMenu() {
    if (!demandModeActive()) return;
    showDemandFromRememberedTouch();
    if (settings.selectionToLookup) scheduleDemandSelectionProbes([0, 80, 180, 360, 700, 1200, 1800, 2600]);
  }

  function handleDemandSelectionChange() {
    if (!demandModeActive() || !settings.selectionToLookup || demandSelectingPointer) return;
    const selection = activeDocumentSelection();
    if (!selection) return;
    const signature = demandSelectionSignature(selection);
    if (signature && signature !== dismissedDemandSelectionSignature) {
      scheduleDemandSelectionProbes([0, 50, 120, 260, 520, 900, 1500]);
    }
  }

  function handleDemandSelectStart() {
    if (!demandModeActive() || !settings.selectionToLookup || demandSelectingPointer) return;
    scheduleDemandSelectionProbes([100, 240, 480, 850, 1400, 2200]);
  }

  function createSelectableLabel(wrapper) {
    if (!settings.allowIpaSelection || wrapper.querySelector(":scope > .eipa-label")) return;
    const label = document.createElement("span");
    label.className = "eipa-label";
    label.dataset.eipaIgnore = "true";
    label.setAttribute("aria-hidden", "true");
    label.textContent = wrapper.dataset.eipaIpa || "";
    wrapper.appendChild(label);
  }

  function applySelectionMode(wrapper) {
    if (!wrapper?.isConnected) return;
    wrapper.classList.toggle("eipa-selectable", Boolean(settings.allowIpaSelection));
    if (settings.allowIpaSelection) createSelectableLabel(wrapper);
    else wrapper.querySelector(":scope > .eipa-label")?.remove();
  }

  function createWordWrapper(source, ipa, confidence, pronunciationSource = "", meaning = "", inferenceNote = "") {
    const wrapper = document.createElement("span");
    wrapper.className = "eipa-word";
    wrapper.dataset.eipaOwned = "true";
    wrapper.dataset.eipaSource = source;
    wrapper.dataset.eipaIpa = ipa;
    wrapper.dataset.eipaAtomicIpa = ipa;
    wrapper.dataset.eipaConfidence = confidence || "low";
    wrapper.dataset.eipaPronunciationSource = pronunciationSource || "";
    wrapper.dataset.eipaMeaningFull = normalizeMeaningText(meaning);
    wrapper.dataset.eipaInference = String(inferenceNote || "").trim();
    wrapper.dataset.eipaMeaning = "";
    wrapper.lang = "en";
    wrapper.textContent = source;
    applySelectionMode(wrapper);
    applyMeaningMode(wrapper);
    refreshWrapperTitle(wrapper);
    wrappers.add(wrapper);
    measureQueue.add(wrapper);
    return wrapper;
  }

  function wrapTextNode(node, originalText, items) {
    if (!items.length || !node.isConnected || node.nodeValue !== originalText || shouldSkipTextNode(node)) return false;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const item of items) {
      if (item.start > cursor) fragment.appendChild(document.createTextNode(originalText.slice(cursor, item.start)));
      fragment.appendChild(createWordWrapper(originalText.slice(item.start, item.end), item.ipa, item.confidence, item.source, item.meaning || "", item.inferenceNote || ""));
      cursor = item.end;
    }
    if (cursor < originalText.length) fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
    node.replaceWith(fragment);
    return true;
  }

  async function analyzeTextNodes(nodes, currentGeneration) {
    const validNodes = nodes.filter((node) =>
      currentGeneration === generation && node.isConnected && !shouldSkipTextNode(node)
    );
    if (!validNodes.length) return;

    const nodeMatches = new Map();
    const neededUserWords = new Set();
    const plans = [];

    for (const node of validNodes) {
      const originalText = node.nodeValue || "";
      WORD_RE.lastIndex = 0;
      const matches = [...originalText.matchAll(WORD_RE)];
      if (!matches.length) continue;
      nodeMatches.set(node, { originalText, matches });
      for (const match of matches) {
        const word = normalizeWord(match[0]);
        neededUserWords.add(word);
        for (const base of morphologyLookupWords(word)) neededUserWords.add(base);
      }
    }

    await lookupUserDictionaryBatch([...neededUserWords]);
    if (currentGeneration !== generation || !fullModeActive()) return;

    for (const node of validNodes) {
      if (currentGeneration !== generation || !node.isConnected || shouldSkipTextNode(node)) continue;
      const info = nodeMatches.get(node);
      if (!info || node.nodeValue !== info.originalText) continue;
      const items = [];
      for (const match of info.matches) {
        const original = match[0];
        const start = match.index;
        const end = start + original.length;
        const normalized = normalizeWord(original);
        const result = await resolvePronunciation({
          original,
          normalized,
          userDictionaryValue: userDictCache.get(normalized) || null,
          userDictionaryMeaning: userMeaningCache.get(normalized) || null
        });
        items.push({
          start,
          end,
          ipa: normalizeDisplayIpa(result?.ipa || "UNKNOWN"),
          confidence: result?.confidence || "low",
          source: result?.source || "unknown",
          meaning: result?.meaning || "",
          inferenceNote: result?.inferenceNote || ""
        });
      }
      if (items.length) plans.push({ node, originalText: info.originalText, items });
    }

    if (!plans.length || currentGeneration !== generation || !fullModeActive()) return;
    mutating = true;
    observer?.disconnect();
    try {
      for (const plan of plans) {
        if (currentGeneration !== generation || !fullModeActive()) break;
        annotateNode(plan.node, plan.originalText, plan.items);
      }
    } finally {
      mutating = false;
      if (fullModeActive()) restartObserver();
      scheduleMeasure();
      scheduleCompoundReconcile();
    }
  }

  function makeDiscoveryTask(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      return { root, single: root, used: false, nodes: [] };
    }
    if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(root.nodeType)) return null;
    if (root.nodeType === Node.ELEMENT_NODE && (extensionElement(root) || SKIP_TAGS.has(root.tagName))) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipTextNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    return { root, walker, nodes: [] };
  }

  function queueRoot(root, urgent = false) {
    if (!fullModeActive() || !root || !root.isConnected || extensionElement(root)) return;
    if (queuedRoots.has(root)) return;
    const task = makeDiscoveryTask(root);
    if (!task) return;
    queuedRoots.add(root);
    discoveryQueue.push(task);
    scheduleScan(urgent);
  }

  function finishDiscoveryTask(task) {
    queuedRoots.delete(task.root);
    for (let index = 0; index < task.nodes.length; index += 70) {
      analysisQueue.push(task.nodes.slice(index, index + 70));
    }
  }

  function cancelScheduledScan() {
    if (!scanScheduled) return;
    if (scanScheduleHandle != null) {
      if (scanScheduleKind === "idle" && "cancelIdleCallback" in window) cancelIdleCallback(scanScheduleHandle);
      else clearTimeout(scanScheduleHandle);
    }
    scanScheduled = false;
    scanScheduleHandle = null;
    scanScheduleKind = "";
  }

  function scheduleScan(urgent = false) {
    if (!fullModeActive() || scanRunning || (!discoveryQueue.length && !analysisQueue.length)) return;

    // A foreground/just-visible page may already have an idle scan queued from
    // while it was backgrounded. Promote that pending scan instead of waiting
    // for a throttled requestIdleCallback.
    if (scanScheduled) {
      if (!urgent || scanScheduleKind === "urgent") return;
      cancelScheduledScan();
    }

    scanScheduled = true;
    const callback = () => {
      scanScheduled = false;
      scanScheduleHandle = null;
      scanScheduleKind = "";
      void runScanSlice();
    };

    if (urgent) {
      scanScheduleKind = "urgent";
      scanScheduleHandle = setTimeout(callback, 0);
    } else if ("requestIdleCallback" in window) {
      scanScheduleKind = "idle";
      scanScheduleHandle = requestIdleCallback(callback, { timeout: 250 });
    } else {
      scanScheduleKind = "timer";
      scanScheduleHandle = setTimeout(callback, 20);
    }
  }

  async function runScanSlice() {
    if (scanRunning || !fullModeActive()) return;
    scanRunning = true;
    const currentGeneration = generation;
    const started = performance.now();

    try {
      while (discoveryQueue.length && performance.now() - started < 8) {
        const task = discoveryQueue[0];
        let node = null;
        if (task.single) {
          if (!task.used) {
            task.used = true;
            node = task.single;
          }
        } else {
          node = task.walker.nextNode();
        }

        if (!node) {
          discoveryQueue.shift();
          finishDiscoveryTask(task);
          continue;
        }
        if (!shouldSkipTextNode(node)) {
          task.nodes.push(node);
          // Do not wait for the entire document tree before producing the first
          // visible annotations. Feed completed chunks into analysis as discovery
          // progresses, which is especially important on large pages.
          if (task.nodes.length >= 70) analysisQueue.push(task.nodes.splice(0, 70));
        }
      }

      if (analysisQueue.length && currentGeneration === generation) {
        const batch = analysisQueue.shift();
        await analyzeTextNodes(batch, currentGeneration);
      }
    } catch (error) {
      console.warn("[Contextual English IPA] scan failed", error);
    } finally {
      scanRunning = false;
      if (fullModeActive() && (discoveryQueue.length || analysisQueue.length)) scheduleScan();
    }
  }

  function scheduleMeasure() {
    if (measureScheduled || !fullModeActive() || !measureQueue.size) return;
    measureScheduled = true;
    requestAnimationFrame(measureBatch);
  }

  function textWidthForStyle(style, text) {
    if (!text) return 0;
    measureCanvas ||= document.createElement("canvas");
    const context = measureCanvas.getContext("2d");
    if (!context) return 0;
    const font = style.font && style.font !== ""
      ? style.font
      : `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${style.fontFamily || "sans-serif"}`;
    context.font = font;
    let width = context.measureText(text).width;
    const spacing = Number.parseFloat(style.letterSpacing);
    if (Number.isFinite(spacing) && Array.from(text).length > 1) {
      width += spacing * (Array.from(text).length - 1);
    }
    return width;
  }

  function updateStackSideReserve(wrapper) {
    if (!(wrapper instanceof Element) || !wrapper.isConnected) return;
    const source = wrapper.dataset.eipaSource || baseTextOfWrapper(wrapper);
    const ipa = wrapper.dataset.eipaIpa || "";
    if (wrapper.classList.contains("eipa-compound-head") || wrapper.classList.contains("eipa-compound-tail")) {
      wrapper.style.setProperty("--eipa-stack-side-reserve", "0px");
      return;
    }
    if (!source || !ipa) {
      wrapper.style.removeProperty("--eipa-stack-side-reserve");
      return;
    }
    try {
      const sourceStyle = getComputedStyle(wrapper);
      const selectableLabel = wrapper.querySelector(":scope > .eipa-label");
      const labelStyle = selectableLabel
        ? getComputedStyle(selectableLabel)
        : getComputedStyle(wrapper, "::before");
      const sourceWidth = textWidthForStyle(sourceStyle, source);
      let annotationWidth = textWidthForStyle(labelStyle, ipa);
      const chromeWidth = [
        labelStyle.paddingLeft, labelStyle.paddingRight,
        labelStyle.borderLeftWidth, labelStyle.borderRightWidth
      ].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      if (settings.showMeaning && wrapper.dataset.eipaMeaning) {
        const meaningStyle = getComputedStyle(wrapper, "::after");
        // The visible meaning line is intentionally capped so enabling meanings
        // does not explode normal paragraph layout.
        const meaningWidth = Math.min(220, ...wrapper.dataset.eipaMeaning.split("\n").filter(Boolean).map((line) => textWidthForStyle(meaningStyle, line)));
        annotationWidth = Math.max(annotationWidth, meaningWidth);
      }
      const sideReserve = Math.max(0, (annotationWidth + chromeWidth - sourceWidth) / 2 + 1);
      wrapper.style.setProperty("--eipa-stack-side-reserve", `${Math.ceil(sideReserve * 10) / 10}px`);
    } catch {
      wrapper.style.removeProperty("--eipa-stack-side-reserve");
    }
  }

  function measureBatch() {
    measureScheduled = false;
    if (!fullModeActive()) return;
    const batch = [...measureQueue].slice(0, 240);
    for (const wrapper of batch) measureQueue.delete(wrapper);

    for (const wrapper of batch) {
      if (!wrapper.isConnected) {
        wrappers.delete(wrapper);
        continue;
      }
      updateStackSideReserve(wrapper);
    }
    if (measureQueue.size) scheduleMeasure();
  }

  function queueAllForMeasure() {
    for (const wrapper of wrappers) {
      if (wrapper.isConnected) measureQueue.add(wrapper);
      else wrappers.delete(wrapper);
    }
    scheduleMeasure();
  }

  function applyRootVisualSettings() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle("eipa-inline-enabled", fullModeActive());
    root.classList.toggle("eipa-demand-enabled", demandModeActive());
    root.style.setProperty("--eipa-color", settings.color || DEFAULTS.color);
    const fontPercent = Number(settings.fontSize || DEFAULTS.fontSize);
    root.style.setProperty("--eipa-font-size", `${fontPercent}%`);
    root.style.setProperty("--eipa-demand-font-size", `${Math.max(11, Math.min(21, Math.round(fontPercent * 0.24)))}px`);
  }

  function scheduleSelectionModeUpdate() {
    if (selectionUpdateScheduled) return;
    selectionUpdateScheduled = true;
    const list = [...wrappers];
    let index = 0;
    const step = () => {
      const end = Math.min(index + 250, list.length);
      mutating = true;
      observer?.disconnect();
      for (; index < end; index += 1) {
        const wrapper = list[index];
        if (wrapper.isConnected) {
          applySelectionMode(wrapper);
          measureQueue.add(wrapper);
        } else wrappers.delete(wrapper);
      }
      mutating = false;
      restartObserver();
      if (index < list.length) {
        if ("requestIdleCallback" in window) requestIdleCallback(step, { timeout: 200 });
        else setTimeout(step, 16);
      } else {
        selectionUpdateScheduled = false;
        scheduleMeasure();
      }
    };
    step();
  }

  function baseTextOfWrapper(wrapper) {
    let text = "";
    for (const child of wrapper.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue || "";
      else if (!(child instanceof Element && (child.classList.contains("eipa-label") || child.classList.contains("eipa-inference-note")))) text += child.textContent || "";
    }
    return text || wrapper.dataset.eipaSource || "";
  }

  function unwrapWrapper(wrapper, useCurrentText = false) {
    if (!(wrapper instanceof Element) || !wrapper.parentNode) return null;
    const parent = wrapper.parentElement;
    const textNode = document.createTextNode(useCurrentText ? baseTextOfWrapper(wrapper) : (wrapper.dataset.eipaSource || baseTextOfWrapper(wrapper)));
    wrapper.replaceWith(textNode);
    wrappers.delete(wrapper);
    if (parent) parent.normalize();
    return textNode;
  }

  function removeAllAnnotations() {
    mutating = true;
    observer?.disconnect();
    const parents = new Set();
    document.querySelectorAll('.eipa-word[data-eipa-owned="true"]').forEach((wrapper) => {
      const parent = wrapper.parentElement;
      if (parent) parents.add(parent);
      unwrapWrapper(wrapper, true);
    });
    parents.forEach((parent) => parent.normalize());
    wrappers.clear();
    measureQueue.clear();
    mutating = false;
  }

  function resetQueues() {
    discoveryQueue = [];
    analysisQueue = [];
    cancelScheduledScan();
  }

  function fullRescan() {
    if (!fullModeActive()) return;
    generation += 1;
    resetQueues();
    removeAllAnnotations();
    applyRootVisualSettings();
    restartObserver();
    if (settings.enabled) queueRoot(document.body || document.documentElement);
  }

  function restartObserver() {
    observer?.disconnect();
    observer = null;
    if (!fullModeActive() || !settings.observeChanges || !document.documentElement || mutating) return;

    observer = new MutationObserver((mutations) => {
      if (mutating || !fullModeActive()) return;
      const repaired = new Set();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const label = mutation.target.parentElement?.closest?.(".eipa-label");
          if (label) continue;
          const wrapper = mutation.target.parentElement?.closest?.('.eipa-word[data-eipa-owned="true"]');
          if (wrapper) {
            if (!repaired.has(wrapper)) {
              repaired.add(wrapper);
              mutating = true;
              observer?.disconnect();
              const node = unwrapWrapper(wrapper, true);
              mutating = false;
              restartObserver();
              if (node) queueRoot(node);
            }
          } else {
            queueRoot(mutation.target);
          }
          continue;
        }

        const targetWrapper = mutation.target instanceof Element
          ? mutation.target.closest?.('.eipa-word[data-eipa-owned="true"]')
          : mutation.target.parentElement?.closest?.('.eipa-word[data-eipa-owned="true"]');
        if (targetWrapper && ![...mutation.addedNodes].every((node) => node instanceof Element && (node.classList.contains("eipa-label") || node.classList.contains("eipa-inference-note")))) {
          if (!repaired.has(targetWrapper)) {
            repaired.add(targetWrapper);
            mutating = true;
            observer?.disconnect();
            const node = unwrapWrapper(targetWrapper, true);
            mutating = false;
            restartObserver();
            if (node) queueRoot(node);
          }
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node instanceof Element && (node.classList.contains("eipa-word") || node.classList.contains("eipa-label") || node.classList.contains("eipa-inference-note"))) continue;
          queueRoot(node);
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  }

  function scheduleInitialScan() {
    if (!fullModeActive()) return;
    applyRootVisualSettings();
    queueRoot(document.body || document.documentElement, true);
  }

  function startLifecycleScanning() {
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    document.addEventListener("DOMContentLoaded", scheduleInitialScan, { once: true });
    window.addEventListener("load", scheduleInitialScan, { once: true });
    window.addEventListener("pageshow", scheduleInitialScan);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !fullModeActive()) return;
      // Background tabs can have requestIdleCallback heavily throttled. On return,
      // promote pending work and immediately discover any DOM changes made while hidden.
      queueRoot(document.body || document.documentElement, true);
      scheduleScan(true);
    });
    window.addEventListener("popstate", () => queueRoot(document.body || document.documentElement, true));
    window.addEventListener("hashchange", () => queueRoot(document.body || document.documentElement, true));
    window.addEventListener("resize", queueAllForMeasure, { passive: true });
    document.addEventListener("pointermove", handleDemandPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerout", handleDemandPointerOut, true);
    document.addEventListener("pointerdown", handleDemandPointerDown, true);
    document.addEventListener("pointerup", handleDemandPointerUp, true);
    document.addEventListener("pointercancel", () => { demandSelectingPointer = false; });
    window.addEventListener("blur", () => { demandSelectingPointer = false; });
    document.addEventListener("touchstart", handleDemandTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", handleDemandTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", handleDemandTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", handleDemandTouchCancel, { capture: true, passive: true });
    document.addEventListener("contextmenu", handleDemandContextMenu, true);
    document.addEventListener("selectstart", handleDemandSelectStart, true);
    document.addEventListener("selectionchange", handleDemandSelectionChange);
    startDemandSelectionWatch();
    window.addEventListener("scroll", scheduleDemandPosition, { passive: true, capture: true });
    window.addEventListener("resize", scheduleDemandPosition, { passive: true });
    document.fonts?.ready?.then(queueAllForMeasure).catch(() => {});

    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      queueRoot(document.body || document.documentElement, true);
    }, 1200);

    setInterval(() => {
      for (const wrapper of wrappers) {
        if (!wrapper.isConnected) wrappers.delete(wrapper);
      }
    }, 30000);
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get(DEFAULTS);
    settings = { ...DEFAULTS, ...stored, onDemandMode: true, allowIpaSelection: true };
    applyRootVisualSettings();
    restartObserver();
    startLifecycleScanning();
    if (document.readyState === "loading") return;
    scheduleInitialScan();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.userDictionaryRevision || changes.userDictionaryEnabled)) {
      userDictCache.clear();
      userMeaningCache.clear();
      userEntryCache.clear();
      userRelationCache.clear();
      userFormsCache.clear();
      generation += 1;
      if (fullModeActive()) {
        unwrapAll({ useCurrentText: true });
        queueRoot(document.body || document.documentElement, true);
      }
      return;
    }
    if (areaName !== "sync") return;
    let enabledChanged = false;
    let observerChanged = false;
    let fontChanged = false;
    let selectionChanged = false;
    let modeChanged = false;
    let demandPositionChanged = false;
    let meaningChanged = false;
    let hoverChanged = false;
    let selectionLookupChanged = false;
    let languageChanged = false;

    for (const [key, change] of Object.entries(changes)) {
      if (key === 'onDemandMode' || key === 'allowIpaSelection') continue;
      settings[key] = change.newValue;
      if (key === "enabled") enabledChanged = true;
      else if (key === "observeChanges") observerChanged = true;
      else if (key === "fontSize") fontChanged = true;
      else if (key === "allowIpaSelection") selectionChanged = true;
      else if (key === "onDemandMode") modeChanged = true;
      else if (key === "demandPopupPosition") demandPositionChanged = true;
      else if (key === "showMeaning") meaningChanged = true;
      else if (key === "hoverToShow") hoverChanged = true;
      else if (key === "selectionToLookup") selectionLookupChanged = true;
      else if (key === "uiLanguage") languageChanged = true;
    }

    applyRootVisualSettings();

    if (languageChanged) {
      generation += 1;
      hideDemandPopup();
      if (fullModeActive()) {
        unwrapAll({ useCurrentText: true });
        resetQueues();
        queueRoot(document.body || document.documentElement, true);
      }
    }

    if (enabledChanged || modeChanged) {
      generation += 1;
      resetQueues();
      observer?.disconnect();
      removeAllAnnotations();
      hideDemandPopup();
      clearDemandSelectionProbes();
      clearDemandTouchHold();
      demandTouchPoint = null;
      demandTouchMoved = false;
      lastDemandSelectionSignature = "";
      dismissedDemandSelectionSignature = "";
      applyRootVisualSettings();
      if (fullModeActive()) {
        restartObserver();
        scheduleInitialScan();
      }
      return;
    }

    if (changes.showMissingPopup) {
      // Switching miss policy invalidates pending requests and allows a selected
      // phrase that was previously hidden to be queried under the new policy.
      ++demandOpenRequestId;
      lastDemandSelectionSignature = '';
      dismissedDemandSelectionSignature = '';
    }

    if (changes.autoLookupOnEdit && demandPopup?.classList.contains('eipa-dictionary-popup')) {
      const checkbox = demandPopup.querySelector('.eipa-dict-auto');
      if (checkbox) checkbox.checked = Boolean(settings.autoLookupOnEdit);
      // A setting changed from another tab or the extension menu: stop a
      // previously scheduled auto-search immediately when turned off.
      if (!settings.autoLookupOnEdit) {
        const wasQueued = demandEditTimer !== null;
        clearTimeout(demandEditTimer);
        demandEditTimer = null;
        if (wasQueued) {
          const results = demandPopup.querySelector('.eipa-dict-results');
          results.replaceChildren();
          const notice = document.createElement('p');
          notice.className = 'eipa-dict-notice';
          notice.textContent = queryText('manual');
          results.append(notice);
        }
      }
    }
    if (selectionLookupChanged) {
      // Invalidate any lookup started before the user disabled selection mode.
      demandRequestId += 1;
      clearDemandSelectionProbes();
      lastDemandSelectionSignature = "";
      dismissedDemandSelectionSignature = "";
      if (!settings.selectionToLookup && demandPopupTrigger === "selection") hideDemandPopup();
    }
    if (hoverChanged && !settings.hoverToShow) {
      ++demandOpenRequestId;
      if (demandPopupTrigger === "hover") hideDemandPopup();
    }
    if (meaningChanged) {
      for (const wrapper of wrappers) if (wrapper.isConnected) applyMeaningMode(wrapper);
      hideDemandPopup();
      scheduleMeasure();
    }
    if (observerChanged && fullModeActive()) restartObserver();
    if (fontChanged) {
      if (fullModeActive()) queueAllForMeasure();
      scheduleDemandPosition();
    }
    if (selectionChanged) {
      if (fullModeActive()) scheduleSelectionModeUpdate();
      applyDemandPopupSelectionMode();
    }
    if (demandPositionChanged) scheduleDemandPosition();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EIPA_RESCAN") {
      if (fullModeActive()) fullRescan();
      sendResponse({ ok: true });
    }
    return false;
  });

  loadSettings().catch((error) => console.error("[Contextual English IPA] initialization failed", error));
})();
