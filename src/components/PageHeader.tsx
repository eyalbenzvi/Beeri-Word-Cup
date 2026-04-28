// Editorial-style page header: eyebrow + title + subtitle + divider.
// Replaces lone `<h1>` tags across pages for consistent hierarchy.
export default function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: any; title?: any; subtitle?: any; action?: any }) {
  return (
    <header className="mb-5 md:mb-7 pb-4 border-b border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="text-xs font-extrabold text-secondary tracking-wider mb-1 uppercase">
              {eyebrow}
            </div>
          )}
          <h1 className="font-heading text-2xl md:text-3xl xl:text-4xl font-extrabold text-ink tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm md:text-base text-ink-muted font-medium mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </header>
  );
}
