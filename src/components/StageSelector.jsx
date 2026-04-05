import { STAGES } from '../data/matches';

export default function StageSelector({ selectedStage, onSelect }) {
  const stages = Object.entries(STAGES);

  return (
    <div className="flex overflow-x-auto gap-2 mb-4 pb-2 -mx-4 px-4 scrollbar-hide">
      {stages.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
            selectedStage === key
              ? 'bg-primary text-white shadow-md scale-105'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
