import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Predict from './pages/Predict';
import Leaderboard from './pages/Leaderboard';
import Results from './pages/Results';
import Admin from './pages/Admin';
import { initRealtimeListeners } from './store';
import { useStoreReady } from './hooks/useStore';
import { NavigationProvider, useNavigation } from './hooks/useNavigation';

// Initialize Firestore listeners once
initRealtimeListeners();

const PAGES = {
  home: Home,
  login: Login,
  predict: Predict,
  leaderboard: Leaderboard,
  results: Results,
  admin: Admin,
};

function AppContent() {
  const ready = useStoreReady();
  const { page } = useNavigation();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">⚽</div>
          <div className="text-gray-500 text-sm">טוען...</div>
        </div>
      </div>
    );
  }

  const Page = PAGES[page] || Home;

  return (
    <Layout>
      <Page />
    </Layout>
  );
}

function App() {
  return (
    <NavigationProvider>
      <AppContent />
    </NavigationProvider>
  );
}

export default App;
