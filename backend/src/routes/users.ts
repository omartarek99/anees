import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { updateProfileSchema } from '../lib/schemas.js';
import { moderateText } from '../lib/moderation.js';
import { getPlayerLevel } from '../lib/xp.js';
import { getRankTier } from '../lib/ranks.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { AVATAR_PHOTO_BUCKET, AVATAR_PHOTO_PATH_PREFIX, deleteAvatarPhotoIfAny } from '../lib/avatarPhoto.js';

export const usersRouter = Router();

// A teacher's authored reels that have an actual video attached, shown as a portfolio on
// their profile -- visible to any signed-in viewer (student or teacher), not just the
// teacher themselves, matching "students can open a teacher's profile to see their videos".
function teacherVideos(userId: number) {
  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.title_ar, r.video_url, r.grade, s.key as subject_key, s.name as subject_name,
              s.name_ar as subject_name_ar, s.icon as subject_icon
       FROM reels r JOIN subjects s ON r.subject_id = s.id
       WHERE r.author_user_id = ? AND r.video_url IS NOT NULL
       ORDER BY r.id DESC`
    )
    .all(userId) as any[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    titleAr: r.title_ar,
    videoUrl: r.video_url,
    grade: r.grade,
    subject: { key: r.subject_key, name: r.subject_name, nameAr: r.subject_name_ar, icon: r.subject_icon },
  }));
}

function profileSummary(user: any) {
  const playerLevel = getPlayerLevel(user.id);
  const completedLevels = db
    .prepare(`SELECT COUNT(*) as c FROM user_level_progress WHERE user_id = ? AND status = 'completed'`)
    .get(user.id) as { c: number };
  const bossesDefeated = db
    .prepare(
      `SELECT COUNT(*) as c FROM user_level_progress p
       JOIN map_levels m ON p.map_level_id = m.id
       WHERE p.user_id = ? AND p.status = 'completed' AND m.kind = 'boss'`
    )
    .get(user.id) as { c: number };
  const worksheetsCompleted = db
    .prepare(`SELECT COUNT(*) as c FROM worksheet_attempts WHERE user_id = ? AND status = 'submitted'`)
    .get(user.id) as { c: number };

  return {
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    avatarUrl: user.avatar_url ?? null,
    role: user.role,
    bio: user.bio ?? '',
    totalXp: user.total_xp,
    playerLevel,
    rankTier: getRankTier(user.total_xp),
    levelsCompleted: completedLevels.c,
    bossesDefeated: bossesDefeated.c,
    worksheetsCompleted: worksheetsCompleted.c,
    joinedAt: user.created_at,
    videos: user.role === 'teacher' ? teacherVideos(user.id) : undefined,
  };
}

usersRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ profile: profileSummary(user) });
});

usersRouter.patch('/me', requireAuth, requireCsrfHeader, validateBody(updateProfileSchema), (req, res) => {
  const { displayName, avatarKey, bio } = req.body as { displayName?: string; avatarKey?: string; bio?: string };

  if (displayName !== undefined) {
    const check = moderateText(displayName);
    if (!check.allowed) {
      res.status(400).json({ error: 'Please choose an appropriate display name.' });
      return;
    }
    db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(displayName, req.userId!);
  }
  if (avatarKey !== undefined) {
    db.prepare(`UPDATE users SET avatar_key = ? WHERE id = ?`).run(avatarKey, req.userId!);
  }
  if (bio !== undefined) {
    // Empty bio (clearing it) is always fine -- only non-empty text needs moderation.
    if (bio) {
      const check = moderateText(bio);
      if (!check.allowed) {
        res.status(400).json({ error: 'Please keep your bio appropriate and free of contact info.' });
        return;
      }
    }
    db.prepare(`UPDATE users SET bio = ? WHERE id = ?`).run(bio, req.userId!);
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ profile: profileSummary(user) });
});

// JPEG/PNG/WebP only, matching what browsers natively produce from an image picker/camera.
const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in AVATAR_MIME_TO_EXT) cb(null, true);
    else cb(new Error('INVALID_AVATAR_TYPE'));
  },
}).single('photo');

function handleAvatarUpload(req: Request, res: Response, next: NextFunction) {
  avatarUpload(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Please upload a valid photo (JPG, PNG, or WebP, under 5MB).' });
      return;
    }
    next();
  });
}

// multer's fileFilter only trusts the client-declared Content-Type -- this checks the
// actual file signature (same approach as teacherReels.ts's looksLikeVideo) so arbitrary
// content can't be stored in the PUBLIC `videos` bucket disguised as a photo.
function looksLikeImage(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= 8 && PNG_SIG.every((b, i) => buffer[i] === b);
  }
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

usersRouter.post('/me/avatar', requireAuth, requireCsrfHeader, handleAvatarUpload, async (req, res) => {
  const photo = req.file;
  if (!photo || !looksLikeImage(photo.buffer, photo.mimetype)) {
    res.status(400).json({ error: 'Please upload a valid photo (JPG, PNG, or WebP, under 5MB).' });
    return;
  }
  if (!supabaseAdmin) {
    res.status(500).json({ error: "We couldn't upload the photo. Please try again." });
    return;
  }

  const ext = AVATAR_MIME_TO_EXT[photo.mimetype];
  const path = `${AVATAR_PHOTO_PATH_PREFIX}${req.userId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(AVATAR_PHOTO_BUCKET)
    .upload(path, photo.buffer, { contentType: photo.mimetype });
  if (uploadError) {
    console.error('Avatar photo upload failed:', uploadError.message);
    res.status(500).json({ error: "We couldn't upload the photo. Please try again." });
    return;
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(AVATAR_PHOTO_BUCKET).getPublicUrl(path);

  const existing = db.prepare(`SELECT avatar_url FROM users WHERE id = ?`).get(req.userId!) as { avatar_url: string | null };
  await deleteAvatarPhotoIfAny(existing.avatar_url);
  db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`).run(publicUrlData.publicUrl, req.userId!);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ profile: profileSummary(user) });
});

usersRouter.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const rows = db
    .prepare(
      `SELECT username, display_name, avatar_key FROM users
       WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
       ORDER BY username LIMIT 15`
    )
    .all(req.userId!, `%${q}%`, `%${q}%`) as any[];
  res.json({
    users: rows.map((r) => ({ username: r.username, displayName: r.display_name, avatarKey: r.avatar_key })),
  });
});

usersRouter.get('/:username', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(req.params.username);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ profile: profileSummary(user) });
});
