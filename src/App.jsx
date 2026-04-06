import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import WelcomeScreen from "./pages/WelcomeScreen";
import Predict from "./pages/Predict";
import Leaderboard from "./pages/Leaderboard";
import Results from "./pages/Results";
import Stats from "./pages/Stats";
import Admin from "./pages/Admin";
import { useStoreReady, useCurrentUser } from "./hooks/useStore";
import { NavigationProvider, useNavigation } from "./hooks/useNavigation";

const PAGES = {
  home: Home,
  predict: Predict,
  leaderboard: Leaderboard,
  results: Results,
  stats: Stats,
  admin: Admin,
};

function AppContent() {
  const ready = useStoreReady();
  const { page } = useNavigation();
  const { user } = useCurrentUser();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl animate-bounce">⚽</div>
          <div className="text-gray-500 text-sm mt-3">טוען...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <WelcomeScreen />;
  }

  const Page = PAGES[page] || Home;

  return (
    <Layout>
      <div key={page} className="animate-fade-in">
        <Page />
      </div>
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
