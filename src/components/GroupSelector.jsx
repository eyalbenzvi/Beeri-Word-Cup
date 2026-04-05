export default function GroupSelector({ groups, selectedGroup, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
      {groups.map((group) => (
        <button
          key={group}
          onClick={() => onSelect(group)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            selectedGroup === group
              ? 'bg-primary text-white shadow-md'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary'
          }`}
        >
          {group}
        </button>
      ))}
    </div>
  );
}
