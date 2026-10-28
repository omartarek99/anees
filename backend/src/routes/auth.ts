import { asyncRouter } from '../lib/asyncRouter.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db } from '../db/db.js';
import { createSession, destroySession, SESSION_COOKIE } from '../lib/session.js';
import { moderateText } from '../lib/moderation.js';
import { validateBody, requireCsrfHeader, handleUpload } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { signupSchema, loginSchema, verifyEmailSchema, resendVerificationSchema, verifyOtpSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from '../lib/schemas.js';
import { getPlayerLevel } from '../lib/xp.js';
import { hasShield } from '../lib/battle.js';
import { getRankTier, getTeacherRankTier } from '../lib/ranks.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  firebaseSignUp,
  firebaseSignIn,
  firebaseLookup,
  firebaseConfirmVerification,
  firebaseUpdatePassword,
  firebaseDeleteUser,
} from '../lib/firebase.js';
import { verifyQatarIdPhoto, type IdVerificationFailureReason } from '../lib/idVerification.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';
import { sendVerificationEmail, sendOtpEmail, sendResetOtpEmail, otpDeliveryAvailable, type SendResult } from '../lib/mailer.js';
import { createOtp, verifyOtp, clearOtp } from '../lib/otp.js';
import { recordIssue } from '../lib/diagnostics.js';
import { getFirebaseAdminAuth } from '../lib/firebaseAdmin.js';
import { encrypt, decrypt, hashForLookup } from '../lib/encryption.js';
import { BCRYPT_COST } from '../lib/password.js';

export const authRouter = asyncRouter();

const ID_DOCUMENT_BUCKET = 'teacher-id-documents';
// JPEG/PNG only -- the automated ID check below runs OCR on the raw photo, which needs
// a rasterized image (no PDF-to-image step) and reliable decode support (no WebP).
const ID_DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const ID_VERIFICATION_MESSAGES: Record<IdVerificationFailureReason, string> = {
  NOT_QATAR_ID: "We couldn't confirm this is a Qatar ID. Please upload a clear photo of your Qatar ID.",
  UNDERAGE: 'You must be 23 or older to sign up as a teacher.',
  UNREADABLE: "We couldn't read the date of birth on this ID. Please upload a clearer photo.",
};

const idDocumentUpload = multer({
  storage: multer.memoryStorage(),
  // Signup is unauthenticated and multipart bodies skip express.json's 100kb cap, so bound the
  // number and size of text fields too -- otherwise a flood of big fields is buffered in memory
  // before validation ever rejects it.
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, fieldSize: 10 * 1024, parts: 25 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in ID_DOCUMENT_MIME_TO_EXT) cb(null, true);
    else cb(new Error('INVALID_ID_DOCUMENT_TYPE'));
  },
}).single('idDocument');

const handleIdDocumentUpload = handleUpload(idDocumentUpload, 'Please upload a valid ID (JPG or PNG, under 5MB).');

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// Firebase's "wrong credentials" error varies by API version/config.
const WRONG_CREDENTIALS_ERRORS = new Set(['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS']);

// See its one use in /login below -- a fixed hash to burn bcrypt time against when no
// account exists at all, so that path can't be timed apart from a real wrong-password check.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('anees-timing-safety-placeholder', BCRYPT_COST);

function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    totalXp: user.total_xp,
    teacherPoints: user.teacher_points ?? 0,
    playerLevel: getPlayerLevel(user.id),
    // Teachers rank by teacher points, students by XP -- same rule as the profile and leaderboard.
    rankTier: user.role === 'teacher' ? getTeacherRankTier(user.teacher_points ?? 0) : getRankTier(user.total_xp),
    role: user.role,
    grade: user.grade,
    schoolName: user.school_name ?? null,
    teacherSubject: user.teacher_subject ?? null,
    createdAt: user.created_at,
    warningMessage: user.warning_message ?? null,
    hasShield: hasShield(user.id),
  };
}

// Tesseract is CPU-heavy and signup is public: cap concurrent ID checks so a burst can't pin the server.
const MAX_CONCURRENT_ID_CHECKS = 2;
let idChecksRunning = 0;

