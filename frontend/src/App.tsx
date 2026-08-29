import { Navigate, Route, BrowserRouter, Routes, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { LanguageProvider } from './lib/language-context';
import { Sidebar } from './components/Sidebar';
import { LanguageToggle } from './components/LanguageToggle';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { HomePage } from './pages/HomePage';
import { ReelsPage } from './pages/ReelsPage';
import { MapPage } from './pages/MapPage';
import { CraftPage } from './pages/CraftPage';
import { WorksheetsPage } from './pages/WorksheetsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { FriendsPage } from './pages/FriendsPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';

function FullScreenLoader() {
  return (
    <div style={{ height: '100vh' }} className="flex-center">
      <div className="spinner" />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content-col">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PublicOnlyLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 10 }}>
        <LanguageToggle floating />
      </div>
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route element={<PublicOnlyLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>

            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/reels" element={<ReelsPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/craft" element={<CraftPage />} />
              <Route path="/worksheets" element={<WorksheetsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/:username" element={<MessagesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:username" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
