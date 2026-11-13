import { z } from 'zod';
import { VIOLATION_KEYS } from './violations.js';
import { RANK_KEYS } from './ranks.js';
import { passwordSchema } from './password.js';
import { DUPLICATE_CHOICES, USERNAME_CHARS, arabicText, distinctChoices, nameText, questionText, sentenceText, wordsText } from './textRules.js';

// 'anonymous' = the plain person silhouette that teachers get by default (not a student hero choice).
// The pictures in frontend/src/components/Avatar.tsx (AVATAR_OPTIONS), plus teachers' plain 'anonymous'.
export const AVATAR_KEYS = ['owl', 'astronaut', 'qatariBoy', 'qatariGirl', 'scientist', 'pilot', 'wizard', 'robot', 'anonymous'] as const;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'The username is too short. Use at least 3 letters or numbers.')
  .max(20, 'The username is too long. Use at most 20 characters.')
  .regex(USERNAME_CHARS, 'The username can only have letters (Arabic or English), numbers and _ (underscore). Remove spaces and other symbols.')
  .refine((s) => /\p{L}/u.test(s), 'The username needs at least one letter, not only numbers.');

export const displayNameSchema = nameText(
  z.string().trim().min(2, 'The display name is too short. Write at least 2 letters.').max(40, 'The display name is too long. Use at most 40 letters.'),
  'name'
);

// What a teacher teaches -- shown as a dropdown at signup. Keys are stored; the Arabic/English
// labels live in frontend/src/lib/i18n.ts (auth.subject*).
export const TEACHER_SUBJECT_KEYS = ['math', 'science', 'islamic', 'english', 'arabic', 'ict', 'social', 'art'] as const;
export const teacherSubjectSchema = z.enum(TEACHER_SUBJECT_KEYS);

export const schoolNameSchema = nameText(
  z.string().trim().min(2, 'The school name is too short. Write at least 2 letters.').max(80, 'The school name is too long. Use at most 80 letters.'),
  'school name'
);

export const emailSchema = z.string().trim().email('Write your email like this: name@example.com').max(120);

// Allowed to be blank (clears the bio) -- only max-length is enforced.
export const bioSchema = wordsText(z.string().trim().max(300, 'The bio is too long. Use at most 300 letters.'), 'bio');

export const avatarKeySchema = z.enum(AVATAR_KEYS);

export const roleSchema = z.enum(['student', 'teacher']);
// Wider than roleSchema on purpose -- that one gates public signup (nobody can sign
// themselves up as an admin), this one gates the admin panel's own role-change action.
export const adminRoleSchema = z.enum(['student', 'teacher', 'admin']);
// z.coerce because signup now arrives as multipart/form-data (for the teacher ID file),
// where every field -- including this one -- comes across as a string.
export const gradeSchema = z.coerce.number().int().min(1).max(12);

export const signupSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    // The person's name, entered at signup before the username. Optional only so older clients
    // keep working -- the server falls back to the username when it is missing.
    displayName: displayNameSchema.optional(),
    avatarKey: avatarKeySchema,
    role: roleSchema,
    grade: gradeSchema.optional(),
    schoolName: schoolNameSchema,
    teacherSubject: teacherSubjectSchema.optional(),
    // Honeypot: a field real students never see or fill (hidden off-screen in the signup
    // form, see AuthShell.tsx) but a generic form-filling bot often does. Left blank by a
    // human, so anything else here fails the same way any other invalid field would --
    // no separate "you're a bot" response that would tip off a bot script either way.
    website: z.string().max(0, 'Something went wrong. Refresh the page and try again.').optional().default(''),
    // Language of the verification email (Firebase's template text can't be edited, only localised).
    lang: z.enum(['en', 'ar']).optional(),
  })
  .refine((data) => data.role !== 'student' || data.grade !== undefined, {
    message: 'Choose your grade.',
    path: ['grade'],
  })
  .refine((data) => data.role !== 'teacher' || data.teacherSubject !== undefined, {
    message: 'Choose the subject you teach.',
    path: ['teacherSubject'],
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Write your password.').max(200),
});