authRouter.post(
  '/signup',
  authLimiter,
  requireCsrfHeader,
  handleIdDocumentUpload,
  validateBody(signupSchema),
  async (req, res) => {
    const { username, email, password, avatarKey, role, grade, schoolName, teacherSubject, lang } = req.body;
    // Falls back to the username if the client did not send a name.
    const displayName: string = req.body.displayName ?? username;
    const idDocument = req.file;

    const usernameCheck = moderateText(username);
    if (!usernameCheck.allowed) {
      res.status(400).json({ error: 'Please choose an appropriate username.' });
      return;
    }
    const nameCheck = moderateText(displayName);
    if (!nameCheck.allowed) {
      res.status(400).json({ error: 'Please choose an appropriate display name.' });
      return;
    }
    if (!moderateText(schoolName).allowed) {
      res.status(400).json({ error: 'Please enter an appropriate school name.' });
      return;
    }
    if (role === 'teacher' && !idDocument) {
      res.status(400).json({ error: 'Please upload your ID to verify your account.' });
      return;
    }
    if (role === 'teacher' && idDocument) {
      if (idChecksRunning >= MAX_CONCURRENT_ID_CHECKS) {
        res.status(503).json({ error: 'We are busy right now. Please try again in a minute.' });
        return;
      }
      idChecksRunning++;
      let verification: Awaited<ReturnType<typeof verifyQatarIdPhoto>>;
      try {
        verification = await verifyQatarIdPhoto(idDocument.buffer);
      } finally {
        idChecksRunning--;
      }
      if (!verification.ok) {
        res.status(400).json({ error: ID_VERIFICATION_MESSAGES[verification.reason] });
        return;
      }
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE lower(username) = lower(?) OR email_hash = ?`)
      .get(username, hashForLookup(email));
    if (existing) {
      res.status(409).json({ error: 'That username or email is already taken.' });
      return;
    }

    const signUpResult = await firebaseSignUp(email, password);
    if (!signUpResult.ok) {
      if (signUpResult.error === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'That username or email is already taken.' });
      } else {
        console.error('Firebase signUp failed:', signUpResult.error);
        recordIssue('firebase-signup', signUpResult.error);
        res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      }
      return;
    }
    const { idToken, localId } = signUpResult.data;

    let userId: number;
    try {
      userId = Number(
        db
          .prepare(
            `INSERT INTO users (username, email, email_hash, password_hash, display_name, avatar_key, total_xp, role, grade, firebase_uid, school_name, teacher_subject) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)`
          )
          .run(
            username,
            encrypt(email),
            hashForLookup(email),
            '',
            displayName,
            // Teachers don't pick a hero: they start with the plain anonymous picture.
            role === 'teacher' ? 'anonymous' : avatarKey,
            role,
            role === 'student' ? grade ?? null : null,
            localId,
            schoolName,
            role === 'teacher' ? teacherSubject ?? null : null
          )
          .lastInsertRowid
      );
    } catch (err) {
      // Two signups for the same username can both pass the SELECT above (Firebase is awaited in
      // between); the loser hits the UNIQUE constraint here. Free its Firebase account and answer
      // 409 -- anything else is a real error for the error middleware.
      await firebaseDeleteUser(idToken);
      if (String((err as Error)?.message).includes('UNIQUE')) {
        res.status(409).json({ error: 'That username or email is already taken.' });
        return;
      }
      throw err;
    }

    // Teachers play through the map exactly like students do, so every new account
    // (either role) starts with level 1 unlocked.
    db.prepare(
      `INSERT INTO user_level_progress (user_id, map_level_id, status)
       SELECT ?, id, 'available' FROM map_levels WHERE level_number = 1`
    ).run(userId);

    async function rollback() {
      db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
      await firebaseDeleteUser(idToken);
    }

    let idDocumentPath: string | null = null;
    if (role === 'teacher' && idDocument) {
      if (!supabaseAdmin) {
        await rollback();
        res.status(500).json({ error: "We couldn't upload your ID. Please try again." });
        return;
      }
      const ext = ID_DOCUMENT_MIME_TO_EXT[idDocument.mimetype];
      idDocumentPath = `teacher-ids/${userId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(ID_DOCUMENT_BUCKET)
        .upload(idDocumentPath, idDocument.buffer, { contentType: idDocument.mimetype });
      if (uploadError) {
        await rollback();
        console.error('Supabase ID upload failed:', uploadError.message);
        res.status(500).json({ error: "We couldn't upload your ID. Please try again." });
        return;
      }
    }

    // A typed 6-digit code when Resend + the Firebase service account are set up, otherwise the
    // verification link (see lib/mailer.ts).
    const method: 'otp' | 'link' = (await otpDeliveryAvailable()) ? 'otp' : 'link';
    let sendResult: SendResult;
    if (method === 'otp') {
      const otp = createOtp(userId);
      sendResult = otp.ok ? await sendOtpEmail(email, otp.code, lang ?? 'ar') : { ok: false, error: `OTP_${otp.reason}` };
    } else {
      sendResult = await sendVerificationEmail({ email, idToken, lang: lang ?? 'ar' });
    }
    if (!sendResult.ok) {
      // Roll back so the username/email is free to retry with instead of being stuck
      // on an account that never got its verification email (and never leave an
      // orphaned ID photo sitting in storage either).
      if (idDocumentPath) await supabaseAdmin!.storage.from(ID_DOCUMENT_BUCKET).remove([idDocumentPath]);
      await rollback();
      console.error('Sending the verification email failed:', sendResult.error);
      recordIssue('verification-email', sendResult.error);
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }

    if (idDocumentPath) {
      db.prepare(`UPDATE users SET id_document_path = ? WHERE id = ?`).run(idDocumentPath, userId);
    }

    res.status(201).json({ pendingVerification: true, email, idToken, method });
  }
);

