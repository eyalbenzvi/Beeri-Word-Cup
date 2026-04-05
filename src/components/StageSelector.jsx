import { STAGES } from '../data/matches';

export default function StageSelector({ selectedStage, onSelect }) {
  const stages = Object.entries(STAGES);

  return (
    <div className="flex overflow-x-auto gap-2 mb-4 pb-1 -mx-4 px-4 scrollbar-hide">
      {stages.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all duration-150 flex-shrink-0 border-none cursor-pointer ${
            selectedStage === key
              ? 'bg-primary text-white shadow-md'
              : 'bg-white text-gray-500 shadow-sm hover:text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
