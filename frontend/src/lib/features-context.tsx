import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, FEATURES_CHANGED_EVENT } from './api';
import { useAuth } from './auth-context';
import { lockedUntil, type Feature as LevelFeature } from './levels';

// What the admin has switched on or off for this kind of account (backend lib/features.ts, the "Features" page of the admin panel). Asked for when the
// app opens, again about once a minute while the page is in view, when the person comes back to the tab, and the moment the server answers "closed"
// (api.ts). Until the first answer arrives -- and whenever the server cannot be reached -- everything counts as ON, so a slow server never hides anything.

export type FeatureKey = 'reels' | 'map' | 'craft' | 'challenges' | 'worksheets' | 'ai_worksheets' | 'leaderboard' | 'friends' | 'teacher_upload';

const LEVEL_FREE_SWITCH: Partial<Record<LevelFeature, string>> = { map: 'map_open', quarry: 'craft_open' };

type Snapshot = {
  site: { on: boolean; message: string | null };
  features: Record<string, boolean>;
  signup: { student: boolean; teacher: boolean };
};

const OPEN: Snapshot = { site: { on: true, message: null }, features: {}, signup: { student: true, teacher: true } };
const EVERY_MS = 60_000;
const MIN_GAP_MS = 4_000;

type Value = {
  /** Is this feature on for the signed-in account? (Always true for an admin.) */
  isOn: (key: FeatureKey) => boolean;
  /** The whole site open for this account? When false the app shows the closed notice. */
  siteOn: boolean;
  siteMessage: string | null;
  /** The level a student still needs before this page opens, or null when it is open (their level is enough, or the admin opened it without a level). */
  levelLock: (feature: LevelFeature) => number | null;
  /** New accounts of this kind allowed? (for the sign-up page) */
  signupOn: (role: 'student' | 'teacher') => boolean;
  refresh: () => void;
};

const FeaturesContext = createContext<Value | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot>(OPEN);
  const lastAt = useRef(0);

  const load = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = now;
    api
      .get<Snapshot>('/features')
      .then((d) => setSnap({ site: d.site ?? OPEN.site, features: d.features ?? {}, signup: d.signup ?? OPEN.signup }))
      .catch(() => {
        // the server cannot be reached: keep what we had (or "everything on")
      });
  }, []);

  // a different person (or nobody) is signed in: ask again at once
  useEffect(() => {
    load(true);
  }, [load, user?.id]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = window.setInterval(tick, EVERY_MS);
    const onChanged = () => load();
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener(FEATURES_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener(FEATURES_CHANGED_EVENT, onChanged);
    };
  }, [load]);

  const value = useMemo<Value>(
    () => ({
      isOn: (key) => snap.features[key] !== false,
      siteOn: snap.site.on,
      siteMessage: snap.site.message,
      // the admin's "open without a level" switches are OFF unless the server says true (backend lib/features.ts map_open / craft_open)
      levelLock: (feature) => (snap.features[LEVEL_FREE_SWITCH[feature] ?? ''] === true ? null : lockedUntil(user, feature)),
      signupOn: (role) => snap.signup[role] !== false,
      refresh: () => load(true),
    }),
    [snap, load, user]
  );
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): Value {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error('useFeatures must be used inside <FeaturesProvider>');
  return ctx;
}