authRouter.post('/login', authLimiter, requireCsrfHeader, validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(username) as any;

  if (!user || user.is_seed) {
    // Same generic message as a real wrong-password rejection below, and -- unlike a plain
    // early return -- the same rough response time: skipping bcrypt entirely for a
    // nonexistent username would let an attacker distinguish "no such account" from "wrong
    // password" purely by how fast the response came back, quietly reintroducing username
    // enumeration despite the identical error text. DUMMY_PASSWORD_HASH is precomputed once
    // at module load (bcrypt.compare itself does the expensive part) purely to burn
    // roughly the same time as the real compare on the path below.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    res.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'This account has been deactivated. Contact an administrator.' });
    return;
  }

  if (isCurrentlyBanned(user.banned_until)) {
    res.status(403).json({ error: 'This account is temporarily suspended.', bannedUntil: user.banned_until });
    return;
  }

  if (!user.firebase_uid) {
    // Seed/legacy account — untouched bcrypt check, keeps the zero-config demo working.
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Incorrect username or password.' });
      return;
    }
    if (!user.email_verified) {
      res.status(403).json({ error: 'Please verify your email before logging in.' });
      return;
    }
    const { token } = createSession(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    res.json({ user: publicUser(user) });
    return;
  }

  const signInResult = await firebaseSignIn(decrypt(user.email), password);
  if (!signInResult.ok) {
    if (!WRONG_CREDENTIALS_ERRORS.has(signInResult.error)) console.error('Firebase signIn failed:', signInResult.error);
    res.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }
  const { idToken } = signInResult.data;

  const lookupResult = await firebaseLookup(idToken);
  const emailVerified = lookupResult.ok && lookupResult.data.users[0]?.emailVerified;
  if (!emailVerified) {
    res.status(403).json({
      error: 'Please verify your email before logging in.',
      idToken,
      method: (await otpDeliveryAvailable()) ? 'otp' : 'link',
    });
    return;
  }

  if (!user.email_verified) {
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);
  }

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  res.json({ user: publicUser(updated) });
});

