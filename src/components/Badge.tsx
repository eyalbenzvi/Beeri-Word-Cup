const VARIANTS = {
  primary: "badge-duo-primary",
  secondary: "badge-duo-secondary",
  accent: "badge-duo-accent",
  danger: "badge-duo-danger",
  muted: "badge-duo-muted",
};

export default function Badge({ children, variant = "muted", icon, className = "" }) {
  const v = VARIANTS[variant] || VARIANTS.muted;
  return (
    <span className={`badge-duo ${v} ${className}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
