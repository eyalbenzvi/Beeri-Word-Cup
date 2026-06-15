// Shared affordance for "a name you can tap to go somewhere". Used for team
// names (→ team detail modal) and form names (→ that form's view) so the visual
// language of "this text is interactive" never drifts between pages: a dotted
// underline that turns solid + blue on hover/focus, with a real <button> under
// the hood for keyboard + screen-reader support.
//
// `stopPropagation` matters because these often sit INSIDE another clickable
// surface (e.g. a leaderboard row). The inner action must win without also
// triggering the row. Never render this inside a parent <button> (invalid
// HTML) — only inside non-button containers (div/td/span rows).
export default function ClickableName({
  onClick,
  children,
  className = "",
  title,
}: {
  onClick: () => void;
  children: any;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`bg-transparent border-none p-0 m-0 cursor-pointer font-[inherit] text-[inherit] text-right underline decoration-dotted decoration-1 underline-offset-2 hover:decoration-solid hover:text-secondary focus-visible:text-secondary transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
