import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from './api';
import { DEV_BYPASS_LOGIN, DEV_ACCOUNT } from './dev-config';
import type { RankTier } from '../components/RankBadge';

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
  role: Role;
  grade: number | null;
  schoolName: string | null;
  teacherSubject: string | null;
  createdAt: string;
  warningMessage: string | null;
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
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyEmail: (oobCode: string) => Promise<void>;
  /** Resolves with how the server verifies: a typed 6-digit code ('otp') or an emailed link. */
  resendVerification: (idToken: string, lang?: 'en' | 'ar') => Promise<{ method: 'otp' | 'link' }>;
  /** Confirms the 6-digit code; on success the account is verified and the user is logged in. */
  verifyOtp: (idToken: string, code: string) => Promise<void>;
  dismissWarning: () => Promise<void>;
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
  };

  const logout = async () => {
    await api.post('/auth/logout');
    // Both updates land in one render, so ProtectedLayout shows the landing page at "/" instead of bouncing the
    // signed-out user from whatever private page they were on to /login.
    navigate('/', { replace: true });
    setUser(null);
  };

  const verifyEmail: AuthContextValue['verifyEmail'] = async (oobCode) => {
    const data = await api.post<{ user: User }>('/auth/verify-email', { oobCode });
    setUser(data.user);
  };

  const verifyOtp: AuthContextValue['verifyOtp'] = async (idToken, code) => {
    const data = await api.post<{ user: User }>('/auth/verify-otp', { idToken, code });
    setUser(data.user);
  };

  const resendVerification: AuthContextValue['resendVerification'] = async (idToken, lang) => {
    const data = await api.post<{ ok: true; method?: 'otp' | 'link' }>('/auth/resend-verification', { idToken, lang });
    return { method: data.method ?? 'link' };
  };

  const dismissWarning = async () => {
    const data = await api.post<{ user: User }>('/auth/dismiss-warning');
    setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signup, login, logout, refreshUser, verifyEmail, resendVerification, verifyOtp, dismissWarning }}
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
