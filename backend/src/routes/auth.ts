import { asyncRouter } from '../lib/asyncRouter.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import multer from 'multer';
import { db } from '../db/db.js';
import { createSession, destroySession, SESSION_COOKIE } from '../lib/session.js';
import { moderateText } from '../lib/moderation.js';
import { validateBody, requireCsrfHeader, handleUpload } from '../middleware/validate.js';
import { authLimiter, loginAccountLimiter, loginIpLimiter } from '../middleware/rateLimit.js';
import { comparePassword, hashPassword, PasswordBusyError } from '../lib/passwordQueue.js';
import { requireAuth } from '../middleware/auth.js';
import { googleAuthSchema, completeStudentProfileSchema, completeTeacherProfileSchema, signupSchema, loginSchema, verifyEmailSchema, resendVerificationSchema, verifyOtpSchema, changePasswordSchema, changePasswordCodeSchema, forgotPasswordSchema, resetPasswordSchema } from '../lib/schemas.js';
import { getPlayerLevel } from '../lib/xp.js';
import { earnedAuraRank, getRankTier, getTeacherRankTier, rankDropOf } from '../lib/ranks.js';
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
import { createGoogleUser, findGoogleUser, verifyGoogleToken } from '../lib/googleAuth.js';

export const authRouter = asyncRouter();

const ID_DOCUMENT_BUCKET = 'teacher-id-documents';
// JPEG/PNG only -- the automated ID check below runs OCR on the raw photo, which needs
// a rasterized image (no PDF-to-image step) and reliable decode support (no WebP).
const ID_DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const ID_VERIFICATION_MESSAGES: Record<IdVerificationFailureReason, string> = {
  NOT_QATAR_ID: "We couldn't see a Qatar ID in this photo. Upload a clear, straight photo of the whole ID.",
  UNDERAGE: 'Teacher accounts are for people aged 23 or older.',
  UNREADABLE: "We couldn't read the date of birth on the ID. Upload a clearer photo without glare.",
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

const handleIdDocumentUpload = handleUpload(idDocumentUpload, 'The ID photo must be a JPG or PNG file smaller than 5MB. Choose another photo.');

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
// when too many people are logging in at the same moment (lib/passwordQueue.ts)
const BUSY = { ok: false as const, status: 503, body: { error: 'The site is busy right now. Wait one minute and try again.' } };
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
    // The rank colour a student picked for their pages (a rank they have reached), or null to follow their current rank.
    auraRank: user.role === 'student' ? earnedAuraRank(user.aura_rank, user.total_xp) : null,
    // Set while a student has a "your rank dropped" pop-up to see (the division they fell from, and the page colour they had there).
    rankDrop: user.role === 'student' ? rankDropOf(user) : null,
    role: user.role,
    grade: user.grade,
    schoolName: user.school_name ?? null,
    teacherSubject: user.teacher_subject ?? null,
    createdAt: user.created_at,
    warningMessage: user.warning_message ?? null,
    warningNumber: user.warning_number ?? null,
    // false for a Google sign-up that has not given its name / school / grade (or ID) yet: the app shows the profile step until then
    profileComplete: user.profile_complete !== 0,
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
      res.status(400).json({ error: 'This username is not allowed. Choose a different one.' });
      return;
    }
    const nameCheck = moderateText(displayName);
    if (!nameCheck.allowed) {
      res.status(400).json({ error: 'This display name is not allowed. Choose a different one.' });
      return;
    }
    if (!moderateText(schoolName).allowed) {
      res.status(400).json({ error: 'This school name is not allowed. Write the real name of your school.' });
      return;
    }
    if (role === 'teacher' && !idDocument) {
      res.status(400).json({ error: 'Upload a photo of your ID to confirm your account.' });
      return;
    }
    if (role === 'teacher' && idDocument) {
      if (idChecksRunning >= MAX_CONCURRENT_ID_CHECKS) {
        res.status(503).json({ error: 'The site is busy right now. Wait one minute and try again.' });
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
      res.status(409).json({ error: 'This username or email is already used. Choose another one, or log in if it is yours.' });
      return;
    }

    const signUpResult = await firebaseSignUp(email, password);
    if (!signUpResult.ok) {
      if (signUpResult.error === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'This username or email is already used. Choose another one, or log in if it is yours.' });
      } else {
        console.error('Firebase signUp failed:', signUpResult.error);
        recordIssue('firebase-signup', signUpResult.error);
        res.status(500).json({ error: "We couldn't send the confirmation email. Wait a little and try again." });
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
        res.status(409).json({ error: 'This username or email is already used. Choose another one, or log in if it is yours.' });
        return;
      }
      throw err;
    }

    // A new student starts with map level 1 unlocked. The map is for students only: teachers make the lessons instead (index.ts).
    if (role === 'student') {
      db.prepare(
        `INSERT INTO user_level_progress (user_id, map_level_id, status)
         SELECT ?, id, 'available' FROM map_levels WHERE level_number = 1`
      ).run(userId);
    }

    async function rollback() {
      db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
      await firebaseDeleteUser(idToken);
    }

    let idDocumentPath: string | null = null;
    if (role === 'teacher' && idDocument) {
      if (!supabaseAdmin) {
        await rollback();
        res.status(500).json({ error: "We couldn't upload your ID photo. Please try again." });
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
        res.status(500).json({ error: "We couldn't upload your ID photo. Please try again." });
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
      res.status(500).json({ error: "We couldn't send the confirmation email. Wait a little and try again." });
      return;
    }

    if (idDocumentPath) {
      db.prepare(`UPDATE users SET id_document_path = ? WHERE id = ?`).run(idDocumentPath, userId);
    }

    res.status(201).json({ pendingVerification: true, email, idToken, method });
  }
);

