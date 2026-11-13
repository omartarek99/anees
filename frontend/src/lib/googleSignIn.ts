// Google sign-in, through Firebase: a popup where the person picks their Google account, then a Firebase ID token that our server checks
// (backend/src/lib/googleAuth.ts). The Firebase web package is only downloaded when someone actually presses the Google button.
//
// Needs the project's web settings in the build environment (frontend/.env.example), and, in the Firebase console, the Google provider turned on and
// the site's address in the authorised domains.

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
};

export const googleConfigured = !!(config.apiKey && config.authDomain && config.projectId);

export type GoogleSignInErrorCode = 'not-configured' | 'cancelled' | 'blocked' | 'domain' | 'failed';
export class GoogleSignInError extends Error {
  constructor(public code: GoogleSignInErrorCode) {
    super(code);
  }
}

type Kit = { auth: import('firebase/auth').Auth; provider: import('firebase/auth').GoogleAuthProvider; popup: typeof import('firebase/auth').signInWithPopup; signOut: typeof import('firebase/auth').signOut };
let kitPromise: Promise<Kit> | null = null;
let kit: Kit | null = null;

/** Downloads Firebase and warms the connection to its sign-in page. The Google button calls this when it appears, so the press itself opens
 * the popup straight away: Safari (iPhone) blocks a popup opened after an await, and the Firebase download was that await. */
export function prepareGoogle(): Promise<Kit> | null {
  if (!googleConfigured) return null;
  if (!kitPromise) {
    for (const href of [`https://${config.authDomain}`, 'https://apis.google.com']) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      document.head.appendChild(link);
    }
    kitPromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }]) => {
      const auth = getAuth(getApps()[0] ?? initializeApp({ apiKey: config.apiKey!, authDomain: config.authDomain!, projectId: config.projectId! }));
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' }); // always let them pick, even with one account signed in
      kit = { auth, provider, popup: signInWithPopup, signOut };
      return kit;
    });
    kitPromise.catch(() => (kitPromise = null)); // a failed download is tried again on the next press
  }
  return kitPromise;
}

/** Opens the Google popup and resolves with the Firebase ID token of the account the person picked. */
export async function getGoogleIdToken(): Promise<string> {
  if (!googleConfigured) throw new GoogleSignInError('not-configured');
  // No await before the popup when Firebase is already here (see prepareGoogle).
  const { auth, provider, popup, signOut } = kit ?? (await prepareGoogle()!);
  try {
    const credential = await popup(auth, provider);
    const token = await credential.user.getIdToken();
    // Our own session cookie is what keeps them signed in: Firebase's copy is not needed after this.
    await signOut(auth).catch(() => {});
    return token;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new GoogleSignInError('cancelled');
    if (code === 'auth/popup-blocked') throw new GoogleSignInError('blocked');
    if (code === 'auth/unauthorized-domain') throw new GoogleSignInError('domain');
    throw new GoogleSignInError('failed');
  }
}
