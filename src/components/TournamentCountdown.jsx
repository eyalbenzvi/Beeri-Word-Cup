import CountdownUnit from "./CountdownUnit";

// Shared countdown block for Home and WelcomeScreen. Both pages previously
// duplicated the same 4-unit layout — keeping it in one place prevents drift.
// `variant="compact"` → smaller gap, used on Home where space is tighter.
// `variant="large"`   → wider gap, used on WelcomeScreen auth panel.
export default function TournamentCountdown({
  countdown,
  footerText,
  headerText,
  variant = "compact",
}) {
  const gap = variant === "large" ? "gap-2.5 md:gap-4" : "gap-2 md:gap-3";
  return (
    <>
      {headerText && (
        <p
          className={
            variant === "large"
              ? "text-lg md:text-xl font-extrabold text-ink mb-4"
              : "text-base md:text-lg font-extrabold text-ink mb-3"
          }
        >
          {headerText}
        </p>
      )}
      <div className={`flex justify-center ${gap}`} dir="ltr">
        <CountdownUnit value={countdown.days} label="ימים" accent="bg-secondary" />
        <CountdownUnit value={countdown.hours} label="שעות" />
        <CountdownUnit value={countdown.minutes} label="דקות" accent="bg-accent" />
        <CountdownUnit value={countdown.seconds} label="שניות" />
      </div>
      {footerText && (
        <p
          className={
            variant === "large"
              ? "text-xs text-ink-muted mt-4 font-medium"
              : "text-[11px] text-ink-muted mt-3 font-medium"
          }
        >
          {footerText}
        </p>
      )}
    </>
  );
}
