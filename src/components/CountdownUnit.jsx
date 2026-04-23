export default function CountdownUnit({ value, label, accent }) {
  const bgClass = accent || "bg-primary";
  const shadowColor = accent === "bg-secondary"
    ? "var(--color-secondary-dark)"
    : accent === "bg-accent"
      ? "var(--color-accent-dark)"
      : "var(--color-primary-dark)";
  return (
    <div className="flex flex-col items-center">
      <div
        className={`${bgClass} text-white w-14 h-14 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-2xl md:text-4xl font-extrabold tabular-nums`}
        style={{ boxShadow: `0 4px 0 0 ${shadowColor}`, marginBottom: 4 }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <span className="text-xs md:text-xs text-ink-muted font-bold mt-2">
        {label}
      </span>
    </div>
  );
}
