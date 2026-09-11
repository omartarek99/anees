import { useEffect } from 'react';
import { Navigate, Route, BrowserRouter, Routes, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { LanguageProvider } from './lib/language-context';
import { ThemeProvider } from './lib/theme-context';
import { trackPageview } from './lib/analytics';
import { Sidebar } from './components/Sidebar';
import { LanguageToggle } from './components/LanguageToggle';
import { ThemeToggle } from './components/ThemeToggle';
import { QuickMenu } from './components/QuickMenu';
import { Footer } from './components/Footer';
import { WarningModal } from './components/WarningModal';
import { CookieConsentBanner } from './components/CookieConsentBanner';
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
import { AdminPage } from './pages/AdminPage';

function PageviewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}

function FullScreenLoader() {
  return (
    <div style={{ height: '100vh' }} className="flex-center">
      <div className="spinner" />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  // Reels is a full-viewport, TikTok-style feed (see ReelsPage's own negative-margin/100vh
  // sizing) -- a footer peeking in below it would just reintroduce the page scroll that
  // sizing is specifically trying to avoid, and a persistent footer has no place in an
  // immersive video feed anyway.
  const hideFooter = pathname === '/reels';
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content-col">
        <main className="app-main">
          <WarningModal />
          <Outlet />
        </main>
        {!hideFooter && <Footer />}
      </div>
      <QuickMenu />
    </div>
  );
}

// Students still land straight on Reels right after signing in (see PublicOnlyLayout below) —
// but "/" itself, and the sidebar's Home icon that points there, needs to be a real, distinct
// homepage to navigate back to, not just another way to reach Reels. Admin has no gameplay
// home at all — its whole account exists to manage other accounts, so "/" just forwards
// straight to the admin panel.
function RoleHome() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
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

/** Gates the admin panel to admin accounts only. Unlike teacher, admin has no gameplay
 * surface at all -- there's nothing else on the site for it to fall back to besides "/",
 * which itself just forwards an admin back here (see RoleHome above). */
function AdminOnly() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

// Admin has no XP/level/rank of its own -- its account exists purely to manage other
// accounts, so its own profile page (reachable from QuickMenu) forwards straight to the
// user list it actually wants, same as RoleHome does for "/".
function ProfileHome() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <ProfilePage />;
}

function PublicOnlyLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  // First page after signing in: students land on Reels, admins land on the admin panel,
  // teachers land on Home.
  if (user) return <Navigate to={user.role === 'student' ? '/reels' : user.role === 'admin' ? '/admin' : '/'} replace />;
  return (
    <div style={{ position: 'relative' }}>
      <div className="flex gap-sm" style={{ position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 10 }}>
        <ThemeToggle floating />
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
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <PageviewTracker />
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
                <Route element={<AdminOnly />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
                <Route path="/profile" element={<ProfileHome />} />
                <Route path="/profile/:username" element={<ProfilePage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CookieConsentBanner />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
