export default function InlineError({ children, className = "", align = "right" }) {
  if (!children) return null;
  const alignCls = align === "center" ? "text-center" : "text-right";
  return (
    <p
      className={`text-sm text-danger font-bold ${alignCls} ${className}`}
      role="alert"
    >
      {children}
    </p>
  );
}
