import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter, Routes, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { LanguageProvider, useLanguage } from './lib/language-context';
import { ThemeProvider } from './lib/theme-context';
import { RankAura } from './components/RankAura';
import { trackPageview } from './lib/analytics';
import { Sidebar } from './components/Sidebar';
import { AvatarBoundary } from './components/avatar3d/AvatarBoundary';
import { LanguageToggle } from './components/LanguageToggle';
import { ThemeToggle } from './components/ThemeToggle';
import { QuickMenu } from './components/QuickMenu';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { Footer } from './components/Footer';
import { WarningModal } from './components/WarningModal';
import { DoublePointsNotification } from './components/DoublePointsNotification';
import { CertificateAwardPopup } from './components/CertificateAwardPopup';
import { RankMilestonePopup } from './components/RankMilestonePopup';
import { ChallengeHost } from './components/ChallengeHost';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { GuideHost } from './components/GuideHost';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsPage } from './pages/TermsPage';
import { CookiePolicyPage } from './pages/CookiePolicyPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LandingPage } from './pages/LandingPage';

// Every signed-in page loads on demand, so a visitor on the landing, login or signup pages doesn't
// download them (the Quarry alone pulls in three.js, ~1 MB).
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const TeacherHomePage = lazy(() => import('./pages/TeacherHomePage').then((m) => ({ default: m.TeacherHomePage })));
const ReelsPage = lazy(() => import('./pages/ReelsPage').then((m) => ({ default: m.ReelsPage })));
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const LevelQuizPage = lazy(() => import('./pages/LevelQuizPage').then((m) => ({ default: m.LevelQuizPage })));
const WorksheetsPage = lazy(() => import('./pages/WorksheetsPage').then((m) => ({ default: m.WorksheetsPage })));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })));
const FriendsPage = lazy(() => import('./pages/FriendsPage').then((m) => ({ default: m.FriendsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const TeacherReelsPage = lazy(() => import('./pages/TeacherReelsPage').then((m) => ({ default: m.TeacherReelsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const CraftPage = lazy(() => import('./pages/CraftPage').then((m) => ({ default: m.CraftPage })));
// Dev-only: the 3D map with made-up progress and no login (see the page). Not part of the production build.
const MapPreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/MapPreviewPage').then((m) => ({ default: m.MapPreviewPage }))) : null;
const AnimalPreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/AnimalPreviewPage').then((m) => ({ default: m.AnimalPreviewPage }))) : null;

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

function PageviewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}

// Each public page gets its own browser-tab title and search snippet, so Google can tell the login page from
// the signup page. The text is bilingual on purpose (not tied to the language toggle): Google reads the page in
// the site's default language, and people search for "Anees login" as often as "تسجيل الدخول". Every other
// page (the landing page and the signed-in app) keeps the plain site title "Anees".
const SITE_TITLE = 'Anees | أنيس';
const PAGE_META: Record<string, { title: string; description: string }> = {
  '/login': {
    title: 'Log in | تسجيل الدخول | Anees',
    description: 'Log in to Anees to continue your lessons, quizzes and rewards. سجّل الدخول إلى أنيس لمتابعة دروسك واختباراتك ومكافآتك.',
  },
  '/signup': {
    title: 'Sign up | إنشاء حساب | Anees',
    description: 'Create your Anees account as a student or a teacher. أنشئ حسابك في أنيس كطالب أو معلّم وابدأ التعلّم.',
  },
  '/forgot-password': { title: 'Reset password | استعادة كلمة المرور | Anees', description: '' },
  '/verify-email': { title: 'Verify email | تفعيل البريد | Anees', description: '' },
  '/privacy': { title: 'Privacy policy | سياسة الخصوصية | Anees', description: '' },
  '/terms': { title: 'Terms and conditions | الشروط والأحكام | Anees', description: '' },
  '/cookies': { title: 'Cookie policy | سياسة ملفات تعريف الارتباط | Anees', description: '' },
};
let defaultDescription: string | null = null;
const SITE_ORIGIN = 'https://anees-qa.site';

function PageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = PAGE_META[pathname];
    document.title = meta?.title ?? SITE_TITLE;
    // Each public page names itself as the address Google should list (they all share one HTML shell, so without this the
    // login, sign-up and policy pages can look like copies of the home page); every other address points to the home page.
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_ORIGIN}${meta ? pathname : '/'}`;
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) return;
    if (defaultDescription === null) defaultDescription = tag.content;
    tag.content = meta?.description || defaultDescription;
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
  const { t } = useLanguage();
  const { pathname } = useLocation();
  if (loading) return <FullScreenLoader />;
  // A visitor who isn't signed in lands on the public landing page at "/"; any other private URL still goes to login.
  if (!user) return pathname === '/' ? <LandingPage /> : <Navigate to="/login" replace />;
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
          {/* A page's chunk can fail to download (offline, or a stale filename after a redeploy) -- show an
              error here instead of letting the rejected lazy import blank the whole app. */}
          <AvatarBoundary fallback={<div className="form-error-banner">{t('messages.loadError')}</div>}>
            <Suspense fallback={<div className="empty-state"><div className="spinner" /></div>}>
              <Outlet />
            </Suspense>
          </AvatarBoundary>
        </main>
        {!hideFooter && <Footer />}
      </div>
      <QuickMenu />
      <GuideHost />
      {/* Admin has no quiz/gameplay surface of its own -- nothing for this to announce there. */}
      {user.role !== 'admin' && <DoublePointsNotification />}
      {/* Certificates are only ever issued to students/teachers (routes/admin.ts rejects
          admin recipients), so there's nothing for an admin account to ever be announced. */}
      {user.role !== 'admin' && <ChallengeHost />}
      {user.role !== 'admin' && <RankMilestonePopup />}
      {user.role !== 'admin' && <CertificateAwardPopup />}
    </div>
  );
}

// Students and teachers still land straight on Reels right after signing in (see PublicOnlyLayout below) —
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
  // First page after signing in: students and teachers land on Reels, admins land on the admin panel.
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/reels'} replace />;
  return (
    <div style={{ position: 'relative' }}>
      <div className="flex gap-sm" style={{ position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 10 }}>
        <ThemeToggle />
        <LanguageToggle />
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
            <RankAura />
            <PageviewTracker />
            <PageMeta />
            <ScrollToTop />
            <Routes>
              {/* Public regardless of auth state — a visitor should be able to read these before ever signing up. */}
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/cookies" element={<CookiePolicyPage />} />
              <Route path="/welcome" element={<LandingPage />} />
              {MapPreviewPage && (
                <Route
                  path="/dev/map3d"
                  element={
                    <Suspense fallback={null}>
                      <MapPreviewPage />
                    </Suspense>
                  }
                />
              )}
              {AnimalPreviewPage && (
                <Route
                  path="/dev/animals"
                  element={
                    <Suspense fallback={null}>
                      <AnimalPreviewPage />
                    </Suspense>
                  }
                />
              )}

              <Route element={<PublicOnlyLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
              </Route>

              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<RoleHome />} />
                <Route element={<NoAdmin />}>
                  <Route path="/reels" element={<ReelsPage />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/map/level/:levelNumber" element={<LevelQuizPage />} />
                  <Route path="/craft" element={<CraftPage />} />
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
                <Route path="/password" element={<ChangePasswordPage />} />
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