type AuthFailure = { ok: false; status: number; body: Record<string, unknown> };

/**
 * Checks a username and password the way sign-in does, and returns the account when they are right and the account may be used (not deactivated,
 * not suspended, email verified) -- or the answer to send back instead. Shared by /login and by linking another account (below), so both ask for
 * exactly the same proof.
 */
async function authenticate(username: string, password: string): Promise<{ ok: true; user: any } | AuthFailure> {
  const wrong: AuthFailure = { ok: false, status: 401, body: { error: 'The username or password is wrong. Check them and try again.' } };
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(username) as any;

  if (!user || user.is_seed) {
    // Same generic message as a real wrong-password rejection below, and -- unlike a plain
    // early return -- the same rough response time: skipping bcrypt entirely for a
    // nonexistent username would let an attacker distinguish "no such account" from "wrong
    // password" purely by how fast the response came back, quietly reintroducing username
    // enumeration despite the identical error text. DUMMY_PASSWORD_HASH is precomputed once
    // at module load (bcrypt.compare itself does the expensive part) purely to burn
    // roughly the same time as the real compare on the path below.
    try {
      await comparePassword(password, DUMMY_PASSWORD_HASH);
    } catch (e) {
      if (e instanceof PasswordBusyError) return BUSY;
      throw e;
    }
    return wrong;
  }

  if (!user.is_active) {
    return { ok: false, status: 403, body: { error: 'This account is stopped. Contact the Anees team.' } };
  }

  if (isCurrentlyBanned(user.banned_until)) {
    return { ok: false, status: 403, body: { error: 'This account is suspended for now. Try again when the suspension ends.', bannedUntil: user.banned_until } };
  }

  if (!user.firebase_uid) {
    // Seed/legacy account — untouched bcrypt check, keeps the zero-config demo working.
    let ok = false;
    try {
      ok = await comparePassword(password, user.password_hash);
    } catch (e) {
      if (e instanceof PasswordBusyError) return BUSY;
      throw e;
    }
    if (!ok) return wrong;
    if (!user.email_verified) {
      return { ok: false, status: 403, body: { error: 'Confirm your email first. We sent you a message with the steps.' } };
    }
    return { ok: true, user };
  }

  const signInResult = await firebaseSignIn(decrypt(user.email), password);
  if (!signInResult.ok) {
    if (!WRONG_CREDENTIALS_ERRORS.has(signInResult.error)) console.error('Firebase signIn failed:', signInResult.error);
    return wrong;
  }
  const { idToken } = signInResult.data;

  const lookupResult = await firebaseLookup(idToken);
  const emailVerified = lookupResult.ok && lookupResult.data.users[0]?.emailVerified;
  if (!emailVerified) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'Confirm your email first. We sent you a message with the steps.',
        idToken,
        method: (await otpDeliveryAvailable()) ? 'otp' : 'link',
      },
    };
  }

  if (!user.email_verified) {
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);
  }
  return { ok: true, user: db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) };
}

authRouter.post('/login', loginIpLimiter, loginAccountLimiter, requireCsrfHeader, validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const result = await authenticate(username, password);
  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }
  const { token } = createSession(result.user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ user: publicUser(result.user) });
});

