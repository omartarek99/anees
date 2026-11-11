import { asyncRouter } from '../lib/asyncRouter.js';
import multer from 'multer';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader, handleUpload } from '../middleware/validate.js';
import { avatar3dSchema, updateProfileSchema } from '../lib/schemas.js';
import { moderateText } from '../lib/moderation.js';
import { getLevelInfo, getMapLevel } from '../lib/xp.js';
import { hasShield } from '../lib/battle.js';
import { earnedAuraRank, getRankTier, getTeacherRankTier } from '../lib/ranks.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { AVATAR_PHOTO_BUCKET, AVATAR_PHOTO_PATH_PREFIX, deleteAvatarPhotoIfAny } from '../lib/avatarPhoto.js';
import { looksLikeImage } from '../lib/imageValidation.js';

export const usersRouter = asyncRouter();

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

// Certificates this account holds -- sent automatically at a new level (lib/rankCertificates.ts) or by an admin (routes/admin.ts POST
// /certificates), minus any taken back -- shown on the profile as a portfolio, same idea as a teacher's videos below, most recent
// first so a newly-issued certificate is the first thing the recipient sees.
function userCertificates(userId: number) {
  const rows = db
    .prepare(
      `SELECT c.*, u.display_name as issuer_display_name FROM certificates c
       LEFT JOIN users u ON u.id = c.issued_by
       WHERE c.user_id = ? AND c.revoked_at IS NULL ORDER BY c.created_at DESC`
    )
    .all(userId) as any[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    imageUrl: r.image_url,
    issuedByName: r.issuer_display_name ?? null,
    createdAt: r.created_at,
  }));
}

// The stored 3D character, re-validated on the way out so a hand-edited / legacy row can never
// reach the client as anything but a well-formed config (or null -> default character).
function parseAvatar3d(raw: unknown) {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = avatar3dSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function profileSummary(user: any) {
  const { level: playerLevel, progress: levelProgress } = getLevelInfo(user.id);
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
  const videos = user.role === 'teacher' ? teacherVideos(user.id) : undefined;
  const worksheetsPrinted = db
    .prepare(`SELECT COUNT(*) as c FROM worksheet_prints WHERE user_id = ?`)
    .get(user.id) as { c: number };

  return {
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    avatarUrl: user.avatar_url ?? null,
    avatar3d: parseAvatar3d(user.avatar3d),
    role: user.role,
    bio: user.bio ?? '',
    // A teacher's school/subject is professional info shown on their public profile. A
    // student's school is not -- children's profiles are visible to other users, so it is
    // only added for their own profile (see GET /me below).
    teacherSubject: user.role === 'teacher' ? user.teacher_subject ?? null : null,
    schoolName: user.role === 'teacher' ? user.school_name ?? null : null,
    totalXp: user.total_xp,
    // Separate currency from total_xp, only ever nonzero for teachers (see lib/xp.ts) --
    // drives the teacher-only leaderboard, shown on their own profile instead of total XP.
    teacherPoints: user.teacher_points ?? 0,
    playerLevel,
    // 0..1 toward the next level, and the adventure-map level they are on
    levelProgress,
    mapLevel: getMapLevel(user.id),
    rankTier: user.role === 'teacher' ? getTeacherRankTier(user.teacher_points ?? 0) : getRankTier(user.total_xp),
    levelsCompleted: completedLevels.c,
    bossesDefeated: bossesDefeated.c,
    worksheetsCompleted: worksheetsCompleted.c,
    videosCount: videos?.length ?? 0,
    worksheetsPrintedCount: worksheetsPrinted.c,
    joinedAt: user.created_at,
    hasShield: hasShield(user.id),
    videos,
    certificates: userCertificates(user.id),
  };
}

// The caller's OWN profile: profileSummary plus the private-to-owner school name (profileSummary only
// shows it for teachers, publicly). Every self-returning route uses this so a save never blanks it.
function ownProfile(user: any) {
  return { ...profileSummary(user), schoolName: user.school_name ?? null };
}

usersRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'We couldn\'t find this user.' });
    return;
  }
  res.json({ profile: ownProfile(user) });
});

