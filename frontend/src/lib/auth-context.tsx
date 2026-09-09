import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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
  playerLevel: number;
  rankTier: RankTier;
  role: Role;
  grade: number | null;
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
    displayName: string;
    avatarKey: string;
    role: Role;
    grade?: number;
    idDocument?: File;
  }) => Promise<{ email: string; idToken: string }>;
  login: (input: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyEmail: (oobCode: string) => Promise<void>;
  resendVerification: (idToken: string) => Promise<void>;
  dismissWarning: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    formData.append('displayName', input.displayName);
    formData.append('avatarKey', input.avatarKey);
    formData.append('role', input.role);
    if (input.grade !== undefined) formData.append('grade', String(input.grade));
    if (input.idDocument) formData.append('idDocument', input.idDocument);

    const data = await api.postForm<{ pendingVerification: true; email: string; idToken: string }>(
      '/auth/signup',
      formData
    );
    return { email: data.email, idToken: data.idToken };
  };

  const login: AuthContextValue['login'] = async (input) => {
    const data = await api.post<{ user: User }>('/auth/login', input);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const verifyEmail: AuthContextValue['verifyEmail'] = async (oobCode) => {
    const data = await api.post<{ user: User }>('/auth/verify-email', { oobCode });
    setUser(data.user);
  };

  const resendVerification: AuthContextValue['resendVerification'] = async (idToken) => {
    await api.post('/auth/resend-verification', { idToken });
  };

  const dismissWarning = async () => {
    const data = await api.post<{ user: User }>('/auth/dismiss-warning');
    setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signup, login, logout, refreshUser, verifyEmail, resendVerification, dismissWarning }}
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
