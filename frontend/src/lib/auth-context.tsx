import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from './api';
import { reloadIfOutdated } from './version-check';
import { DEV_BYPASS_LOGIN, DEV_ACCOUNT } from './dev-config';
import type { RankTier } from '../components/RankBadge';
import type { RankKey } from './medalLevels';

export type Role = 'student' | 'teacher' | 'admin';

export type User = {
  id: number;
  username: string;
  displayName: string;
  avatarKey: string;
  totalXp: number;
  // Only ever nonzero for teachers (their own currency, separate from XP).
  teacherPoints: number;
  playerLevel: number;
  rankTier: RankTier;
  /** The page colour a student picked: 'normal' (the site's own colours) or a rank they have reached; null follows their rank (see RankAura.tsx). */
  auraRank?: RankKey | 'normal' | null;
  /** Set while a student has a "your rank dropped" pop-up to see: the division they fell from, and the page colour they had picked there (RankDemotionPopup.tsx). */
  rankDrop?: { from: RankTier; auraBefore: RankKey | 'normal' | null } | null;
  role: Role;
  grade: number | null;
  schoolName: string | null;
  teacherSubject: string | null;
  createdAt: string;
  warningMessage: string | null;
  /** Which warning the one showing is (1st, 2nd ...). */
  warningNumber?: number | null;
  /** False for a Google sign-up that has not yet given its name / school / grade (or ID): the app shows only the profile step until then. */
  profileComplete?: boolean;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signup: (input: {
    username: string;
    email: string;
    password: string;
    /** The person's name (shown on their profile); the backend falls back to the username if absent. */
    displayName?: string;
    avatarKey: string;
    role: Role;
    grade?: number;
    schoolName: string;
    /** Teachers only -- a key from the signup subject list. */
    teacherSubject?: string;
    idDocument?: File;
    /** Honeypot -- see SignupPage.tsx. Always '' from a real submission. */
    website?: string;
    /** Language for the verification email. */
    lang?: 'en' | 'ar';
  }) => Promise<{ email: string; idToken: string; method: 'otp' | 'link' }>;
  login: (input: { username: string; password: string }) => Promise<void>;
  /** Signs in (or, with a `role`, signs up) with a Firebase ID token from the Google popup. `needsRole` = a new Google account that still has to pick student / teacher. */
  loginWithGoogle: (idToken: string, role?: 'student' | 'teacher') => Promise<{ needsRole: boolean; created: boolean }>;
  /** The step after a Google sign-up: name, school and grade (student) or subject + ID photo (teacher). */
  completeProfile: (input: { displayName: string; schoolName: string; grade?: number; teacherSubject?: string; idDocument?: File }) => Promise<void>;
  logout: () => Promise<void>;
  /** Switches to another of the person's linked accounts (components/AccountSwitcher.tsx) and reloads the app as that account. */
  switchAccount: (userId: number) => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyEmail: (oobCode: string) => Promise<void>;
  /** Resolves with how the server verifies: a typed 6-digit code ('otp') or an emailed link. */
  resendVerification: (idToken: string, lang?: 'en' | 'ar') => Promise<{ method: 'otp' | 'link' }>;
  /** Confirms the 6-digit code; on success the account is verified and the user is logged in. */
  verifyOtp: (idToken: string, code: string) => Promise<void>;
  dismissWarning: () => Promise<void>;
  /** The student has seen the rank-dropped pop-up. */
  dismissRankDrop: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<{ user: User }>('/auth/me');
        setUser(data.user);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          setLoading(false);
          return;
        }
        if (DEV_BYPASS_LOGIN) {
          try {
            const data = await api.post<{ user: User }>('/auth/login', DEV_ACCOUNT);
            setUser(data.user);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const signup: AuthContextValue['signup'] = async (input) => {
    const formData = new FormData();
    formData.append('username', input.username);
    formData.append('email', input.email);
    formData.append('password', input.password);
    if (input.displayName) formData.append('displayName', input.displayName);
    formData.append('schoolName', input.schoolName);
    if (input.teacherSubject) formData.append('teacherSubject', input.teacherSubject);
    formData.append('avatarKey', input.avatarKey);
    formData.append('role', input.role);
    if (input.grade !== undefined) formData.append('grade', String(input.grade));
    if (input.idDocument) formData.append('idDocument', input.idDocument);
    formData.append('website', input.website ?? '');
    if (input.lang) formData.append('lang', input.lang);

    const data = await api.postForm<{ pendingVerification: true; email: string; idToken: string; method?: 'otp' | 'link' }>(
      '/auth/signup',
      formData
    );
    return { email: data.email, idToken: data.idToken, method: data.method ?? 'link' };
  };

  const login: AuthContextValue['login'] = async (input) => {
    const data = await api.post<{ user: User }>('/auth/login', input);
    setUser(data.user);
    void reloadIfOutdated(); // signing in is a good moment to pick up a newer version of the site (once)
  };

  const loginWithGoogle: AuthContextValue['loginWithGoogle'] = async (idToken, role) => {
    const data = await api.post<{ user?: User; created?: boolean; needsRole?: boolean }>('/auth/google', { idToken, role });
    if (data.needsRole || !data.user) return { needsRole: true, created: false };
    setUser(data.user);
    void reloadIfOutdated();
    return { needsRole: false, created: !!data.created };
  };

  const completeProfile: AuthContextValue['completeProfile'] = async (input) => {
    const formData = new FormData();
    formData.append('displayName', input.displayName);
    formData.append('schoolName', input.schoolName);
    if (input.grade !== undefined) formData.append('grade', String(input.grade));
    if (input.teacherSubject) formData.append('teacherSubject', input.teacherSubject);
    if (input.idDocument) formData.append('idDocument', input.idDocument);
    const data = await api.postForm<{ user: User }>('/auth/complete-profile', formData);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    // Both updates land in one render, so ProtectedLayout shows the landing page at "/" instead of bouncing the
    // signed-out user from whatever private page they were on to /login.
    navigate('/', { replace: true });
    setUser(null);
  };

  const switchAccount = async (userId: number) => {
    await api.post('/auth/switch-account', { userId });
    // the session cookie is now the other account's: a fresh load starts the whole app from it (no page keeps the last account's data)
    window.location.assign('/');
  };

  const verifyEmail: AuthContextValue['verifyEmail'] = async (oobCode) => {
    const data = await api.post<{ user: User }>('/auth/verify-email', { oobCode });
    setUser(data.user);
  };

  const verifyOtp: AuthContextValue['verifyOtp'] = async (idToken, code) => {
    const data = await api.post<{ user: User }>('/auth/verify-otp', { idToken, code });
    setUser(data.user);
    void reloadIfOutdated();
  };

  const resendVerification: AuthContextValue['resendVerification'] = async (idToken, lang) => {
    const data = await api.post<{ ok: true; method?: 'otp' | 'link' }>('/auth/resend-verification', { idToken, lang });
    return { method: data.method ?? 'link' };
  };

  const dismissWarning = async () => {
    const data = await api.post<{ user: User }>('/auth/dismiss-warning');
    setUser(data.user);
  };

  const dismissRankDrop = async () => {
    setUser((u) => (u ? { ...u, rankDrop: null } : u)); // gone at once; the server forgets it when this lands
    try {
      const data = await api.post<{ user: User }>('/auth/dismiss-rank-drop');
      setUser(data.user);
    } catch {
      // it comes back on the next visit, harmless
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signup, login, loginWithGoogle, completeProfile, logout, switchAccount, refreshUser, verifyEmail, resendVerification, verifyOtp, dismissWarning, dismissRankDrop }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
