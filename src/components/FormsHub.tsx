// Tabbed shell for /predict's no-activeForm view: a top-of-page tab pair
// ("הטפסים שלי" / "כל הטפסים") that swaps between FormList (the user's own
// drafts and submissions) and AllForms (every submitted form on the site).
//
// Default tab:
//   - Authenticated user → "mine"
//   - Guest visitor       → "all" (mine is gated behind an EmptyState)
//
// Guest banner:
//   When `user` is null we render a single LoginPrompt banner above the
//   tabs. Both tabs then share that banner — the "mine" tab body collapses
//   to a tight EmptyState rather than a duplicate sign-in card. (Earlier
//   the parent Predict page rendered its own banner AND FormsHub rendered
//   a card on the mine tab → two stacked sign-in panels.)
//
// URL contract:
//   ?view=mine — explicit mine
//   ?view=all  — explicit all
//   absent     — defaults per the rule above
// We keep `view` as the param name because it already steered AllForms
// pre-refactor (Predict.tsx used `view=all` as the deep-link). New URL
// values stay backward-compatible.
import { Suspense, lazy, useEffect } from "react";
import FormList from "./FormList";
import LoginPrompt from "./LoginPrompt";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import { AUTH_COPY } from "../constants/messages";
import { useNavigation } from "../hooks/useNavigation";
import { captureClientError } from "../sentry";

// Module-level loader so the chunk only fetches once across re-mounts.
// Reuse this same callable for both `lazy` and the tab-mount preload below.
const loadAllForms = () => import("../pages/AllForms");
const AllFormsView = lazy(loadAllForms);

const VIEW_TAB_VALUES = ["mine", "all"] as const;
type ViewTab = (typeof VIEW_TAB_VALUES)[number];

export default function FormsHub({
  forms,
  user,
  settings,
}: {
  forms: any[];
  user: any | null;
  settings: any;
}) {
  const { params, setParamsPatch } = useNavigation();

  // Eagerly fetch the AllForms chunk when the hub mounts so a tab toggle
  // doesn't trigger a Suspense fallback flash on first switch. The dynamic
  // import is module-cached, so the actual `lazy(loadAllForms)` evaluation
  // a moment later is a free hit. A preload failure is non-fatal — the
  // `lazy(loadAllForms)` below re-attempts with the same loader — but we
  // report it so a recurring chunk-fetch failure (bad deploy / CDN) is
  // visible in Sentry instead of vanishing silently.
  useEffect(() => {
    loadAllForms().catch((err) => {
      captureClientError(err, { source: "FormsHub.preloadAllForms" });
    });
  }, []);

  // Default: mine when logged in, all for guests. Bogus values (?view=foo)
  // fall back to the default rather than rendering nothing.
  const defaultTab: ViewTab = user ? "mine" : "all";
  const requested = params?.view || "";
  const tab: ViewTab = (VIEW_TAB_VALUES as readonly string[]).includes(
    requested,
  )
    ? (requested as ViewTab)
    : defaultTab;

  const setTab = (next: ViewTab) => {
    // Default tab maps to no `view` param so the URL stays clean for the
    // common case (e.g. logged-in user landing on /predict gets a clean
    // /?page=predict instead of /?page=predict&view=mine).
    setParamsPatch({ view: next === defaultTab ? null : next });
  };

  return (
    <div>
      {!user && (
        <div id="forms-hub-login-banner">
          <LoginPrompt
            variant="banner"
            title={AUTH_COPY.loginRequiredTitle}
            subtitle={AUTH_COPY.loginRequiredSubtitle}
          />
        </div>
      )}

      <div
        className="flex gap-1 mb-3 bg-bg-soft rounded-xl p-1 border-2 border-border"
        role="tablist"
        aria-label="בחירת תצוגת טפסים"
      >
        {/* tap-44 enforces the 44×44 minimum touch target on coarse
            pointers (phones) per the brand book accessibility rule;
            py-2.5 keeps the pill visually tight on desktop where
            pointer:fine waives the minimum. */}
        <button
          role="tab"
          aria-selected={tab === "mine"}
          onClick={() => setTab("mine")}
          className={`tap-44 flex-1 py-2.5 text-sm font-extrabold rounded-xl transition border-none cursor-pointer ${
            tab === "mine"
              ? "bg-white text-ink"
              : "bg-transparent text-ink-muted"
          }`}
        >
          הטפסים שלי
        </button>
        <button
          role="tab"
          aria-selected={tab === "all"}
          onClick={() => setTab("all")}
          className={`tap-44 flex-1 py-2.5 text-sm font-extrabold rounded-xl transition border-none cursor-pointer ${
            tab === "all"
              ? "bg-white text-ink"
              : "bg-transparent text-ink-muted"
          }`}
        >
          כל הטפסים
        </button>
      </div>

      {tab === "mine" ? (
        user ? (
          <FormList forms={forms} user={user} settings={settings} />
        ) : (
          // Guest's mine tab — banner above already provides the
          // sign-in CTA. We still surface a "התחבר" button inside the
          // empty state so a phone user who's scrolled past the banner
          // can re-focus it without scrolling back to the top manually.
          <EmptyState
            icon="📋"
            title="עדיין אין כאן טפסים"
            description="לאחר התחברות תוכל ליצור טפסים, לערוך אותם ולעקוב אחרי התוצאות"
            cta={
              <button
                onClick={() => {
                  document
                    .getElementById("forms-hub-login-banner")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="btn-duo btn-duo-primary btn-duo-sm"
              >
                התחבר
              </button>
            }
          />
        )
      ) : (
        <Suspense
          fallback={
            <div className="text-center py-8 text-ink-muted font-bold">
              <Spinner label="טוען..." />
            </div>
          }
        >
          <AllFormsView hideHeader />
        </Suspense>
      )}
    </div>
  );
}
