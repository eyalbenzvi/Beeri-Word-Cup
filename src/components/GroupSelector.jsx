export default function GroupSelector({ groups, selectedGroup, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2.5 mb-4 justify-center">
      {groups.map((group) => (
        <button
          key={group}
          onClick={() => onSelect(group)}
          className={`w-11 h-11 rounded-full text-sm font-bold transition-all duration-150 border-none cursor-pointer active:scale-95 ${
            selectedGroup === group
              ? "bg-primary text-white shadow-md"
              : "bg-white text-gray-500 shadow-sm hover:text-primary"
          }`}
        >
          {group}
        </button>
      ))}
    </div>
  );
}
