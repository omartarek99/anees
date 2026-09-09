/**
 * Dev utility: fully delete a test account by email -- local DB row, its Supabase
 * Storage ID document (if any), and the Firebase Auth user. Meant for cleaning up
 * accounts created while testing signup, not for production use. The same underlying
 * logic also backs the admin panel's delete-account action (see src/lib/deleteUser.ts).
 *
 * Usage: npm run admin:delete-user -- someone@example.com
 *
 * Requires backend/secrets/firebase-service-account.json (Firebase Console -> Project
 * Settings -> Service Accounts -> Generate new private key). Gitignored, never commit it.
 */
import 'dotenv/config';
import { deleteUserByEmail } from '../src/lib/deleteUser.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:delete-user -- <email>');
  process.exit(1);
}

const result = await deleteUserByEmail(email);
if (!result.found) {
  console.log('Local DB: no matching row');
} else {
  console.log(`Local DB: deleted row (username ${result.username})`);
  if (result.storage) console.log(`Storage: ${result.storage}`);
  console.log(`Firebase: ${result.firebase}`);
}
