const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

if (!FIREBASE_API_KEY) {
  console.warn(
    '[firebase] FIREBASE_API_KEY not set (see backend/.env.example) -- signup/login ' +
      'email verification is disabled until backend/.env is filled in.'
  );
}

const BASE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

type FirebaseResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(op: string, body: Record<string, unknown>): Promise<FirebaseResult<T>> {
  if (!FIREBASE_API_KEY) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }
  try {
    const res = await fetch(`${BASE_URL}:${op}?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? 'UNKNOWN_ERROR' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}

export function firebaseSignUp(email: string, password: string) {
  return call<{ idToken: string; localId: string }>('signUp', {
    email,
    password,
    returnSecureToken: true,
  });
}

export function firebaseSignIn(email: string, password: string) {
  return call<{ idToken: string; localId: string }>('signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
}

export function firebaseLookup(idToken: string) {
  return call<{ users: { email: string; emailVerified: boolean; localId: string }[] }>('lookup', {
    idToken,
  });
}

export function firebaseSendVerificationEmail(idToken: string, continueUrl: string) {
  return call<{ email: string }>('sendOobCode', {
    requestType: 'VERIFY_EMAIL',
    idToken,
    continueUrl,
    canHandleCodeInApp: true,
  });
}

export function firebaseConfirmVerification(oobCode: string) {
  return call<{ email: string; localId: string }>('update', { oobCode });
}

export function firebaseDeleteUser(idToken: string) {
  return call<{ kind: string }>('delete', { idToken });
}
