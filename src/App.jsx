import { useState, useEffect, useRef, Suspense } from "react";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmModal";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";
import Home from "./pages/Home";
import WelcomeScreen from "./pages/WelcomeScreen";
import ProfileSetup from "./components/ProfileSetup";
import { useStoreReady, useCurrentUser } from "./hooks/useStore";
import { NavigationProvider, useNavigation } from "./hooks/useNavigation";
import { RailProvider, useRailContent } from "./hooks/useRail";
import { firebaseSignOut } from "./firebase";
import { captureClientMessage } from "./sentry";
import { lazyWithRetry } from "./utils/lazyWithRetry";

// Lazy-load pages that aren't needed on initial render
const Predict = lazyWithRetry(() => import("./pages/Predict"));
const Leaderboard = lazyWithRetry(() => import("./pages/Leaderboard"));
const Results = lazyWithRetry(() => import("./pages/Results"));
const Stats = lazyWithRetry(() => import("./pages/Stats"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const DailySummary = lazyWithRetry(() => import("./pages/DailySummary"));

const PAGES = {
  home: Home,
  predict: Predict,
  leaderboard: Leaderboard,
  results: Results,
  stats: Stats,
  admin: Admin,
  profile: Profile,
  blog: DailySummary,
};

// After STUCK_THRESHOLD_MS, the spinner surfaces recovery options. Without
// this, rare auth/Firestore failures (Safari ITP, stale tokens, permission
// denied after user deletion) would leave users watching a ball forever.
const STUCK_THRESHOLD_MS = 12000;

function Loading({ reason = "unknown", compact = false }) {
  const [stuck, setStuck] = useState(false);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const t = setTimeout(() => {
      setStuck(true);
      captureClientMessage("loading-stuck", {
        reason,
        durationMs: Date.now() - mountedAt.current,
      });
    }, STUCK_THRESHOLD_MS);
    return () => clearTimeout(t);
  }, [reason]);

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
    try { localStorage.removeItem("wc2026_currentUser"); } catch { /* ignore */ }
    try { localStorage.removeItem("wc2026_activeForm"); } catch { /* ignore */ }
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
            <button onClick={reload} className="btn-duo btn-duo-primary w-full">
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

function AppContent() {
  const ready = useStoreReady();
  const { page } = useNavigation();
  const { user, authReady, isLoggedIn } = useCurrentUser();
  const [profileDone, setProfileDone] = useState(false);

  // Wait for Firebase Auth to determine login state
  if (!authReady) return <Loading reason="auth-init" />;

  // Not logged in at all — show welcome/login screen
  if (!isLoggedIn) return <WelcomeScreen />;

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
        <div key={page} className="animate-fade-in">
          <Page />
        </div>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NavigationProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppContent />
          </ConfirmProvider>
        </ToastProvider>
      </NavigationProvider>
    </ErrorBoundary>
  );
}

export default App;
