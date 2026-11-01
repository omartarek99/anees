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

/** Opens the Google popup and resolves with the Firebase ID token of the account the person picked. */
export async function getGoogleIdToken(): Promise<string> {
  if (!googleConfigured) throw new GoogleSignInError('not-configured');
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const auth = getAuth(getApps()[0] ?? initializeApp({ apiKey: config.apiKey!, authDomain: config.authDomain!, projectId: config.projectId! }));
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' }); // always let them pick, even with one account signed in
  try {
    const credential = await signInWithPopup(auth, provider);
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