// ---------------------------------------------------------------------------------------
// Switching between a person's own accounts (a student and a teacher account, say). An account is LINKED once, by signing in to it with its
// password while already signed in to another. Linked accounts form one GROUP: every account in it sees all the others (link the student and the
// teacher to the admin, and the student sees the teacher too). After that the person switches with one tap -- no password -- until they remove an
// account from the group, or its password changes (its links are dropped then, since the proof they were made with is gone).
// ---------------------------------------------------------------------------------------

const linkAccountSchema = z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) });
const switchAccountSchema = z.object({ userId: z.number().int().positive() });

function linkedAccountsOf(userId: number) {
  const rows = db
    .prepare(
      `SELECT u.* FROM linked_accounts l JOIN users u ON u.id = l.linked_user_id
       WHERE l.user_id = ? AND u.is_active = 1 ORDER BY l.created_at, u.id`
    )
    .all(userId) as any[];
  return rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatarKey: u.avatar_key, role: u.role }));
}

/** Makes every group complete: whoever is linked to someone is linked to everyone that person is linked to. Repeats until nothing is added. */
function closeLinkedGroups() {
  const add = db.prepare(
    `INSERT OR IGNORE INTO linked_accounts (user_id, linked_user_id)
     SELECT a.user_id, b.linked_user_id FROM linked_accounts a JOIN linked_accounts b ON a.linked_user_id = b.user_id WHERE a.user_id <> b.linked_user_id`
  );
  while (add.run().changes > 0) {
    /* one more step of the chain */
  }
}
closeLinkedGroups(); // links made before groups existed (each new account linked only to the first one) are completed at start-up

const isLinked = (a: number, b: number) => !!db.prepare(`SELECT 1 FROM linked_accounts WHERE user_id = ? AND linked_user_id = ?`).get(a, b);

authRouter.get('/linked-accounts', requireAuth, (req, res) => {
  res.json({ accounts: linkedAccountsOf(req.userId!) });
});

authRouter.post('/linked-accounts', authLimiter, requireCsrfHeader, requireAuth, validateBody(linkAccountSchema), async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authenticate(username, password);
  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }
  if (result.user.id === req.userId) {
    res.status(400).json({ error: 'You are already using this account.' });
    return;
  }
  const link = db.prepare(`INSERT OR IGNORE INTO linked_accounts (user_id, linked_user_id) VALUES (?, ?)`);
  link.run(req.userId!, result.user.id);
  link.run(result.user.id, req.userId!);
  closeLinkedGroups();
  res.status(201).json({ accounts: linkedAccountsOf(req.userId!) });
});

authRouter.delete('/linked-accounts/:id', requireCsrfHeader, requireAuth, (req, res) => {
  const other = Number(req.params.id);
  if (!Number.isInteger(other)) {
    res.status(400).json({ error: 'This account cannot be used here.' });
    return;
  }
  // Only a member of the group can take an account out of it, and it leaves the whole group (its links to every account go), so the list is the
  // same from every account in it.
  if (isLinked(req.userId!, other)) db.prepare(`DELETE FROM linked_accounts WHERE user_id = ? OR linked_user_id = ?`).run(other, other);
  res.json({ accounts: linkedAccountsOf(req.userId!) });
});

authRouter.post('/switch-account', authLimiter, requireCsrfHeader, requireAuth, validateBody(switchAccountSchema), (req, res) => {
  const { userId } = req.body as { userId: number };
  if (userId === req.userId || !isLinked(req.userId!, userId)) {
    res.status(403).json({ error: 'This account is not linked to yours. Add it first.' });
    return;
  }
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!target || !target.is_active) {
    res.status(403).json({ error: 'This account is stopped. Contact the Anees team.' });
    return;
  }
  if (isCurrentlyBanned(target.banned_until)) {
    res.status(403).json({ error: 'This account is suspended for now. Try again when the suspension ends.', bannedUntil: target.banned_until });
    return;
  }
  // the account being left is signed out on this device, the other one signed in
  destroySession(req.cookies?.[SESSION_COOKIE]);
  const { token } = createSession(target.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ user: publicUser(target) });
});

