import { useState, lazy, Suspense } from "react";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import WelcomeScreen from "./pages/WelcomeScreen";
import ProfileSetup from "./components/ProfileSetup";
import { useStoreReady, useCurrentUser } from "./hooks/useStore";
import { NavigationProvider, useNavigation } from "./hooks/useNavigation";

// Lazy-load pages that aren't needed on initial render
const Predict = lazy(() => import("./pages/Predict"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Results = lazy(() => import("./pages/Results"));
const Stats = lazy(() => import("./pages/Stats"));
const Admin = lazy(() => import("./pages/Admin"));
const Profile = lazy(() => import("./pages/Profile"));

const PAGES = {
  home: Home,
  predict: Predict,
  leaderboard: Leaderboard,
  results: Results,
  stats: Stats,
  admin: Admin,
  profile: Profile,
};

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl animate-bounce">⚽</div>
        <div className="text-gray-500 text-sm mt-3">טוען...</div>
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
  if (!authReady) return <Loading />;

  // Not logged in at all — show welcome/login screen
  if (!isLoggedIn) return <WelcomeScreen />;

  // Logged in but Firestore data or user record still loading
  if (!ready || !user) return <Loading />;

  // Show profile setup for truly new users (profileCompleted === false, not undefined)
  if (user.profileCompleted === false && !profileDone) {
    return <ProfileSetup user={user} onComplete={() => setProfileDone(true)} />;
  }

  const Page = PAGES[page] || Home;

  return (
    <Layout>
      <Suspense fallback={<div className="text-center py-8 text-gray-400">טוען...</div>}>
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
          <AppContent />
        </ToastProvider>
      </NavigationProvider>
    </ErrorBoundary>
  );
}

export default App;
