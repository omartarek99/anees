import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db } from '../db/db.js';
import { createSession, destroySession, SESSION_COOKIE } from '../lib/session.js';
import { moderateText } from '../lib/moderation.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { signupSchema, loginSchema, verifyEmailSchema, resendVerificationSchema } from '../lib/schemas.js';
import { getPlayerLevel } from '../lib/xp.js';
import { getRankTier } from '../lib/ranks.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  firebaseSignUp,
  firebaseSignIn,
  firebaseLookup,
  firebaseSendVerificationEmail,
  firebaseConfirmVerification,
  firebaseDeleteUser,
} from '../lib/firebase.js';
import { verifyQatarIdPhoto, type IdVerificationFailureReason } from '../lib/idVerification.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';
import { FRONTEND_ORIGIN } from '../lib/config.js';

export const authRouter = Router();

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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in ID_DOCUMENT_MIME_TO_EXT) cb(null, true);
    else cb(new Error('INVALID_ID_DOCUMENT_TYPE'));
  },
}).single('idDocument');

function handleIdDocumentUpload(req: Request, res: Response, next: NextFunction) {
  idDocumentUpload(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Please upload a valid ID (JPG or PNG, under 5MB).' });
      return;
    }
    next();
  });
}

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const verifyEmailContinueUrl = `${FRONTEND_ORIGIN}/verify-email`;

// Firebase's "wrong credentials" error varies by API version/config.
const WRONG_CREDENTIALS_ERRORS = new Set(['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS']);

function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    totalXp: user.total_xp,
    playerLevel: getPlayerLevel(user.id),
    rankTier: getRankTier(user.total_xp),
    role: user.role,
    grade: user.grade,
    createdAt: user.created_at,
    warningMessage: user.warning_message ?? null,
  };
}

authRouter.post(
  '/signup',
  authLimiter,
  requireCsrfHeader,
  handleIdDocumentUpload,
  validateBody(signupSchema),
  async (req, res) => {
    const { username, email, password, displayName, avatarKey, role, grade } = req.body;
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
    if (role === 'teacher' && !idDocument) {
      res.status(400).json({ error: 'Please upload your ID to verify your account.' });
      return;
    }
    if (role === 'teacher' && idDocument) {
      const verification = await verifyQatarIdPhoto(idDocument.buffer);
      if (!verification.ok) {
        res.status(400).json({ error: ID_VERIFICATION_MESSAGES[verification.reason] });
        return;
      }
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)`)
      .get(username, email);
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
        res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      }
      return;
    }
    const { idToken, localId } = signUpResult.data;

    const userId = Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash, display_name, avatar_key, total_xp, role, grade, firebase_uid) VALUES (?,?,?,?,?,0,?,?,?)`
        )
        .run(username, email, '', displayName, avatarKey, role, role === 'student' ? grade ?? null : null, localId)
        .lastInsertRowid
    );

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

    const sendResult = await firebaseSendVerificationEmail(idToken, verifyEmailContinueUrl);
    if (!sendResult.ok) {
      // Roll back so the username/email is free to retry with instead of being stuck
      // on an account that never got its verification email (and never leave an
      // orphaned ID photo sitting in storage either).
      if (idDocumentPath) await supabaseAdmin!.storage.from(ID_DOCUMENT_BUCKET).remove([idDocumentPath]);
      await rollback();
      console.error('Firebase sendOobCode failed:', sendResult.error);
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }

    if (idDocumentPath) {
      db.prepare(`UPDATE users SET id_document_path = ? WHERE id = ?`).run(idDocumentPath, userId);
    }

    res.status(201).json({ pendingVerification: true, email, idToken });
  }
);

authRouter.post('/login', authLimiter, requireCsrfHeader, validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(username) as any;

  if (!user || user.is_seed) {
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
    const ok = bcrypt.compareSync(password, user.password_hash);
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

  const signInResult = await firebaseSignIn(user.email, password);
  if (!signInResult.ok) {
    if (WRONG_CREDENTIALS_ERRORS.has(signInResult.error)) {
      res.status(401).json({ error: 'Incorrect username or password.' });
    } else {
      console.error('Firebase signIn failed:', signInResult.error);
      res.status(401).json({ error: 'Incorrect username or password.' });
    }
    return;
  }
  const { idToken } = signInResult.data;

  const lookupResult = await firebaseLookup(idToken);
  const emailVerified = lookupResult.ok && lookupResult.data.users[0]?.emailVerified;
  if (!emailVerified) {
    res.status(403).json({ error: 'Please verify your email before logging in.', idToken });
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
      .prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`)
      .get(confirmResult.data.email) as any;
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
    const { idToken } = req.body;

    const lookupResult = await firebaseLookup(idToken);
    if (!lookupResult.ok || !lookupResult.data.users[0]) {
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }
    if (lookupResult.data.users[0].emailVerified) {
      res.status(400).json({ error: 'This account is already verified.' });
      return;
    }

    const sendResult = await firebaseSendVerificationEmail(idToken, verifyEmailContinueUrl);
    if (!sendResult.ok) {
      console.error('Firebase resend failed:', sendResult.error);
      res.status(500).json({ error: "We couldn't send the verification email. Please try again shortly." });
      return;
    }

    res.json({ ok: true });
  }
);

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
