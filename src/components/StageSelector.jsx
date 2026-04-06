import { STAGES } from "../data/matches";

export default function StageSelector({ selectedStage, onSelect }) {
  const stages = Object.entries(STAGES);

  return (
    <div className="flex overflow-x-auto md:overflow-visible md:flex-wrap md:justify-center gap-2.5 mb-4 pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
      {stages.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-4 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all duration-150 flex-shrink-0 border-none cursor-pointer min-h-[44px] active:scale-95 ${
            selectedStage === key
              ? "bg-primary text-white shadow-md"
              : "bg-white text-gray-500 shadow-sm hover:text-primary"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