// Sign up or sign in with Google. A person who already has an account is signed in; a new one needs `role` (student / teacher) -- without it we answer
// needsRole so the page can ask -- and gets an account that is held on the profile step (see lib/googleAuth.ts).
authRouter.post('/google', authLimiter, requireCsrfHeader, validateBody(googleAuthSchema), async (req, res) => {
  const { idToken, role } = req.body as { idToken: string; role?: 'student' | 'teacher' };
  const verified = await verifyGoogleToken(idToken);
  if (!verified.ok) {
    if (verified.error !== 'NOT_GOOGLE' && verified.error !== 'EMAIL_NOT_VERIFIED') console.error('Google sign-in could not be verified:', verified.error);
    if (verified.error === 'NOT_CONFIGURED') {
      res.status(503).json({ error: 'Google sign-in is not working right now. Please use your username and password.' });
      return;
    }
    res.status(401).json({ error: "We couldn't check your Google account. Please try again." });
    return;
  }

  let user = findGoogleUser(verified.identity);
  let created = false;
  if (!user) {
    if (!role) {
      res.json({ needsRole: true });
      return;
    }
    const id = createGoogleUser(verified.identity, role);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    created = true;
  } else if (!user.firebase_uid) {
    // someone who signed up with this email and a password before: from now on Google works for them too
    db.prepare(`UPDATE users SET firebase_uid = ?, email_verified = 1 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE firebase_uid = ?)`).run(
      verified.identity.uid, user.id, verified.identity.uid
    );
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'This account is stopped. Contact the Anees team.' });
    return;
  }
  if (isCurrentlyBanned(user.banned_until)) {
    res.status(403).json({ error: 'This account is suspended for now. Try again when the suspension ends.', bannedUntil: user.banned_until });
    return;
  }

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.status(created ? 201 : 200).json({ user: publicUser(user), created });
});

