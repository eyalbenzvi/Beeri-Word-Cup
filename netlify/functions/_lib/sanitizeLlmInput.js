// Shared prompt-injection hardening for LLM-bound user input.
//
// Pure (no external deps) so both the Netlify functions AND the legacy test
// runner can import it directly. Callers are always auth-gated (admin ID
// token), so this is defense-in-depth — NOT the security boundary.
//
// We REPLACE rather than STRIP control sequences so legitimate content (an
// admin pasting a fenced code block, a stat table, an HTML-ish snippet)
// round-trips as readable text instead of being silently mangled.

export const DEFAULT_MAX_INPUT_CHARS = 6000;

// Sequences an LLM might interpret as role / turn boundaries.
const CONTROL_TOKEN_REPLACEMENTS = [
  // Llama / ChatML style special tokens: <|im_start|>, <|eot_id|>, <|system|>…
  [/<\|[^|>]{0,40}\|>/gi, "(token)"],
  // Bare role tags an injection might use to fake a system/user turn.
  [/<\/?(?:s|system|user|assistant)>/gi, "(tag)"],
  // Markdown code fences — collapse so a payload can't "break out" of a block.
  [/```/g, "'''"],
];

// Sanitize a single string: neutralize control tokens, collapse runaway
// whitespace, and clamp length.
export function sanitizeLlmInput(s, max = DEFAULT_MAX_INPUT_CHARS) {
  if (typeof s !== "string") return "";
  let cleaned = s;
  for (const [re, repl] of CONTROL_TOKEN_REPLACEMENTS) cleaned = cleaned.replace(re, repl);
  cleaned = cleaned.replace(/\s{3,}/g, "\n\n");
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

// Recursively sanitize the string leaves (and keys) of a small, bounded plain
// object — e.g. the `resolvedEntities` map that gets JSON-stringified into the
// LLM user turn. Numbers / booleans / null pass through untouched. Bounded by
// depth + a shared entry budget so a hostile deeply-nested payload can't blow
// up CPU or output size before it ever reaches the model.
export function sanitizeLlmEntities(value, opts = {}) {
  const maxDepth = opts.maxDepth ?? 4;
  const maxEntries = opts.maxEntries ?? 200;
  const maxLeafChars = opts.maxLeafChars ?? 200;
  let entryBudget = maxEntries;

  function walk(v, depth) {
    if (depth > maxDepth) return null;
    if (typeof v === "string") return sanitizeLlmInput(v, maxLeafChars);
    if (typeof v === "number" || typeof v === "boolean" || v == null) return v;
    if (Array.isArray(v)) {
      const out = [];
      for (const item of v) {
        if (entryBudget-- <= 0) break;
        out.push(walk(item, depth + 1));
      }
      return out;
    }
    if (typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v)) {
        if (entryBudget-- <= 0) break;
        // Keys are LLM-visible too — sanitize them with a tight cap.
        out[sanitizeLlmInput(k, 80)] = walk(v[k], depth + 1);
      }
      return out;
    }
    // functions, symbols, bigint, etc. — drop entirely.
    return null;
  }

  return walk(value, 0);
}