authRouter.post(
  '/verify-email',
  authLimiter,
  requireCsrfHeader,
  validateBody(verifyEmailSchema),
  async (req, res) => {
    const { oobCode } = req.body;

    const confirmResult = await firebaseConfirmVerification(oobCode);
    if (!confirmResult.ok) {
      res.status(401).json({ error: 'Invalid or expired verification link.' });
      return;
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE email_hash = ?`)
      .get(hashForLookup(confirmResult.data.email)) as any;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);

    const { token } = createSession(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
    res.json({ user: publicUser(updated) });
  }
);

authRouter.post(
  '/resend-verification',
  authLimiter,
  requireCsrfHeader,
  validateBody(resendVerificationSchema),
  async (req, res) => {
    const { idToken, lang } = req.body;

    const lookupResult = await firebaseLookup(idToken);
    if (!lookupResult.ok || !lookupResult.data.users[0]) {
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }
    if (lookupResult.data.users[0].emailVerified) {
      res.status(400).json({ error: 'This account is already verified.' });
      return;
    }

    const accountEmail = lookupResult.data.users[0].email;
    if (await otpDeliveryAvailable()) {
      const row = db.prepare(`SELECT id FROM users WHERE email_hash = ?`).get(hashForLookup(accountEmail)) as { id: number } | undefined;
      if (!row) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }
      const otp = createOtp(row.id);
      if (!otp.ok) {
        res.status(429).json({
          error: otp.reason === 'cooldown' ? 'Please wait a minute before requesting another code.' : 'Too many codes requested. Please try again later.',
        });
        return;
      }
      const sent = await sendOtpEmail(accountEmail, otp.code, lang ?? 'ar');
      if (!sent.ok) {
        console.error('Sending the verification code failed:', sent.error);
        recordIssue('verification-code-resend', sent.error);
        res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
        return;
      }
      res.json({ ok: true, method: 'otp' });
      return;
    }

    const sendResult = await sendVerificationEmail({ email: accountEmail, idToken, lang: lang ?? 'ar' });
    if (!sendResult.ok) {
      console.error('Resending the verification email failed:', sendResult.error);
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }

    res.json({ ok: true, method: 'link' });
  }
);

// Confirms the 6-digit code from the email. The Firebase idToken (from signup, or from the
// "please verify" login response) proves the caller knows the account's password, so codes
// can't be guessed for someone else's email -- and each code allows only a few wrong tries.
authRouter.post('/verify-otp', authLimiter, requireCsrfHeader, validateBody(verifyOtpSchema), async (req, res) => {
  const { idToken, code } = req.body;

  const lookup = await firebaseLookup(idToken);
  const fbUser = lookup.ok ? lookup.data.users[0] : undefined;
  if (!fbUser) {
    res.status(401).json({ error: 'Your verification session expired. Please log in again.' });
    return;
  }
  const user = db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(fbUser.email)) as any;
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  if (fbUser.emailVerified && user.email_verified) {
    res.status(400).json({ error: 'This account is already verified.' });
    return;
  }

  const result = verifyOtp(user.id, code);
  if (result === 'invalid') {
    res.status(400).json({ error: 'That code is incorrect. Please try again.' });
    return;
  }
  if (result === 'expired') {
    res.status(400).json({ error: 'That code has expired. Request a new one.' });
    return;
  }
  if (result === 'locked') {
    res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    return;
  }

  const adminAuth = await getFirebaseAdminAuth();
  if (!adminAuth) {
    res.status(500).json({ error: "We couldn't verify your account. Please try again shortly." });
    return;
  }
  try {
    await adminAuth.updateUser(fbUser.localId, { emailVerified: true });
  } catch (err) {
    console.error('Marking the Firebase user verified failed:', err);
    res.status(500).json({ error: "We couldn't verify your account. Please try again shortly." });
    return;
  }
  db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);
  clearOtp(user.id);

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  res.json({ user: publicUser(updated) });
});

// "Forgot password", step 1: email a 6-digit code. Always answers the same ({ ok: true }) whether or
// not the email belongs to an account, so it can't be used to find out who is registered. Only
// Firebase accounts (everyone who signed up) have a real mailbox; local accounts (admin, test
// accounts) use made-up addresses and are never emailed.
authRouter.post('/forgot-password', authLimiter, requireCsrfHeader, validateBody(forgotPasswordSchema), async (req, res) => {
  const { email, lang } = req.body as { email: string; lang?: 'en' | 'ar' };
  const user = db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(email)) as any;
  if (user && user.firebase_uid && user.is_active && (await otpDeliveryAvailable())) {
    const otp = createOtp(user.id, 'reset');
    if (otp.ok) {
      const sent = await sendResetOtpEmail(email, otp.code, lang ?? 'ar');
      if (!sent.ok) {
        console.error('Sending the password-reset code failed:', sent.error);
        recordIssue('password-reset-email', sent.error);
      }
    }
  }
  res.json({ ok: true });
});

// "Forgot password", step 2: check the code, set the new password in Firebase, sign out every device.
authRouter.post('/reset-password', authLimiter, requireCsrfHeader, validateBody(resetPasswordSchema), async (req, res) => {
  const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };
  const user = db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(email)) as any;
  // Unknown email or a local account: same answer as a wrong code, so nothing is revealed.
  if (!user || !user.firebase_uid) {
    res.status(400).json({ error: 'That code is incorrect. Please try again.' });
    return;
  }
  const result = verifyOtp(user.id, code, 'reset');
  if (result === 'invalid') {
    res.status(400).json({ error: 'That code is incorrect. Please try again.' });
    return;
  }
  if (result === 'expired') {
    res.status(400).json({ error: 'That code has expired. Request a new one.' });
    return;
  }
  if (result === 'locked') {
    res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    return;
  }

  const adminAuth = await getFirebaseAdminAuth();
  if (!adminAuth) {
    res.status(500).json({ error: "We couldn't change your password. Please try again shortly." });
    return;
  }
  try {
    await adminAuth.updateUser(user.firebase_uid, { password: newPassword });
  } catch (err) {
    console.error('Resetting the Firebase password failed:', err);
    recordIssue('password-reset', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "We couldn't change your password. Please try again shortly." });
    return;
  }
  clearOtp(user.id, 'reset');
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  res.json({ ok: true });
});

// Change your own password. Accounts that sign in through Firebase (everyone who signed up) have it
// changed there; local accounts (admin, test accounts) in our own bcrypt column. The current password
// is always required, and every other session is signed out afterwards.
authRouter.post('/change-password', authLimiter, requireCsrfHeader, requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!) as any;
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'Choose a different password from your current one.' });
    return;
  }
  if (user.role === 'admin' && newPassword.length < 12) {
    res.status(400).json({ error: 'Admin passwords need at least 12 characters.' });
    return;
  }

  if (user.firebase_uid) {
    const signIn = await firebaseSignIn(decrypt(user.email), currentPassword);
    if (!signIn.ok) {
      res.status(401).json({ error: 'Your current password is incorrect.' });
      return;
    }
    const updated = await firebaseUpdatePassword(signIn.data.idToken, newPassword);
    if (!updated.ok) {
      console.error('Firebase password update failed:', updated.error);
      recordIssue('change-password', updated.error);
      res.status(500).json({ error: "We couldn't change your password. Please try again shortly." });
      return;
    }
  } else {
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      res.status(401).json({ error: 'Your current password is incorrect.' });
      return;
    }
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(await bcrypt.hash(newPassword, BCRYPT_COST), user.id);
  }

  // Sign every other device out, keep this one logged in with a fresh session.
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ ok: true });
});

authRouter.post('/logout', requireCsrfHeader, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: publicUser(user) });
});

// The account owner clears their own warning once they've seen it (e.g. dismissing the
// in-app banner) -- an admin can also clear it directly from the admin panel.
authRouter.post('/dismiss-warning', requireAuth, requireCsrfHeader, (req, res) => {
  db.prepare(`UPDATE users SET warning_message = NULL, warning_issued_at = NULL WHERE id = ?`).run(req.userId!);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ user: publicUser(user) });
});