// The step after a Google sign-up: a student gives name, school and grade; a teacher name, school, subject and a Qatar ID photo (checked and stored
// exactly as at an ordinary teacher signup). Until it is done every other call is refused (middleware/auth.ts).
authRouter.post('/complete-profile', authLimiter, requireCsrfHeader, requireAuth, handleIdDocumentUpload, async (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!) as any;
  if (!user || user.profile_complete !== 0) {
    res.status(409).json({ error: 'Your profile is already complete. No more steps are needed.' });
    return;
  }
  const parsed = (user.role === 'teacher' ? completeTeacherProfileSchema : completeStudentProfileSchema).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Something in the form is not right. Check it and try again.', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data as { displayName: string; schoolName: string; grade?: number; teacherSubject?: string };
  if (!moderateText(data.displayName).allowed) {
    res.status(400).json({ error: 'This display name is not allowed. Choose a different one.' });
    return;
  }
  if (!moderateText(data.schoolName).allowed) {
    res.status(400).json({ error: 'This school name is not allowed. Write the real name of your school.' });
    return;
  }

  let idDocumentPath: string | null = null;
  if (user.role === 'teacher') {
    const idDocument = req.file;
    if (!idDocument) {
      res.status(400).json({ error: 'Upload a photo of your ID to confirm your account.' });
      return;
    }
    if (idChecksRunning >= MAX_CONCURRENT_ID_CHECKS) {
      res.status(503).json({ error: 'The site is busy right now. Wait one minute and try again.' });
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
    if (!supabaseAdmin) {
      res.status(500).json({ error: "We couldn't upload your ID photo. Please try again." });
      return;
    }
    idDocumentPath = `teacher-ids/${user.id}-${Date.now()}.${ID_DOCUMENT_MIME_TO_EXT[idDocument.mimetype]}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(ID_DOCUMENT_BUCKET).upload(idDocumentPath, idDocument.buffer, { contentType: idDocument.mimetype });
    if (uploadError) {
      console.error('Supabase ID upload failed:', uploadError.message);
      res.status(500).json({ error: "We couldn't upload your ID photo. Please try again." });
      return;
    }
  }

  db.prepare(
    `UPDATE users SET display_name = ?, school_name = ?, grade = ?, teacher_subject = ?, id_document_path = COALESCE(?, id_document_path), profile_complete = 1 WHERE id = ?`
  ).run(
    data.displayName,
    data.schoolName,
    user.role === 'student' ? data.grade ?? null : null,
    user.role === 'teacher' ? data.teacherSubject ?? null : null,
    idDocumentPath,
    user.id
  );
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id)) });
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
      res.status(401).json({ error: 'This link is not working. It may be old or already used. Ask for a new one.' });
      return;
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE email_hash = ?`)
      .get(hashForLookup(confirmResult.data.email)) as any;
    if (!user) {
      res.status(404).json({ error: 'We couldn\'t find this account.' });
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
      res.status(500).json({ error: "We couldn't send the confirmation email. Wait a little and try again." });
      return;
    }
    if (lookupResult.data.users[0].emailVerified) {
      res.status(400).json({ error: 'This account is already confirmed. You can log in.' });
      return;
    }

    const accountEmail = lookupResult.data.users[0].email;
    if (await otpDeliveryAvailable()) {
      const row = db.prepare(`SELECT id FROM users WHERE email_hash = ?`).get(hashForLookup(accountEmail)) as { id: number } | undefined;
      if (!row) {
        res.status(404).json({ error: 'We couldn\'t find this account.' });
        return;
      }
      const otp = createOtp(row.id);
      if (!otp.ok) {
        res.status(429).json({
          error: otp.reason === 'cooldown' ? 'Wait one minute before asking for another code.' : 'You asked for too many codes. Try again later.',
        });
        return;
      }
      const sent = await sendOtpEmail(accountEmail, otp.code, lang ?? 'ar');
      if (!sent.ok) {
        console.error('Sending the verification code failed:', sent.error);
        recordIssue('verification-code-resend', sent.error);
        res.status(500).json({ error: "We couldn't send the confirmation email. Wait a little and try again." });
        return;
      }
      res.json({ ok: true, method: 'otp' });
      return;
    }

    const sendResult = await sendVerificationEmail({ email: accountEmail, idToken, lang: lang ?? 'ar' });
    if (!sendResult.ok) {
      console.error('Resending the verification email failed:', sendResult.error);
      res.status(500).json({ error: "We couldn't send the confirmation email. Wait a little and try again." });
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
    res.status(401).json({ error: 'Your confirmation time ended. Log in again to continue.' });
    return;
  }
  const user = db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(fbUser.email)) as any;
  if (!user) {
    res.status(404).json({ error: 'We couldn\'t find this account.' });
    return;
  }
  if (fbUser.emailVerified && user.email_verified) {
    res.status(400).json({ error: 'This account is already confirmed. You can log in.' });
    return;
  }

  const result = verifyOtp(user.id, code);
  if (result === 'invalid') {
    res.status(400).json({ error: 'The code is wrong. Check it and try again.' });
    return;
  }
  if (result === 'expired') {
    res.status(400).json({ error: 'This code has expired. Ask for a new code.' });
    return;
  }
  if (result === 'locked') {
    res.status(429).json({ error: 'Too many wrong codes. Ask for a new code.' });
    return;
  }

  const adminAuth = await getFirebaseAdminAuth();
  if (!adminAuth) {
    res.status(500).json({ error: "We couldn't confirm your account. Wait a little and try again." });
    return;
  }
  try {
    await adminAuth.updateUser(fbUser.localId, { emailVerified: true });
  } catch (err) {
    console.error('Marking the Firebase user verified failed:', err);
    res.status(500).json({ error: "We couldn't confirm your account. Wait a little and try again." });
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
    res.status(400).json({ error: 'The code is wrong. Check it and try again.' });
    return;
  }
  const result = verifyOtp(user.id, code, 'reset');
  if (result === 'invalid') {
    res.status(400).json({ error: 'The code is wrong. Check it and try again.' });
    return;
  }
  if (result === 'expired') {
    res.status(400).json({ error: 'This code has expired. Ask for a new code.' });
    return;
  }
  if (result === 'locked') {
    res.status(429).json({ error: 'Too many wrong codes. Ask for a new code.' });
    return;
  }

  const adminAuth = await getFirebaseAdminAuth();
  if (!adminAuth) {
    res.status(500).json({ error: "We couldn't change your password. Wait a little and try again." });
    return;
  }
  try {
    await adminAuth.updateUser(user.firebase_uid, { password: newPassword });
  } catch (err) {
    console.error('Resetting the Firebase password failed:', err);
    recordIssue('password-reset', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "We couldn't change your password. Wait a little and try again." });
    return;
  }
  clearOtp(user.id, 'reset');
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  db.prepare(`DELETE FROM linked_accounts WHERE user_id = ? OR linked_user_id = ?`).run(user.id, user.id); // the proof the links were made with is gone
  res.json({ ok: true });
});

