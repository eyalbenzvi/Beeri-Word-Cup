import { STAGES } from "../data/matches";

export default function StageSelector({ selectedStage, onSelect }) {
  const stages = Object.entries(STAGES);

  return (
    <div className="flex overflow-x-auto md:overflow-visible md:flex-wrap md:justify-center gap-2 mb-3 pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
      {stages.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`chip-duo flex-shrink-0 ${selectedStage === key ? "active" : ""}`}
          style={{ minHeight: 40 }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
