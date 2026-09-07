import { Navigate, Route, BrowserRouter, Routes, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { LanguageProvider } from './lib/language-context';
import { Sidebar } from './components/Sidebar';
import { LanguageToggle } from './components/LanguageToggle';
import { Footer } from './components/Footer';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsPage } from './pages/TermsPage';
import { CookiePolicyPage } from './pages/CookiePolicyPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { HomePage } from './pages/HomePage';
import { TeacherHomePage } from './pages/TeacherHomePage';
import { ReelsPage } from './pages/ReelsPage';
import { MapPage } from './pages/MapPage';
import { CraftPage } from './pages/CraftPage';
import { WorksheetsPage } from './pages/WorksheetsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { FriendsPage } from './pages/FriendsPage';
import { ProfilePage } from './pages/ProfilePage';
import { TeacherReelsPage } from './pages/TeacherReelsPage';

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
        <Footer />
      </div>
    </div>
  );
}

// Students still land straight on Reels right after signing in (see PublicOnlyLayout below) —
// but "/" itself, and the sidebar's Home icon that points there, needs to be a real, distinct
// homepage to navigate back to, not just another way to reach Reels.
function RoleHome() {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherHomePage /> : <HomePage />;
}

/** Gates the wrapped routes to teacher accounts only — a signed-in student who
 * navigates here is bounced back to Home. Reels/Map/Craft/Worksheets/Leaderboard/
 * Friends have no equivalent guard: teachers share the full gameplay surface with
 * students (matching the backend, which no longer role-gates those routes either) —
 * a teacher account is a student account plus a few extras, not a separate walled-off
 * experience. */
function TeacherOnly() {
  const { user } = useAuth();
  if (user?.role !== 'teacher') return <Navigate to="/" replace />;
  return <Outlet />;
}

function PublicOnlyLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  // First page after signing in: students land on Reels, teachers land on Home.
  if (user) return <Navigate to={user.role === 'student' ? '/reels' : '/'} replace />;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 10 }}>
        <LanguageToggle floating />
      </div>
      <Outlet />
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            {/* Public regardless of auth state — a visitor should be able to read these before ever signing up. */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookies" element={<CookiePolicyPage />} />

            <Route element={<PublicOnlyLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
            </Route>

            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<RoleHome />} />
              <Route path="/reels" element={<ReelsPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/craft" element={<CraftPage />} />
              <Route path="/worksheets" element={<WorksheetsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route element={<TeacherOnly />}>
                <Route path="/teacher/reels" element={<TeacherReelsPage />} />
              </Route>
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
