import { db } from '../db/db.js';
import { revokeUserCertificates } from './rankCertificates.js';

// The rules a student can break, and what happens when they do. An admin records a violation from the Users page (routes/admin.ts) and the
// measures below are applied for them, so the same thing happens to everyone who breaks the same rule. Each rule climbs with repeats: `steps`
// are the measures for the 1st, the 2nd and the 3rd (and any later) time THAT rule is broken. Every step also sends a numbered warning.
//
//   deductPoints  the admin enters how many points were gained unfairly; they are taken off (never below zero) and logged in the points history
//   revoke        certificates taken back: 'unearned' = the rank certificates for levels the points no longer reach, 'all' = every certificate
//   suspendDays   the account cannot be used for that many days
//   deactivate    the account is closed (an admin can switch it back on from the Users page)
//
// GET /api/violations serves this list as it is, so the Terms page and the admin panel always show what is really enforced.
export type Measure = { deductPoints?: boolean; revoke?: 'unearned' | 'all'; suspendDays?: number; deactivate?: boolean };

export type Violation = {
  key: string;
  title: string;
  titleAr: string;
  example: string;
  exampleAr: string;
  /** what the warning says the student did */
  warning: string;
  warningAr: string;
  steps: [Measure, Measure, Measure];
};

export const VIOLATIONS: Violation[] = [
  {
    key: 'points_farming',
    title: 'Farming points',
    titleAr: 'جمع النقاط بطرق غير عادلة',
    example: 'Using a script, bot or auto-clicker, or repeating the same lesson only to collect points.',
    exampleAr: 'استخدام برنامج آلي أو نقر تلقائي، أو تكرار الدرس نفسه لجمع النقاط فقط.',
    warning: 'You collected points in an unfair way (a script, a bot or endless repeating).',
    warningAr: 'جمعتَ النقاط بطريقة غير عادلة (برنامج آلي أو تكرار بلا نهاية).',
    steps: [
      { deductPoints: true, revoke: 'unearned' },
      { deductPoints: true, revoke: 'unearned', suspendDays: 7 },
      { deductPoints: true, revoke: 'all', suspendDays: 30 },
    ],
  },
  {
    key: 'copying_answers',
    title: 'Copying answers',
    titleAr: 'نسخ الإجابات',
    example: 'Copying quiz or challenge answers from another student, or passing an answer sheet around.',
    exampleAr: 'نسخ إجابات الاختبار أو التحدي من طالب آخر، أو تمرير ورقة الإجابات بين الطلاب.',
    warning: 'You copied answers or shared them with others in a quiz or a challenge.',
    warningAr: 'نسختَ الإجابات أو شاركتها مع غيرك في اختبار أو تحدٍّ.',
    steps: [{}, { deductPoints: true, suspendDays: 3 }, { deductPoints: true, revoke: 'unearned', suspendDays: 14 }],
  },
  {
    key: 'bug_exploit',
    title: 'Exploiting a bug',
    titleAr: 'استغلال خلل في الموقع',
    example: 'Using a bug or glitch on purpose to get points or items, and not telling us about it.',
    exampleAr: 'استخدام خلل في الموقع عمدًا للحصول على نقاط أو عناصر دون إبلاغنا عنه.',
    warning: 'You used a bug in Anees on purpose to gain points or items.',
    warningAr: 'استغللتَ خللًا في أنيس عمدًا للحصول على نقاط أو عناصر.',
    steps: [
      { deductPoints: true },
      { deductPoints: true, revoke: 'unearned', suspendDays: 7 },
      { deductPoints: true, revoke: 'all', suspendDays: 30 },
    ],
  },
  {
    key: 'account_misuse',
    title: 'Sharing or faking an account',
    titleAr: 'مشاركة الحساب أو انتحال الهوية',
    example: 'Giving your password to someone, logging in as another student, pretending to be a teacher, or selling an account.',
    exampleAr: 'إعطاء كلمة مرورك لغيرك، أو الدخول بحساب طالب آخر، أو انتحال صفة معلّم، أو بيع حساب.',
    warning: 'You shared your account, used someone else’s, or pretended to be another person.',
    warningAr: 'شاركتَ حسابك أو استخدمتَ حساب غيرك أو انتحلتَ شخصية أخرى.',
    steps: [{}, { suspendDays: 7 }, { deactivate: true }],
  },
  {
    key: 'offensive_content',
    title: 'Offensive name or picture',
    titleAr: 'اسم أو صورة غير لائقة',
    example: 'A rude or inappropriate username, display name or profile picture.',
    exampleAr: 'اسم مستخدم أو اسم ظاهر أو صورة شخصية غير لائقة.',
    warning: 'Your name or profile picture is not appropriate for Anees.',
    warningAr: 'اسمك أو صورتك الشخصية غير مناسبة لأنيس.',
    steps: [{}, { suspendDays: 3 }, { suspendDays: 14 }],
  },
  {
    key: 'harassment',
    title: 'Bothering other students',
    titleAr: 'إزعاج الطلاب الآخرين',
    example: 'Insulting, threatening or spamming other students with friend requests or challenges.',
    exampleAr: 'إهانة الطلاب الآخرين أو تهديدهم أو إغراقهم بطلبات الصداقة أو التحديات.',
    warning: 'You bothered, insulted or threatened other students.',
    warningAr: 'أزعجتَ طلابًا آخرين أو أهنتهم أو هددتهم.',
    steps: [{ suspendDays: 3 }, { suspendDays: 14 }, { deactivate: true }],
  },
  {
    key: 'certificate_forgery',
    title: 'Faking a certificate',
    titleAr: 'تزوير شهادة',
    example: 'Editing a certificate, or claiming a certificate you did not earn.',
    exampleAr: 'تعديل شهادة، أو الادعاء بالحصول على شهادة لم تنلها.',
    warning: 'You faked a certificate or claimed one you did not earn.',
    warningAr: 'زوّرتَ شهادة أو ادّعيتَ شهادة لم تنلها.',
    steps: [{ revoke: 'all' }, { revoke: 'all', suspendDays: 14 }, { revoke: 'all', deactivate: true }],
  },
];

