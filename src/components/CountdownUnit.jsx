export default function CountdownUnit({ value, label, accent }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`${accent || "bg-primary"} text-white w-12 h-12 md:w-18 md:h-18 rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-3xl font-extrabold shadow-md tabular-nums`}
      >
        {String(value).padStart(2, "0")}
      </div>
      <span className="text-[10px] md:text-xs text-ink-muted font-semibold mt-1.5">
        {label}
      </span>
    </div>
  );
}
