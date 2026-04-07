const ICONS = [
  "⚽", "🏆", "🦁", "🔥", "🎯", "⭐", "🌟", "💪",
  "👑", "🐐", "🎪", "🏅", "🎲", "📋", "🦅", "🐉",
];

export default function FormIconPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl border-2 cursor-pointer transition-all bg-white ${
            value === icon
              ? "border-primary ring-2 ring-primary/30 scale-110"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
