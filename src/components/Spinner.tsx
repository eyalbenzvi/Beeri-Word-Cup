const SIZES = {
  sm: "w-3 h-3 border-2",
  md: "w-5 h-5 border-2",
  lg: "w-8 h-8 border-[3px]",
};

export default function Spinner({ size = "md", label, className = "" }: { size?: string; label?: string; className?: string }) {
  const sizeCls = SIZES[size as keyof typeof SIZES] || SIZES.md;
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-block ${sizeCls} rounded-full border-border border-t-secondary animate-spin`}
        aria-hidden="true"
      />
      {label && <span>{label}</span>}
    </span>
  );
}
