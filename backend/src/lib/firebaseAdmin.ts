import { readFileSync } from 'node:fs';

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? './secrets/firebase-service-account.json';

type ServiceAccount = { project_id: string; client_email: string; private_key: string; [key: string]: unknown };
export type ServiceAccountResult = { ok: true; account: ServiceAccount; source: string } | { ok: false; reason: string };

function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Pasted into a hosting dashboard, the key's "\n" escapes are sometimes turned into REAL line
    // breaks, which makes the JSON invalid. A one-line JSON has line breaks only inside the private
    // key, so putting the escapes back repairs it.
    try {
      parsed = JSON.parse(raw.replace(/\r?\n/g, '\\n'));
    } catch {
      // Deliberately no JSON.parse message: it can quote part of the private key.
      throw new Error('not valid JSON, even after repairing line breaks');
    }
  }
  const account = parsed as Partial<ServiceAccount>;
  if (!account || typeof account.private_key !== 'string' || typeof account.client_email !== 'string' || typeof account.project_id !== 'string') {
    throw new Error('it is JSON but is missing project_id / client_email / private_key');
  }
  // A double-escaped key ("\\n" as text) also breaks signing.
  return { ...account, private_key: account.private_key.replace(/\\n/g, '\n') } as ServiceAccount;
}

/** The Firebase service-account credentials, or why there are none. Looked up in this order:
 *  FIREBASE_SERVICE_ACCOUNT_BASE64 (the file's contents base64-encoded -- immune to dashboards
 *  mangling quotes and line breaks, the safest way on a host), FIREBASE_SERVICE_ACCOUNT_JSON
 *  (the file's contents as one line), then the file backend/secrets/firebase-service-account.json. */
export function loadServiceAccount(): ServiceAccountResult {
  const sources: { name: string; read: () => string | undefined }[] = [
    {
      name: 'FIREBASE_SERVICE_ACCOUNT_BASE64',
      read: () => (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.trim(), 'base64').toString('utf8') : undefined),
    },
    { name: 'FIREBASE_SERVICE_ACCOUNT_JSON', read: () => process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || undefined },
    {
      name: SERVICE_ACCOUNT_PATH,
      read: () => {
        try {
          return readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8');
        } catch {
          return undefined;
        }
      },
    },
  ];
  const problems: string[] = [];
  for (const s of sources) {
    const raw = s.read();
    if (!raw) continue;
    try {
      return { ok: true, account: parseServiceAccount(raw), source: s.name };
    } catch (err) {
      problems.push(`${s.name} is set but unusable (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return {
    ok: false,
    reason: problems.length > 0 ? problems.join('; ') : 'none of FIREBASE_SERVICE_ACCOUNT_BASE64 / FIREBASE_SERVICE_ACCOUNT_JSON is set and there is no secrets file',
  };
}

type AdminAuth = import('firebase-admin/auth').Auth;
let authPromise: Promise<AdminAuth | null> | null = null;

/** Lazily initialised firebase-admin Auth (see deleteUser.ts for why it is not imported eagerly:
 * the app must keep booting without credentials). Resolves to null when there are none. */
export function getFirebaseAdminAuth(): Promise<AdminAuth | null> {
  authPromise ??= (async () => {
    const result = loadServiceAccount();
    if (!result.ok) return null;
    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      return getAuth(getApps()[0] ?? initializeApp({ credential: cert(result.account as never) }));
    } catch (err) {
      console.error('[firebase-admin] could not start with the service account:', err instanceof Error ? err.message : err);
      return null;
    }
  })();
  return authPromise;
}
