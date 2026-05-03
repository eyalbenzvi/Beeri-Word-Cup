// Inline sign-in panel for guest visitors. Rendered at the top of every
// guest page (Predict, Leaderboard, Results, Stats, AllForms) so that a
// logged-out user can sign in without first navigating back to the home
// screen. Mirrors the auth panel on WelcomeScreen — Google primary, phone
// secondary — but condensed for the in-page context.
import { useState } from "react";
import { Phone, ArrowRight } from "lucide-react";
import GoogleSignInButton from "./GoogleSignInButton";
import PhoneSignIn from "./PhoneSignIn";

export default function LoginPrompt({
  title = "התחבר כדי לראות עוד",
  subtitle,
  variant = "card",
}: {
  title?: string;
  subtitle?: string;
  /**
   * "card" (default): full bordered card, suitable as the only content on
   *   a gated page (e.g. Predict for guests).
   * "banner": tight banner, suitable as a top-of-page nudge while still
   *   showing the rest of the page (e.g. Leaderboard, Stats, AllForms).
   */
  variant?: "card" | "banner";
}) {
  const [authMethod, setAuthMethod] = useState<"google" | "phone">("google");

  const containerClass =
    variant === "banner"
      ? "bg-white border-2 border-border rounded-2xl p-3 md:p-4 mb-3"
      : "card-duo-lg max-w-md mx-auto my-4";

  return (
    <div className={containerClass} data-testid="login-prompt">
      <div className="text-center mb-3">
        <div className="text-3xl mb-1" aria-hidden="true">🔐</div>
        <h3 className="text-base md:text-lg font-extrabold text-ink">{title}</h3>
        {subtitle && (
          <p className="text-xs md:text-sm text-ink-muted font-medium mt-1">
            {subtitle}
          </p>
        )}
      </div>
      <div className="space-y-2 max-w-sm mx-auto">
        {authMethod === "google" ? (
          <>
            <GoogleSignInButton />
            <button
              onClick={() => setAuthMethod("phone")}
              className="btn-duo btn-duo-ghost-raised w-full"
            >
              <Phone size={18} aria-hidden="true" />
              התחבר עם מספר טלפון
            </button>
          </>
        ) : (
          <>
            <PhoneSignIn />
            <button
              onClick={() => setAuthMethod("google")}
              className="w-full text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer py-1 hover:text-secondary-dark flex items-center justify-center gap-1"
            >
              <ArrowRight size={16} aria-hidden="true" />
              חזור להתחברות עם Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
