import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter, Routes, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { LanguageProvider, useLanguage } from './lib/language-context';
import { ThemeProvider } from './lib/theme-context';
import { trackPageview } from './lib/analytics';
import { Sidebar } from './components/Sidebar';
import { AvatarBoundary } from './components/avatar3d/AvatarBoundary';
import { LanguageToggle } from './components/LanguageToggle';
import { ThemeToggle } from './components/ThemeToggle';
import { QuickMenu } from './components/QuickMenu';
import { Footer } from './components/Footer';
import { WarningModal } from './components/WarningModal';
import { DoublePointsNotification } from './components/DoublePointsNotification';
import { CertificateAwardPopup } from './components/CertificateAwardPopup';
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
import { WorksheetsPage } from './pages/WorksheetsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { FriendsPage } from './pages/FriendsPage';
import { ProfilePage } from './pages/ProfilePage';
import { TeacherReelsPage } from './pages/TeacherReelsPage';
import { AdminPage } from './pages/AdminPage';

// The Quarry is the only place that needs three.js (~1 MB), so it loads on demand instead of
// weighing down the first load of every page.
const CraftPage = lazy(() => import('./pages/CraftPage').then((m) => ({ default: m.CraftPage })));

// Navigating to a new page starts at its top (e.g. the Terms link at the bottom of signup).
// Back/forward (POP) keep the browser's own scroll restoration.
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// The Quarry's chunk can fail to download (offline, or a stale filename after a redeploy) -- show an
// error in the page instead of letting the rejected lazy import blank the whole app.
function CraftRoute() {
  const { t } = useLanguage();
  return (
    <AvatarBoundary fallback={<div className="form-error-banner">{t('messages.loadError')}</div>}>
      <Suspense fallback={<FullScreenLoader />}>
        <CraftPage />
      </Suspense>
    </AvatarBoundary>
  );
}

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
      {/* Admin has no quiz/gameplay surface of its own -- nothing for this to announce there. */}
      {user.role !== 'admin' && <DoublePointsNotification />}
      {/* Certificates are only ever issued to students/teachers (routes/admin.ts rejects
          admin recipients), so there's nothing for an admin account to ever be announced. */}
      {user.role !== 'admin' && <CertificateAwardPopup />}
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

/** Admin has no gameplay surface (see AdminOnly): a gameplay URL typed by hand sends it back to
 * the panel, so an admin can't earn XP or appear on the student leaderboard. */
function NoAdmin() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
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
            <ScrollToTop />
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
                <Route element={<NoAdmin />}>
                  <Route path="/reels" element={<ReelsPage />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/craft" element={<CraftRoute />} />
                  <Route path="/worksheets" element={<WorksheetsPage />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/friends" element={<FriendsPage />} />
                </Route>
                <Route element={<TeacherOnly />}>
                  <Route path="/teacher/reels" element={<TeacherReelsPage />} />
                </Route>
                <Route element={<AdminOnly />}>
                  <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                  <Route path="/admin/:tab" element={<AdminPage />} />
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
