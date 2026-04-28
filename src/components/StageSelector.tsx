import { STAGES } from "../data/matches";

// Selector renders as plain buttons in a horizontal scroll group. Earlier the
// container used role="tablist" with role="tab" children, but no element ever
// pointed back via aria-controls + role="tabpanel" — that's an incomplete
// ARIA tab pattern and screen readers announce the wrong affordance. Keep
// semantics simple: a list of ordinary buttons. Visual-only "active" state
// is conveyed via aria-pressed on the active toggle.
export default function StageSelector({ selectedStage, onSelect }) {
  const stages = Object.entries(STAGES);

  return (
    <div className="flex overflow-x-auto md:overflow-visible md:flex-wrap md:justify-center gap-2 mb-3 pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
      {stages.map(([key, label]) => {
        const active = selectedStage === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={active}
            className={`chip-duo flex-shrink-0 ${active ? "active" : ""}`}
            style={{ minHeight: 40 }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
