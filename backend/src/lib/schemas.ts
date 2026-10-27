import { z } from 'zod';

// 'anonymous' = the plain person silhouette that teachers get by default (not a student hero choice).
export const AVATAR_KEYS = ['falcon', 'astronaut', 'knight', 'athlete', 'robot', 'explorer', 'anonymous'] as const;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(20, 'Username must be at most 20 characters.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password is too long.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display name must be at least 2 characters.')
  .max(40, 'Display name must be at most 40 characters.');

// What a teacher teaches -- shown as a dropdown at signup. Keys are stored; the Arabic/English
// labels live in frontend/src/lib/i18n.ts (auth.subject*).
export const TEACHER_SUBJECT_KEYS = ['math', 'science', 'islamic', 'english', 'arabic', 'ict', 'social'] as const;
export const teacherSubjectSchema = z.enum(TEACHER_SUBJECT_KEYS);

export const schoolNameSchema = z
  .string()
  .trim()
  .min(2, 'School name must be at least 2 characters.')
  .max(80, 'School name must be at most 80 characters.');

export const emailSchema = z.string().trim().email('Please enter a valid email address.').max(120);

// Allowed to be blank (clears the bio) -- only max-length is enforced.
export const bioSchema = z.string().trim().max(300, 'Bio must be at most 300 characters.');

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
    website: z.string().max(0, 'Please leave this field blank.').optional().default(''),
    // Language of the verification email (Firebase's template text can't be edited, only localised).
    lang: z.enum(['en', 'ar']).optional(),
  })
  .refine((data) => data.role !== 'student' || data.grade !== undefined, {
    message: 'Please enter your grade.',
    path: ['grade'],
  })
  .refine((data) => data.role !== 'teacher' || data.teacherSubject !== undefined, {
    message: 'Please choose the subject you teach.',
    path: ['teacherSubject'],
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const verifyEmailSchema = z.object({
  oobCode: z.string().min(1, 'Missing verification code.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  lang: z.enum(['en', 'ar']).optional(),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordSchema,
});

export const verifyOtpSchema = z.object({
  idToken: z.string().min(1, 'Missing verification token.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const resendVerificationSchema = z.object({
  idToken: z.string().min(1, 'Missing verification token.'),
  lang: z.enum(['en', 'ar']).optional(),
});

// The student's 3D character: option ids only, so nothing free-form is ever stored. The lists
// below must match frontend/src/components/avatar3d/avatarConfig.ts.
const AVATAR3D_COLORS = ['white', 'black', 'maroon', 'red', 'yellow', 'green', 'blue', 'gray'] as const;
export const avatar3dSchema = z
  .object({
    skin: z.enum(['porcelain', 'fair', 'wheat', 'olive', 'tan', 'caramel', 'brown', 'deep']),
    outfit: z.enum(['thobe', 'casual']),
    thobe: z.enum(['summer', 'navy', 'brown']),
    top: z.enum(['tshirt', 'hoodie']),
    topColor: z.enum(AVATAR3D_COLORS),
    bottom: z.enum(['jeans', 'black-jeans', 'khaki', 'gray']),
    headwear: z.enum(['none', 'ghutra', 'cap']),
    capColor: z.enum(AVATAR3D_COLORS),
    accessory: z.enum(['none', 'reading', 'sunglasses']),
  })
  .strict();

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarKey: avatarKeySchema.optional(),
  bio: bioSchema.optional(),
  avatar3d: avatar3dSchema.optional(),
});

export const adminSetRoleSchema = z.object({
  role: adminRoleSchema,
});

export const adminSetActiveSchema = z.object({
  isActive: z.boolean(),
});

export const adminSetWarningSchema = z.object({
  // An empty string clears the warning the same as null does -- the admin panel's textarea
  // has no clean way to submit "null" itself.
  message: z
    .string()
    .trim()
    .max(500, 'Warning message is too long.')
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const adminSetBanSchema = z.object({
  // null lifts the ban immediately; otherwise an ISO datetime in the future.
  bannedUntil: z.string().datetime().nullable(),
});

export const adminSetXpSchema = z.object({
  totalXp: z.number().int().min(0).max(1_000_000),
});

// Arrives as multipart/form-data (it's issued alongside an uploaded image), so every field
// lands as a string -- z.coerce.number() for userId, and the enum still validates a plain
// string fine.
export const adminIssueCertificateSchema = z.object({
  userId: z.coerce.number().int(),
  title: z.string().trim().min(1, 'Name is required.').max(120),
  type: z.enum(['bronze', 'gold', 'platinum']),
});

const choiceSchema = z.string().trim().min(1).max(120);

export const teacherReelQuestionSchema = z.object({
  questionText: z.string().trim().min(3, 'Question is too short.').max(300),
  questionTextAr: z.string().trim().max(300).optional().default(''),
  choices: z.array(choiceSchema).length(4, 'Exactly 4 choices are required.'),
  choicesAr: z.array(z.string().trim().max(120)).length(4).optional().default(['', '', '', '']),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(3, 'Explanation is too short.').max(500),
  explanationAr: z.string().trim().max(500).optional().default(''),
});

export const generateQuestionsSchema = z.object({
  scriptText: z.string().trim().min(10, 'Write the lesson script first.').max(2000),
  scriptTextAr: z.string().trim().max(2000).optional().default(''),
  // The video's title -- used to find the matching lesson in the question bank (lib/questionBank.ts).
  title: z.string().trim().max(120).optional().default(''),
  titleAr: z.string().trim().max(120).optional().default(''),
  subjectId: z.number().int(),
  grade: z.coerce.number().int().min(1).max(12),
  count: z.coerce.number().int().min(1).max(10).optional().default(4),
});

export const teacherReelSchema = z.object({
  subjectId: z.number().int(),
  grade: z.coerce.number().int().min(1).max(12),
  title: z.string().trim().min(3, 'Title is too short.').max(120),
  titleAr: z.string().trim().max(120).optional().default(''),
  scriptText: z.string().trim().min(10, 'Script is too short.').max(2000),
  scriptTextAr: z.string().trim().max(2000).optional().default(''),
  durationSec: z.number().int().min(10).max(300).optional().default(60),
  // Optional -- a lesson can be video/script only, with no quiz at all.
  questions: z.array(teacherReelQuestionSchema).max(10).optional().default([]),
});