usersRouter.patch('/me', requireAuth, requireCsrfHeader, validateBody(updateProfileSchema), async (req, res) => {
  const { displayName, avatarKey, bio, avatar3d, auraRank } = req.body as {
    displayName?: string;
    avatarKey?: string;
    bio?: string;
    avatar3d?: unknown;
    auraRank?: string | null;
  };

  // Every moderation check runs before the first write, so a request rejected for one field
  // never leaves another field of the same request half-saved.
  if (displayName !== undefined && !moderateText(displayName).allowed) {
    res.status(400).json({ error: 'This display name is not allowed. Choose a different one.' });
    return;
  }
  // A rank colour is only for a student, and only one they have reached (their own rank or a lower one); null goes back to following their rank.
  if (auraRank && auraRank !== 'normal') {
    const me = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`).get(req.userId!) as { role: string; total_xp: number };
    if (me.role !== 'student' || earnedAuraRank(auraRank, me.total_xp) !== auraRank) {
      res.status(400).json({ error: 'You can only choose the colour of a rank you have already reached.' });
      return;
    }
  }
  // Empty bio (clearing it) is always fine -- only non-empty text needs moderation.
  if (bio && !moderateText(bio).allowed) {
    res.status(400).json({ error: 'Your bio cannot have inappropriate words or contact details (phone, email, social accounts). Remove them and try again.' });
    return;
  }

  if (displayName !== undefined) {
    db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(displayName, req.userId!);
  }
  // Picking a picture replaces an uploaded photo (the photo would otherwise keep covering it).
  if (avatarKey !== undefined) {
    const existing = db.prepare(`SELECT avatar_url FROM users WHERE id = ?`).get(req.userId!) as { avatar_url: string | null };
    await deleteAvatarPhotoIfAny(existing.avatar_url);
    db.prepare(`UPDATE users SET avatar_key = ?, avatar_url = NULL WHERE id = ?`).run(avatarKey, req.userId!);
  }
  if (avatar3d !== undefined) {
    db.prepare(`UPDATE users SET avatar3d = ? WHERE id = ?`).run(JSON.stringify(avatar3d), req.userId!);
  }
  if (auraRank !== undefined) {
    db.prepare(`UPDATE users SET aura_rank = ? WHERE id = ?`).run(auraRank, req.userId!);
  }
  if (bio !== undefined) {
    db.prepare(`UPDATE users SET bio = ? WHERE id = ?`).run(bio, req.userId!);
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ profile: ownProfile(user) });
});

// JPEG/PNG/WebP only, matching what browsers natively produce from an image picker/camera.
const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in AVATAR_MIME_TO_EXT) cb(null, true);
    else cb(new Error('INVALID_AVATAR_TYPE'));
  },
}).single('photo');

const handleAvatarUpload = handleUpload(avatarUpload, 'The photo must be a JPG, PNG or WebP file smaller than 5MB. Choose another photo.');

usersRouter.post('/me/avatar', requireAuth, requireCsrfHeader, handleAvatarUpload, async (req, res) => {
  const photo = req.file;
  if (!photo || !looksLikeImage(photo.buffer, photo.mimetype)) {
    res.status(400).json({ error: 'The photo must be a JPG, PNG or WebP file smaller than 5MB. Choose another photo.' });
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
  res.json({ profile: ownProfile(user) });
});

// Points an admin added or took from this account that they have not closed yet: the app pops them up (components/PointsNoticeModal.tsx).
usersRouter.get('/me/points-notices', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT n.id, n.delta, n.new_total, n.kind, n.note, n.violation, n.created_at, a.display_name AS admin_name
       FROM points_notices n LEFT JOIN users a ON a.id = n.admin_id
       WHERE n.user_id = ? AND n.read_at IS NULL ORDER BY n.id`)
    .all(req.userId!) as any[];
  res.json({ notices: rows.map((r) => ({ id: r.id, delta: r.delta, newTotal: r.new_total, kind: r.kind, note: r.note, violation: r.violation ?? null, createdAt: r.created_at, adminName: r.admin_name ?? null })) });
});

usersRouter.post('/me/points-notices/:id/read', requireAuth, requireCsrfHeader, (req, res) => {
  const result = db.prepare(`UPDATE points_notices SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL`).run(Number(req.params.id), req.userId!);
  res.json({ ok: true, changed: Number(result.changes) });
});

usersRouter.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  // % and _ typed by the user are literal characters, not wildcards; admin accounts aren't
  // something a student should be able to search for and friend.
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = db
    .prepare(
      `SELECT username, display_name, avatar_key FROM users
       WHERE id != ? AND role != 'admin' AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
       ORDER BY username LIMIT 15`
    )
    .all(req.userId!, like, like) as any[];
  res.json({
    users: rows.map((r) => ({ username: r.username, displayName: r.display_name, avatarKey: r.avatar_key })),
  });
});

usersRouter.get('/:username', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(req.params.username);
  if (!user) {
    res.status(404).json({ error: 'We couldn\'t find this user.' });
    return;
  }
  // Admin accounts aren't part of the social side of the app (hidden from search, leaderboard and
  // friend requests), so only another admin can open their profile.
  const caller = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.userId!) as { role: string } | undefined;
  if ((user as any).role === 'admin' && caller?.role !== 'admin') {
    res.status(404).json({ error: 'We couldn\'t find this user.' });
    return;
  }
  res.json({ profile: profileSummary(user) });
});
