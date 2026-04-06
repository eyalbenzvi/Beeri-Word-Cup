export default function GroupSelector({
  groups,
  selectedGroup,
  onSelect,
  missingCounts = {},
}) {
  return (
    <div className="flex flex-wrap gap-2.5 mb-4 justify-center">
      {groups.map((group) => {
        const missing = missingCounts[group] || 0;
        return (
          <button
            key={group}
            onClick={() => onSelect(group)}
            className={`relative w-11 h-11 rounded-full text-sm font-bold transition-all duration-150 border-none cursor-pointer active:scale-95 ${
              selectedGroup === group
                ? "bg-primary text-white shadow-md"
                : "bg-white text-gray-500 shadow-sm hover:text-primary"
            }`}
          >
            {group}
            {missing > 0 && selectedGroup !== group && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                {missing}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