/** Sends a numbered warning (the same rows routes/admin.ts PATCH /users/:id/warning writes) and returns its number. */
function sendWarning(userId: number, message: string, adminId: number): number {
  const { n } = db.prepare(`SELECT COALESCE(MAX(warning_number), 0) AS n FROM user_warnings WHERE user_id = ?`).get(userId) as { n: number };
  const now = new Date().toISOString();
  db.prepare(`UPDATE users SET warning_message = ?, warning_issued_at = ?, warning_number = ? WHERE id = ?`).run(message, now, n + 1, userId);
  db.prepare(`INSERT INTO user_warnings (user_id, warning_number, message, created_at, issued_by) VALUES (?,?,?,?,?)`).run(userId, n + 1, message, now, adminId);
  return n + 1;
}

export const VIOLATION_KEYS = VIOLATIONS.map((v) => v.key) as [string, ...string[]];

/** The measure for the `offense`-th time (1 = first) a rule is broken. */
export function measureFor(violation: Violation, offense: number): Measure {
  return violation.steps[Math.min(offense, violation.steps.length) - 1];
}

type Applied = { offense: number; pointsRemoved: number; certificatesRevoked: number; suspendedUntil: string | null; deactivated: boolean; warningNumber: number };

/** The bilingual warning the student reads: the rule they broke, then what was done about it. */
function warningText(v: Violation, a: Applied, note: string | undefined) {
  const en = [v.warning, a.pointsRemoved && `${a.pointsRemoved} points were removed.`, a.certificatesRevoked && `${a.certificatesRevoked} certificate(s) were taken back.`];
  const ar = [v.warningAr, a.pointsRemoved && `أُزيلت ${a.pointsRemoved} نقطة.`, a.certificatesRevoked && `سُحبت ${a.certificatesRevoked} شهادة.`];
  if (a.suspendedUntil) {
    const day = a.suspendedUntil.slice(0, 10);
    en.push(`Your account is suspended until ${day}.`);
    ar.push(`حسابك موقوف حتى ${day}.`);
  }
  if (a.deactivated) {
    en.push('Your account has been closed.');
    ar.push('أُغلق حسابك.');
  }
  if (note) en.push(note);
  return `${en.filter(Boolean).join(' ')}\n${ar.filter(Boolean).join(' ')}`;
}

/** Applies a rule's measures to a student, all or nothing: the numbered warning, the points taken off, the certificates taken back, the
 * suspension or closure, and the record in user_violations. `points` is what the admin says was gained unfairly (used only when the measure
 * takes points off). */
export function applyViolation(userId: number, key: string, adminId: number, input: { note?: string; points?: number }): Applied {
  const violation = VIOLATIONS.find((v) => v.key === key)!;
  const note = input.note?.trim() || undefined;
  const offense = (db.prepare(`SELECT COUNT(*) AS n FROM user_violations WHERE user_id = ? AND violation = ?`).get(userId, key) as { n: number }).n + 1;
  const measure = measureFor(violation, offense);
  const user = db.prepare(`SELECT total_xp, banned_until FROM users WHERE id = ?`).get(userId) as { total_xp: number; banned_until: string | null };

  const pointsRemoved = measure.deductPoints ? Math.min(Math.max(0, Math.trunc(input.points ?? 0)), user.total_xp) : 0;
  let suspendedUntil: string | null = null;
  if (measure.suspendDays) {
    // from today, or from the end of a suspension that is still running
    const from = Math.max(Date.now(), user.banned_until ? new Date(user.banned_until).getTime() : 0);
    suspendedUntil = new Date(from + measure.suspendDays * 86_400_000).toISOString();
  }

  db.exec('BEGIN');
  try {
    if (pointsRemoved) {
      db.prepare(`UPDATE users SET total_xp = total_xp - ? WHERE id = ?`).run(pointsRemoved, userId);
      db.prepare(`INSERT INTO xp_events (user_id, amount, reason) VALUES (?,?,?)`).run(userId, -pointsRemoved, 'violation');
    }
    const certificatesRevoked = measure.revoke ? revokeUserCertificates(userId, adminId, `${violation.title} (${offense})`, measure.revoke) : 0;
    if (suspendedUntil) db.prepare(`UPDATE users SET banned_until = ? WHERE id = ?`).run(suspendedUntil, userId);
    if (measure.deactivate) db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(userId);

    const applied: Applied = { offense, pointsRemoved, certificatesRevoked, suspendedUntil, deactivated: !!measure.deactivate, warningNumber: 0 };
    applied.warningNumber = sendWarning(userId, warningText(violation, applied, note), adminId);
    db.prepare(
      `INSERT INTO user_violations (user_id, violation, offense, note, points_removed, certificates_revoked, suspended_days, deactivated, issued_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(userId, key, offense, note ?? null, pointsRemoved, certificatesRevoked, measure.suspendDays ?? 0, measure.deactivate ? 1 : 0, adminId);
    db.exec('COMMIT');
    return applied;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
