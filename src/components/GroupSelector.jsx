export default function GroupSelector({ groups, selectedGroup, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 justify-center" role="tablist">
      {groups.map((group) => {
        const active = selectedGroup === group;
        return (
          <button
            key={group}
            onClick={() => onSelect(group)}
            role="tab"
            aria-selected={active}
            className={`w-11 h-11 rounded-full text-base font-extrabold transition-all duration-150 border-2 cursor-pointer ${
              active
                ? "bg-primary text-white border-primary-dark"
                : "bg-white text-ink-muted border-border hover:border-border-strong hover:text-ink"
            }`}
            style={active ? { boxShadow: "0 4px 0 0 var(--color-primary-dark)" } : undefined}
          >
            {group}
          </button>
        );
      })}
    </div>
  );
}
