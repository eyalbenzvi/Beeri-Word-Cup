import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import Login from './pages/Login';
import Predict from './pages/Predict';
import Leaderboard from './pages/Leaderboard';
import Results from './pages/Results';
import Stats from './pages/Stats';
import Admin from './pages/Admin';
import { initRealtimeListeners } from './store';
import { useStoreReady, useCurrentUser } from './hooks/useStore';
import { NavigationProvider, useNavigation } from './hooks/useNavigation';

// Initialize Firestore listeners once
initRealtimeListeners();

const PUBLIC_PAGES = { home: Home, login: Login };
const AUTH_PAGES = { predict: Predict, leaderboard: Leaderboard, results: Results, stats: Stats, admin: Admin };
const ALL_PAGES = { ...PUBLIC_PAGES, ...AUTH_PAGES };

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

  // Non-logged-in users can only access public pages
  const isProtected = page in AUTH_PAGES;
  const Page = (!user && isProtected) ? Home : (ALL_PAGES[page] || Home);

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
    <NavigationProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </NavigationProvider>
  );
}

export default App;
