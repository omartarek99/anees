import { readFileSync } from 'node:fs';

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? './secrets/firebase-service-account.json';

/** The Firebase service-account credentials, or null if there are none. On a laptop they come
 * from backend/secrets/firebase-service-account.json; on a host (e.g. Render) where that
 * git-ignored file doesn't exist, paste the file's contents as ONE line into the
 * FIREBASE_SERVICE_ACCOUNT_JSON environment variable instead. */
export function loadServiceAccount(): object | null {
  try {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    return JSON.parse(inline ? inline : readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

type AdminAuth = import('firebase-admin/auth').Auth;
let authPromise: Promise<AdminAuth | null> | null = null;

/** Lazily initialised firebase-admin Auth (see deleteUser.ts for why it is not imported eagerly:
 * the app must keep booting without credentials). Resolves to null when there are none. */
export function getFirebaseAdminAuth(): Promise<AdminAuth | null> {
  authPromise ??= (async () => {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) return null;
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    return getAuth(getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) }));
  })();
  return authPromise;
}
