(() => {
  "use strict";

  const SIBILANTS = ["tʃ", "dʒ", "ʃ", "ʒ", "s", "z"];
  const S_VOICELESS = ["tʃ", "ʃ", "θ", "p", "t", "k", "f", "s"];
  const ED_VOICELESS = ["tʃ", "ʃ", "θ", "p", "k", "f", "s"];

  function display(value) {
    let text = String(value || "").trim();
    if (text === "UNKNOWN") return text;
    return text.replace(/^\s*[\[/]\s*/, "").replace(/\s*[\]/]\s*$/, "").trim();
  }

  function phoneticTail(value) {
    let text = display(value)
      .replace(/[ˈˌ.·\s]/g, "")
      .replace(/:/g, "")
      .replace(/\(r\)$/i, "r")
      .replace(/[()]/g, "");
    for (const token of ["tʃ", "dʒ"].concat(SIBILANTS)) {
      if (text.endsWith(token)) return token;
    }
    const match = text.match(/.$/u);
    return match ? match[0] : "";
  }

  function suffixForS(baseIpa) {
    const last = phoneticTail(baseIpa);
    if (!last) return "";
    if (SIBILANTS.includes(last)) return "ɪz";
    if (S_VOICELESS.includes(last)) return "s";
    return "z";
  }

  function suffixForEd(baseIpa) {
    const last = phoneticTail(baseIpa);
    if (!last) return "";
    if (last === "t" || last === "d") return "ɪd";
    if (ED_VOICELESS.includes(last)) return "t";
    return "d";
  }

  function appendInflection(baseIpa, kind) {
    const rawBase = display(baseIpa);
    if (!rawBase || rawBase === "UNKNOWN") return "";

    // Oxford-style headwords may end in (r): the r is absent before a
    // consonantal suffix, but becomes an ordinary pronounced r before -ing.
    // This is generated natively; it is not a rhotic-US -> British conversion.
    const consonantSuffixBase = rawBase.replace(/\(r\)$/i, "");
    const vowelSuffixBase = rawBase.replace(/\(r\)$/i, "r");

    if (kind === "plural-s" || kind === "possessive-s") {
      const suffix = suffixForS(rawBase);
      return suffix ? consonantSuffixBase + suffix : "";
    }
    if (kind === "plural-ves") {
      // knife -> knives, wolf -> wolves, wife -> wives: the written -ves
      // corresponds to stem-final /f/ voicing to /v/ plus plural /z/.
      if (phoneticTail(rawBase) !== "f" || !consonantSuffixBase.endsWith("f")) return "";
      return consonantSuffixBase.slice(0, -1) + "vz";
    }
    if (kind === "past-ed") {
      const suffix = suffixForEd(rawBase);
      return suffix ? consonantSuffixBase + suffix : "";
    }
    if (kind === "progressive-ing") return vowelSuffixBase + "ɪŋ";
    return "";
  }

  function appendInflectionAll(baseIpas, kind) {
    const values = Array.isArray(baseIpas) ? baseIpas : [baseIpas];
    const out = [];
    for (const baseIpa of values) {
      const ipa = appendInflection(baseIpa, kind);
      if (ipa && !out.includes(ipa)) out.push(ipa);
    }
    return out;
  }

  function add(out, seen, base, kind) {
    if (!base || base.length < 1) return;
    const key = `${base}\u0000${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ base, kind });
  }

  function morphologyCandidates(rawWord) {
    const word = String(rawWord || "").toLowerCase().replaceAll("’", "'");
    const out = [];
    const seen = new Set();
    if (!/^[a-z]+(?:'[a-z]+)?$/.test(word) || word.length < 3) return out;

    // Possessive 's and plural possessive s'.
    if (word.endsWith("'s") && word.length > 2) add(out, seen, word.slice(0, -2), "possessive-s");
    if (word.endsWith("s'") && word.length > 2) add(out, seen, word.slice(0, -1), "possessive-s");

    // -ing: only propose orthodox spelling reversals; the MDX must confirm the lemma.
    if (word.endsWith("ing") && word.length >= 5) {
      const stem = word.slice(0, -3);
      if (word.endsWith("cking") && word.length > 6) add(out, seen, word.slice(0, -4), "progressive-ing");
      add(out, seen, stem, "progressive-ing");
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(out, seen, stem.slice(0, -1), "progressive-ing");
      if (stem.endsWith("y") && stem.length > 1) add(out, seen, stem.slice(0, -1) + "ie", "progressive-ing");
      add(out, seen, stem + "e", "progressive-ing");
    }

    // Regular -ed.
    if (word.endsWith("ied") && word.length >= 4) add(out, seen, word.slice(0, -3) + "y", "past-ed");
    if (word.endsWith("ed") && word.length >= 4) {
      const stem = word.slice(0, -2);
      if (word.endsWith("cked") && word.length > 5) add(out, seen, word.slice(0, -3), "past-ed");
      add(out, seen, stem + "e", "past-ed");
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(out, seen, stem.slice(0, -1), "past-ed");
      add(out, seen, stem, "past-ed");
    }

    // Plural / 3sg -s/-es.
    // -ves is kept as a distinct kind because knife -> knives and wolf -> wolves
    // involve /f/ -> /v/ as well as the plural ending.
    if (!word.includes("'") && word.endsWith("ves") && word.length > 4) {
      const stem = word.slice(0, -3);
      add(out, seen, stem + "f", "plural-ves");
      add(out, seen, stem + "fe", "plural-ves");
    }
    if (!word.includes("'") && word.endsWith("ies") && word.length > 4) add(out, seen, word.slice(0, -3) + "y", "plural-s");
    if (!word.includes("'") && word.endsWith("es") && word.length > 3) {
      add(out, seen, word.slice(0, -2), "plural-s");
      add(out, seen, word.slice(0, -1), "plural-s");
    }
    if (!word.includes("'") && word.endsWith("s") && !word.endsWith("ss") && word.length > 3) add(out, seen, word.slice(0, -1), "plural-s");

    return out;
  }

  globalThis.EIPA_PHONOLOGY = {
    display,
    suffixForS,
    suffixForEd,
    appendInflection,
    appendInflectionAll,
    morphologyCandidates,
    standard: "Exact user MDX IPA; MDX-verified inflection suffixes only",
    version: "2.3.0-mdx-explicit-morphology"
  };
})();
