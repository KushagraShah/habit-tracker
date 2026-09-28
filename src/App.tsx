import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import { ThemeProvider } from './contexts/ThemeContext';
import { isSupabaseConfigured } from './lib/supabase';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import TodayPage from './pages/TodayPage';
import InsightsPage from './pages/InsightsPage';
import HabitsPage from './pages/HabitsPage';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  );
}

function ConfigScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-bold text-red-600 mb-2">Supabase configuration missing</h1>
        <p className="text-sm text-gray-500">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your local
          <code> .env</code> file (or as repository secrets for the deploy workflow), then rebuild.
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/today" replace /> : <AuthPage />} />
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/today" element={<TodayPage />} />
        <Route path="/today/:date" element={<TodayPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        {/* old path kept so existing home-screen shortcuts keep working */}
        <Route path="/calendar" element={<Navigate to="/insights" replace />} />
        <Route path="/habits" element={<HabitsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigScreen />;

  return (
    <HashRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </HashRouter>
  );
}