export const verifyEmailSchema = z.object({
  oobCode: z.string().min(1, 'The confirmation link is not complete. Open the link from your email again.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  lang: z.enum(['en', 'ar']).optional(),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Write the 6-digit code we sent you.'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Write your current password.').max(200),
  newPassword: passwordSchema,
  // the code emailed by /change-password/code; required for accounts with a real mailbox (Firebase)
  code: z.string().trim().regex(/^\d{6}$/, 'Write the 6-digit code we sent you.').optional(),
});

export const changePasswordCodeSchema = z.object({
  currentPassword: z.string().min(1, 'Write your current password.').max(200),
  lang: z.enum(['en', 'ar']).optional(),
});

export const verifyOtpSchema = z.object({
  idToken: z.string().min(1, 'Your confirmation session is missing. Log in again to continue.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Write the 6-digit code we sent you.'),
});

export const resendVerificationSchema = z.object({
  idToken: z.string().min(1, 'Your confirmation session is missing. Log in again to continue.'),
  lang: z.enum(['en', 'ar']).optional(),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarKey: avatarKeySchema.optional(),
  bio: bioSchema.optional(),
  // The person's own school and (students) class.
  schoolName: schoolNameSchema.optional(),
  grade: z.number().int().min(1).max(12).optional(),
  // A tier key or 'normal' (the site's own colours), or null to follow the current rank; users.ts checks the student has reached it.
  auraRank: z.enum([...RANK_KEYS, 'normal']).nullable().optional(),
});

export const adminSetRoleSchema = z.object({
  role: adminRoleSchema,
});

// An admin correcting an account's details: the class (students), the school (students and teachers) and the subject (teachers). The name and the email are never changed from here.
export const adminEditProfileSchema = z
  .object({
    grade: z.number().int().min(1).max(12).optional(),
    schoolName: schoolNameSchema.optional(),
    teacherSubject: teacherSubjectSchema.optional(),
  })
  .refine((v) => v.grade !== undefined || v.schoolName !== undefined || v.teacherSubject !== undefined, { message: 'Change at least one thing before saving.' });

export const adminSetActiveSchema = z.object({
  isActive: z.boolean(),
});

export const adminSetWarningSchema = z.object({
  // An empty string clears the warning the same as null does -- the admin panel's textarea
  // has no clean way to submit "null" itself.
  message: z
    .string()
    .trim()
    .max(500, 'The warning is too long. Use at most 500 letters.')
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const adminRevokeCertificateSchema = z.object({
  reason: wordsText(z.string().trim().min(3, 'Write the reason for taking this certificate back.').max(300, 'The reason is too long. Use at most 300 letters.'), 'reason'),
});

export const adminApplyViolationSchema = z.object({
  violation: z.enum(VIOLATION_KEYS),
  note: z.string().trim().max(300, 'The note is too long. Use at most 300 letters.').optional(),
  // how many points were gained unfairly (used only by the measures that take points off)
  points: z.number().int().min(0).max(1_000_000).optional(),
});

export const adminSetBanSchema = z.object({
  // null lifts the ban immediately; otherwise an ISO datetime in the future.
  bannedUntil: z.string().datetime().nullable(),
});

// Admin panel > Users: add points to, or take points from, an account (the person gets a pop-up about it).
export const adminAdjustPointsSchema = z.object({
  action: z.enum(['add', 'remove']),
  amount: z.number().int().min(1).max(1_000_000),
  // why, shown to the person in the pop-up (optional)
  note: z.string().trim().max(120).optional(),
  // when points are taken away: the rule that was broken (names it in the pop-up; the warning, suspension and so on are the rule form's job)
  violation: z.enum(VIOLATION_KEYS).optional(),
});

export const adminSetXpSchema = z.object({
  totalXp: z.number().int().min(0).max(1_000_000),
});

// Arrives as multipart/form-data (it's issued alongside an uploaded image), so every field
// lands as a string -- z.coerce.number() for userId, and the enum still validates a plain
// string fine.
export const adminIssueCertificateSchema = z.object({
  userId: z.coerce.number().int(),
  title: wordsText(z.string().trim().min(1, 'Write the name.').max(120), 'certificate name'),
  type: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'warrior', 'champion']),
});

const choiceSchema = z.string().trim().min(1, 'Write every answer: an answer is empty.').max(120, 'An answer is too long. Use at most 120 letters.');

export const teacherReelQuestionSchema = z.object({
  questionText: questionText(z.string().trim().min(3, 'The question is too short. Write at least 3 letters.').max(300, 'The question is too long. Use at most 300 letters.')),
  questionTextAr: arabicText(z.string().trim().max(300), 'question').optional().default(''),
  choices: z.array(choiceSchema).length(4, 'Each question needs exactly 4 choices.').refine(distinctChoices, DUPLICATE_CHOICES),
  choicesAr: z.array(z.string().trim().max(120)).length(4).refine(distinctChoices, DUPLICATE_CHOICES).optional().default(['', '', '', '']),
  correctIndex: z.number({ invalid_type_error: 'Choose the right answer of every question.' }).int().min(0).max(3),
  explanation: sentenceText(z.string().trim().min(3, 'The explanation is too short. Write at least 3 letters.').max(500, 'The explanation is too long. Use at most 500 letters.'), 'explanation'),
  explanationAr: arabicText(z.string().trim().max(500), 'explanation').optional().default(''),
});

// Questions are generated from the lesson name only (the video's title) -- the school question bank (lib/questionBank.ts) is searched for that
// lesson -- not from the lesson script.
export const generateQuestionsSchema = z.object({
  title: wordsText(z.string().trim().min(2, 'Write the lesson name first.').max(120), 'lesson name'),
  titleAr: arabicText(z.string().trim().max(120), 'lesson name').optional().default(''),
  subjectId: z.number().int(),
  grade: z.coerce.number().int().min(1).max(12),
  count: z.coerce.number().int().min(1).max(10).optional().default(4),
});

export const teacherReelSchema = z.object({
  subjectId: z.number().int(),
  grade: z.coerce.number().int().min(1).max(12),
  title: wordsText(z.string().trim().min(3, 'The title is too short. Write at least 3 letters.').max(120, 'The title is too long. Use at most 120 letters.'), 'lesson title'),
  titleAr: arabicText(z.string().trim().max(120), 'title').optional().default(''),
  scriptText: sentenceText(
    z.string().trim().min(10, 'The lesson text is too short. Write at least 10 letters.').max(2000, 'The lesson text is too long. Use at most 2000 letters.'),
    'lesson explanation'
  ),
  scriptTextAr: arabicText(z.string().trim().max(2000), 'lesson explanation').optional().default(''),
  durationSec: z.number().int().min(10).max(300).optional().default(60),
  // Optional -- a lesson can be video/script only, with no quiz at all.
  questions: z.array(teacherReelQuestionSchema).max(10).optional().default([]),
});

// Sign up / sign in with Google (routes/auth.ts POST /google): the Firebase ID token from the Google popup, and -- for someone with no account yet --
// whether they are signing up as a student or a teacher.
export const googleAuthSchema = z.object({
  idToken: z.string().min(20).max(6000),
  role: z.enum(['student', 'teacher']).optional(),
});

// The "complete your profile" step after a Google sign-up (routes/auth.ts POST /complete-profile). The account's role is already known, so the two
// roles have their own fields: a student gives name, school and grade; a teacher name, school and subject (plus the ID photo, uploaded alongside).
export const completeStudentProfileSchema = z.object({
  displayName: displayNameSchema,
  schoolName: schoolNameSchema,
  grade: gradeSchema,
});
export const completeTeacherProfileSchema = z.object({
  displayName: displayNameSchema,
  schoolName: schoolNameSchema,
  teacherSubject: teacherSubjectSchema,
});