// Change password, step 1: check the current password, then email a 6-digit code to the account's address
// (the same code kind as "forgot password"). Local accounts (admin, test accounts) have made-up addresses
// and no mailbox: they answer { method: 'none' } and change with the current password alone.
authRouter.post('/change-password/code', authLimiter, requireCsrfHeader, requireAuth, validateBody(changePasswordCodeSchema), async (req, res) => {
  const { currentPassword, lang } = req.body as { currentPassword: string; lang?: 'en' | 'ar' };
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!) as any;
  if (!user) {
    res.status(404).json({ error: 'We couldn\'t find this account.' });
    return;
  }
  const ok = user.firebase_uid ? (await firebaseSignIn(decrypt(user.email), currentPassword)).ok : await comparePassword(currentPassword, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Your current password is wrong. Check it and try again.' });
    return;
  }
  if (!user.firebase_uid) {
    res.json({ ok: true, method: 'none' });
    return;
  }
  if (!(await otpDeliveryAvailable())) {
    res.status(503).json({ error: "We couldn't send the code. Wait a little and try again." });
    return;
  }
  const otp = createOtp(user.id, 'reset');
  if (!otp.ok) {
    res.status(429).json({ error: otp.reason === 'cooldown' ? 'Wait one minute before asking for another code.' : 'You asked for too many codes. Try again later.' });
    return;
  }
  const sent = await sendResetOtpEmail(decrypt(user.email), otp.code, lang ?? 'ar');
  if (!sent.ok) {
    console.error('Sending the password-change code failed:', sent.error);
    recordIssue('change-password-email', sent.error);
    res.status(503).json({ error: "We couldn't send the code. Wait a little and try again." });
    return;
  }
  res.json({ ok: true, method: 'otp' });
});

// Change password, step 2. Accounts that sign in through Firebase (everyone who signed up) need the emailed
// code and have the password changed there; local accounts (admin, test accounts) in our own bcrypt column.
// The current password is always required, and every other session is signed out afterwards.
authRouter.post('/change-password', authLimiter, requireCsrfHeader, requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword, code } = req.body as { currentPassword: string; newPassword: string; code?: string };
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!) as any;
  if (!user) {
    res.status(404).json({ error: 'We couldn\'t find this account.' });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'The new password must be different from your current one.' });
    return;
  }
  if (user.role === 'admin' && newPassword.length < 12) {
    res.status(400).json({ error: 'An admin password needs at least 12 characters.' });
    return;
  }

  if (user.firebase_uid) {
    if (!code) {
      res.status(400).json({ error: 'Write the 6-digit code we sent you.' });
      return;
    }
    const check = verifyOtp(user.id, code, 'reset');
    if (check !== 'ok') {
      res.status(check === 'locked' ? 429 : 400).json({
        error: check === 'invalid' ? 'The code is wrong. Check it and try again.' : check === 'expired' ? 'This code has expired. Ask for a new code.' : 'Too many wrong codes. Ask for a new code.',
      });
      return;
    }
    const signIn = await firebaseSignIn(decrypt(user.email), currentPassword);
    if (!signIn.ok) {
      res.status(401).json({ error: 'Your current password is wrong. Check it and try again.' });
      return;
    }
    const updated = await firebaseUpdatePassword(signIn.data.idToken, newPassword);
    if (!updated.ok) {
      console.error('Firebase password update failed:', updated.error);
      recordIssue('change-password', updated.error);
      res.status(500).json({ error: "We couldn't change your password. Wait a little and try again." });
      return;
    }
    clearOtp(user.id, 'reset');
  } else {
    if (!(await comparePassword(currentPassword, user.password_hash))) {
      res.status(401).json({ error: 'Your current password is wrong. Check it and try again.' });
      return;
    }
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(await hashPassword(newPassword, BCRYPT_COST), user.id);
  }

  // Sign every other device out, keep this one logged in with a fresh session.
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  db.prepare(`DELETE FROM linked_accounts WHERE user_id = ? OR linked_user_id = ?`).run(user.id, user.id); // the proof the links were made with is gone
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
    res.status(404).json({ error: 'We couldn\'t find this user.' });
    return;
  }
  res.json({ user: publicUser(user) });
});

// The account owner clears their own warning once they've seen it (e.g. dismissing the
// in-app banner) -- an admin can also clear it directly from the admin panel.
// The student has seen the "your rank dropped" pop-up (frontend RankDemotionPopup).
authRouter.post('/dismiss-rank-drop', requireAuth, requireCsrfHeader, (req, res) => {
  db.prepare(`UPDATE users SET rank_drop_from = NULL WHERE id = ?`).run(req.userId!);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ user: publicUser(user) });
});

authRouter.post('/dismiss-warning', requireAuth, requireCsrfHeader, (req, res) => {
  db.prepare(`UPDATE users SET warning_message = NULL, warning_issued_at = NULL, warning_number = NULL WHERE id = ?`).run(req.userId!);
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ user: publicUser(user) });
});
