export default function GroupSelector({ groups, selectedGroup, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 justify-center">
      {groups.map((group) => (
        <button
          key={group}
          onClick={() => onSelect(group)}
          className={`w-11 h-11 rounded-full text-base font-extrabold transition-all duration-150 border-2 cursor-pointer ${
            selectedGroup === group
              ? "bg-primary text-white border-primary-dark"
              : "bg-white text-ink-muted border-border hover:border-border-strong hover:text-ink"
          }`}
          style={selectedGroup === group ? { boxShadow: "0 3px 0 0 var(--color-primary-dark)", marginBottom: 3 } : undefined}
        >
          {group}
        </button>
      ))}
    </div>
  );
}
