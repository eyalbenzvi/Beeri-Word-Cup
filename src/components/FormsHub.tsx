// Tabbed shell for /predict's no-activeForm view: a top-of-page tab pair
// ("הטפסים שלי" / "כל הטפסים") that swaps between FormList (the user's own
// drafts and submissions) and AllForms (every submitted form on the site).
//
// Default tab:
//   - Authenticated user → "mine"
//   - Guest visitor       → "all" (mine is gated behind a LoginPrompt)
//
// URL contract:
//   ?view=mine — explicit mine
//   ?view=all  — explicit all
//   absent     — defaults per the rule above
// We keep `view` as the param name because it already steered AllForms
// pre-refactor (Predict.tsx used `view=all` as the deep-link). New URL
// values stay backward-compatible.
import { Suspense, lazy } from "react";
import FormList from "./FormList";
import LoginPrompt from "./LoginPrompt";
import Spinner from "./Spinner";
import { useNavigation } from "../hooks/useNavigation";

const AllFormsView = lazy(() => import("../pages/AllForms"));

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
  // Default: mine when logged in, all for guests. Bogus values (?view=foo)
  // fall back to the default rather than rendering nothing.
  const defaultTab: ViewTab = user ? "mine" : "all";
  const requested = (params?.view as string) || "";
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
      <div
        className="flex gap-1 mb-3 bg-bg-soft rounded-xl p-1 border-2 border-border"
        role="tablist"
        aria-label="בחירת תצוגת טפסים"
      >
        <button
          role="tab"
          aria-selected={tab === "mine"}
          onClick={() => setTab("mine")}
          className={`flex-1 py-2 text-sm font-extrabold rounded-xl transition border-none cursor-pointer ${
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
          className={`flex-1 py-2 text-sm font-extrabold rounded-xl transition border-none cursor-pointer ${
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
          <LoginPrompt
            title="התחבר כדי לראות את הטפסים שלך"
            subtitle="לאחר התחברות תוכל ליצור טפסים, לערוך ולעקוב אחרי התוצאות"
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
