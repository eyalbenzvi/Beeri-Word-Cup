// Circular form-row avatar used by FormList, AllForms, Leaderboard, and
// Profile. Previously each page rendered its own variant (sometimes a ✓/📋
// emoji, sometimes the form's first letter, sometimes the user's initial);
// centralising it here keeps the entity's visual identity consistent across
// pages and states.
import { normalizeStatus } from "../utils/helpers";

const SIZE_CLASSES = {
  md: "w-11 h-11 text-base",
  sm: "w-9 h-9 text-sm",
};

export default function FormAvatar({ form, size = "md" }) {
  const submitted = normalizeStatus(form?.status) === "submitted";
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const letter = ((form?.formName || "?").trim()[0] || "?").toUpperCase();
  const colorCls = submitted
    ? "bg-primary text-white border-primary-dark"
    : "bg-bg-soft text-ink-muted border-border";

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeCls} rounded-full flex items-center justify-center font-extrabold border-2 ${colorCls}`}
        aria-label={submitted ? "טופס הוגש" : "טיוטה"}
      >
        {letter}
      </div>
      {submitted && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-white text-primary-dark text-[10px] font-extrabold flex items-center justify-center border border-primary-dark"
        >
          ✓
        </span>
      )}
    </div>
  );
}
