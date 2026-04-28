export default function ErrorBanner({
  children,
  onRetry,
  retryLabel = "נסה שוב",
  onDismiss,
  icon = "⚠️",
  className = "",
}: {
  children?: any;
  onRetry?: any;
  retryLabel?: string;
  onDismiss?: any;
  icon?: string;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      className={`alert-danger-soft flex items-center justify-between gap-2 ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0 text-right">
        {icon && <span aria-hidden="true" className="flex-shrink-0">{icon}</span>}
        <span className="text-sm text-danger font-bold min-w-0">{children}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-duo-flat"
            style={{ background: "var(--color-danger)", color: "#FFFFFF" }}
          >
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="btn-duo-flat"
            aria-label="סגור"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
