// Textarea + autocomplete dropdown. NO ContentEditable — chip syntax is
// visible in the textarea as `[[team:CODE]]`. This is the "boring but works"
// route per JS expert review (avoids RTL bidi + IME bugs).
//
// We render a separate "chips preview" line that decodes the codes to Hebrew
// labels for readability — the textarea stays as the source of truth.

import { useMemo, useRef, useState } from "react";
import AutocompleteDropdown, { buildSuggestions } from "./AutocompleteDropdown";
import type { Chip } from "../../utils/adminQuery/types";
import {
  parseChipsFromText,
  defaultLabelLookup,
} from "../../utils/adminQuery/chipSerialize";

interface Props {
  value: string;
  onChange: (next: string) => void;
  forms: { formId: string; formName: string; ownerName: string }[];
  onSubmit?: () => void;
  placeholder?: string;
  maxLength?: number;
}

export default function ChipInput({
  value,
  onChange,
  forms,
  onSubmit,
  placeholder = "שאל/י שאלה על הטפסים...",
  maxLength = 500,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");

  const insertChip = (chip: Chip) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    // Replace the current "word" (the bit after the last whitespace before
    // caret) with the chip token.
    const before = value.slice(0, start);
    const after = value.slice(end);
    const wordStart = Math.max(
      before.lastIndexOf(" ") + 1,
      before.lastIndexOf("\n") + 1,
      0,
    );
    const head = value.slice(0, wordStart);
    const token = `[[${chip.kind}:${chip.code}]] `;
    const next = head + token + after;
    onChange(next.slice(0, maxLength));
    setShowAutocomplete(false);
    setAutocompleteQuery("");
    requestAnimationFrame(() => {
      ta.focus();
      const pos = head.length + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value.slice(0, maxLength);
    onChange(next);
    // Compute the current "word" at caret to feed autocomplete.
    const caret = e.target.selectionStart;
    const before = next.slice(0, caret);
    const tail = before.split(/\s/).pop() || "";
    if (tail.length >= 2 && !tail.startsWith("[[")) {
      setAutocompleteQuery(tail);
      setShowAutocomplete(true);
      setHighlightedIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  // Recompute suggestions in the parent so keyboard "Enter/Tab" can pick
  // directly without dispatching events into the dropdown DOM. The dropdown
  // recomputes the same list via useMemo internally — same input, same
  // output, same React render cycle, so they stay in lockstep.
  const suggestions = useMemo(
    () => (showAutocomplete ? buildSuggestions(autocompleteQuery, forms) : []),
    [showAutocomplete, autocompleteQuery, forms],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(suggestions.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        setShowAutocomplete(false);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const it =
          suggestions[Math.min(highlightedIndex, suggestions.length - 1)];
        if (it) insertChip({ kind: it.kind, code: it.code, label: it.label });
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const { chips } = parseChipsFromText(value, defaultLabelLookup);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        dir="rtl"
        rows={3}
        className="w-full p-3 text-sm border-2 border-border rounded-xl resize-y font-mono"
      />
      <div className="text-xs text-ink-muted mt-1 flex justify-between">
        <div>
          {chips.length > 0 && (
            <span>
              זוהו: {chips.map((c) => c.label).join(", ")}
            </span>
          )}
        </div>
        <div>
          {value.length}/{maxLength}
        </div>
      </div>
      {showAutocomplete && (
        <AutocompleteDropdown
          query={autocompleteQuery}
          forms={forms}
          highlightedIndex={highlightedIndex}
          onHover={setHighlightedIndex}
          onPick={insertChip}
        />
      )}
    </div>
  );
}
