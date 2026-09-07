/**
 * Dev utility: fully delete a test account by email -- local DB row, its Supabase
 * Storage ID document (if any), and the Firebase Auth user. Meant for cleaning up
 * accounts created while testing signup, not for production use.
 *
 * Usage: npm run admin:delete-user -- someone@example.com
 *
 * Requires backend/secrets/firebase-service-account.json (Firebase Console -> Project
 * Settings -> Service Accounts -> Generate new private key). Gitignored, never commit it.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../src/db/db.js';
import { supabaseAdmin } from '../src/lib/supabase.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:delete-user -- <email>');
  process.exit(1);
}

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? './secrets/firebase-service-account.json';

async function main() {
  const user = db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`).get(email) as any;

  if (user) {
    if (user.id_document_path) {
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.storage.from('teacher-id-documents').remove([user.id_document_path]);
        console.log(error ? `Storage: failed to delete (${error.message})` : `Storage: deleted ${user.id_document_path}`);
      } else {
        console.log('Storage: skipped (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured)');
      }
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(user.id);
    console.log(`Local DB: deleted row (id ${user.id}, username ${user.username})`);
  } else {
    console.log('Local DB: no matching row');
  }

  let serviceAccount: object;
  try {
    serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
  } catch {
    console.log(`Firebase: skipped (couldn't read ${SERVICE_ACCOUNT_PATH})`);
    return;
  }

  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();
  try {
    const firebaseUser = await auth.getUserByEmail(email);
    await auth.deleteUser(firebaseUser.uid);
    console.log(`Firebase: deleted user (uid ${firebaseUser.uid})`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.log('Firebase: no matching user');
    } else {
      console.error('Firebase: error --', err.message);
    }
  }
}

main();
