export default function EmptyState({
  icon,
  title,
  description,
  cta,
  className = "",
}: {
  icon?: any;
  title?: any;
  description?: any;
  cta?: any;
  className?: string;
}) {
  return (
    <div className={`text-center py-12 max-w-md mx-auto ${className}`}>
      {icon && (
        <div className="text-5xl mb-3" aria-hidden="true">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="text-base font-extrabold text-ink mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-ink-muted font-medium max-w-xs mx-auto">
          {description}
        </p>
      )}
      {cta && <div className="mt-4 flex justify-center">{cta}</div>}
    </div>
  );
}
