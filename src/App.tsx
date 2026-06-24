import { useState, useEffect, useRef, Suspense } from "react";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmModal";
import { TeamModalProvider } from "./components/TeamModal";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";
import Home from "./pages/Home";
import WelcomeScreen from "./pages/WelcomeScreen";
import ProfileSetup from "./components/ProfileSetup";
import { useStoreReady, useCurrentUser } from "./hooks/useStore";
import { NavigationProvider, useNavigation } from "./hooks/useNavigation";
import { ThemeProvider } from "./hooks/useTheme";
import { RailProvider, useRailContent } from "./hooks/useRail";
import { firebaseSignOut } from "./firebase";
import { captureClientMessage } from "./sentry";
import { CURRENT_USER_KEY, ACTIVE_FORM_KEY } from "./constants/storageKeys";
import { lazyWithRetry } from "./utils/lazyWithRetry";
import { setFirestoreCacheBypass } from "./utils/firestoreCacheRecovery";
import { initPublicReadonlyMode, retryRealtimeListeners } from "./store";

// Lazy-load pages that aren't needed on initial render
const Predict = lazyWithRetry(() => import("./pages/Predict"));
const Leaderboard = lazyWithRetry(() => import("./pages/Leaderboard"));
const Results = lazyWithRetry(() => import("./pages/Results"));
const Stats = lazyWithRetry(() => import("./pages/Stats"));
const Simulator = lazyWithRetry(() => import("./pages/Simulator"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const DailySummary = lazyWithRetry(() => import("./pages/DailySummary"));

const PAGES = {
  home: Home,
  predict: Predict,
  leaderboard: Leaderboard,
  results: Results,
  stats: Stats,
  simulator: Simulator,
  admin: Admin,
  profile: Profile,
  blog: DailySummary,
};

// After STUCK_THRESHOLD_MS, the spinner surfaces recovery options. Without
// this, rare auth/Firestore failures (Safari ITP, stale tokens, permission
// denied after user deletion) would leave users watching a ball forever.
const STUCK_THRESHOLD_MS = 12000;

// Reasons where the data, not auth, is the missing piece — an in-place
// listener retry can recover without a full-page reload.
const RETRYABLE_REASONS = new Set(["store-not-ready", "user-not-in-cache"]);

function Loading({ reason = "unknown", compact = false }) {
  const [stuck, setStuck] = useState(false);
  // Bumped by the in-place retry to restart the stuck timer (and the visible
  // spinner) without remounting / reloading the page.
  const [retryNonce, setRetryNonce] = useState(0);
  const mountedAt = useRef(Date.now());

  // (Re)start the stuck timer on a reason change OR an intentional retry. We
  // deliberately do NOT reset `stuck` here: a reason transition while the
  // recovery buttons are already showing (e.g. store-not-ready →
  // user-not-in-cache, both still "not loaded") must keep them visible rather
  // than hide them and force another full STUCK_THRESHOLD_MS wait. `stuck` is
  // cleared only by retryListeners() below, on an explicit user retry.
  useEffect(() => {
    mountedAt.current = Date.now();
    const t = setTimeout(() => {
      setStuck(true);
      captureClientMessage("loading-stuck", {
        reason,
        durationMs: Date.now() - mountedAt.current,
      });
    }, STUCK_THRESHOLD_MS);
    return () => clearTimeout(t);
  }, [reason, retryNonce]);

  // Lighter-touch recovery: re-subscribe the Firestore listeners in place.
  // Preserves the auth session + any unsaved optimistic state. Falls back to
  // a hard reload if there's no active listener user to retry. Hides the
  // recovery UI (setStuck(false)) and bumps the nonce to restart the timer.
  const retryListeners = () => {
    captureClientMessage("recovery-retry-listeners-tapped", {
      reason,
      durationMs: Date.now() - mountedAt.current,
    });
    const retried = retryRealtimeListeners();
    if (!retried) {
      window.location.reload();
      return;
    }
    setStuck(false);
    setRetryNonce((n) => n + 1);
  };

  const reload = () => {
    captureClientMessage("recovery-reload-tapped", {
      reason,
      durationMs: Date.now() - mountedAt.current,
    });
    window.location.reload();
  };

  const signOutAndReload = async () => {
    captureClientMessage("recovery-signout-tapped", {
      reason,
      durationMs: Date.now() - mountedAt.current,
    });
    try { await firebaseSignOut(); } catch { /* ignore */ }
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(ACTIVE_FORM_KEY); } catch { /* ignore */ }
    // Last-resort recovery: a stuck splash is often a wedged Firestore
    // IndexedDB cache, which a plain reload would just re-open. Arm the
    // bypass flag so the reload boots on a clean in-memory cache and wipes
    // the poisoned on-disk store (see firestoreCacheRecovery.ts).
    setFirestoreCacheBypass();
    window.location.reload();
  };

  if (compact && !stuck) {
    return (
      <div className="text-center py-8 text-ink-muted font-bold">
        <Spinner label="טוען..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        <div className="text-5xl animate-bounce">⚽</div>
        <div className="text-ink-muted text-sm mt-3 font-bold">טוען...</div>
        {stuck && (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-ink font-medium">
              נתקע? נסה את האפשרויות הבאות.
            </p>
            {RETRYABLE_REASONS.has(reason) && (
              <button onClick={retryListeners} className="btn-duo btn-duo-primary w-full">
                נסה שוב
              </button>
            )}
            <button
              onClick={reload}
              className={`btn-duo w-full ${
                RETRYABLE_REASONS.has(reason) ? "btn-duo-ghost" : "btn-duo-primary"
              }`}
            >
              רענן את הדף
            </button>
            <button onClick={signOutAndReload} className="btn-duo btn-duo-ghost w-full">
              התנתק והתחל מחדש
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Pages a guest may visit. Anything outside this set falls back to the home
// view (WelcomeScreen) so /admin /predict /profile etc. shared from a logged-
// in session don't try to render restricted UI for an unauthenticated tab.
const GUEST_PAGES = new Set([
  "home",
  "predict",
  "leaderboard",
  "results",
  "stats",
  "blog",
  "simulator",
]);

function AppContent() {
  const ready = useStoreReady();
  const { page, navigate } = useNavigation();
  const { user, authReady, isLoggedIn } = useCurrentUser();
  const [profileDone, setProfileDone] = useState(false);

  // Init public-readonly mode whenever a logged-out visitor is in the app.
  // Previously gated to `page === "blog"` only; now every guest tab needs
  // settings + matchResults + summaries + tournament data, so we kick the
  // listener once auth is known. It's a no-op on subsequent renders and
  // gets torn down via teardownPublicReadonlyMode in initRealtimeListeners
  // once the user signs in.
  useEffect(() => {
    if (authReady && !isLoggedIn) {
      initPublicReadonlyMode();
    }
  }, [authReady, isLoggedIn]);

  // Guest URL normalisation: when a logged-out visitor lands on a page
  // that isn't reachable for guests (admin / profile shared from a
  // logged-in session, or a stale bookmark), the WelcomeScreen renders
  // but the URL still says e.g. ?page=admin. Without this normalisation,
  // signing in via the welcome auth panel would route the freshly-authed
  // user straight into the Admin permission gate (a non-admin sees
  // "נדרשת גישת מנהל" immediately after login — confusing UX). Replace
  // (not push) so Back doesn't bounce the user into the bad URL again.
  useEffect(() => {
    if (!authReady || isLoggedIn) return;
    if (page !== "home" && !GUEST_PAGES.has(page)) {
      navigate("home", {}, { replace: true });
    }
  }, [authReady, isLoggedIn, page, navigate]);

  // Wait for Firebase Auth to determine login state
  if (!authReady) return <Loading reason="auth-init" />;

  // Logged-out visitor: render every recognised page through AppShell so
  // the tab navigation (mobile bottom-nav + DesktopSideNav) is always
  // present, including on the home/welcome screen. Pages outside
  // GUEST_PAGES (admin, profile, etc. shared from a logged-in session)
  // collapse to the welcome view but still inside AppShell, with the
  // page-id forced back to "home" so the highlight + URL match what's
  // actually rendered.
  if (!isLoggedIn) {
    const isGuestHome = page === "home" || !GUEST_PAGES.has(page);
    const Page = isGuestHome ? WelcomeScreen : PAGES[page] || WelcomeScreen;
    return (
      <RailProvider>
        <AppShell page={isGuestHome ? "home" : page} Page={Page} />
      </RailProvider>
    );
  }

  // Logged in but Firestore data or user record still loading
  // (store.js retries indefinitely with backoff + online/visibility listeners)
  if (!ready) return <Loading reason="store-not-ready" />;
  if (!user) return <Loading reason="user-not-in-cache" />;

  // Show profile setup for truly new users (profileCompleted === false, not undefined)
  if (user.profileCompleted === false && !profileDone) {
    return <ProfileSetup user={user} onComplete={() => setProfileDone(true)} />;
  }

  const Page = PAGES[page] || Home;

  return (
    <RailProvider>
      <AppShell page={page} Page={Page} />
    </RailProvider>
  );
}

function AppShell({ page, Page }) {
  const rail = useRailContent();
  return (
    <Layout rightRail={rail}>
      <Suspense fallback={<Loading reason="lazy-page" compact />}>
        {/* Per-page error boundary: a thrown error in one page no longer
            kills the entire shell. resetKey={page} lets the user leave a
            broken page by navigating, without a hard reload. */}
        <ErrorBoundary variant="page" resetKey={page}>
          <div key={page} className="animate-fade-in">
            <Page />
          </div>
        </ErrorBoundary>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <NavigationProvider>
        <ToastProvider>
          <ConfirmProvider>
            <TeamModalProvider>
              <AppContent />
            </TeamModalProvider>
          </ConfirmProvider>
        </ToastProvider>
      </NavigationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
