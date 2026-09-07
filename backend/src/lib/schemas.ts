import { z } from 'zod';

export const AVATAR_KEYS = ['falcon', 'astronaut', 'knight', 'athlete', 'robot', 'explorer'] as const;

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

export const emailSchema = z.string().trim().email('Please enter a valid email address.').max(120);

export const avatarKeySchema = z.enum(AVATAR_KEYS);

export const roleSchema = z.enum(['student', 'teacher']);
// z.coerce because signup now arrives as multipart/form-data (for the teacher ID file),
// where every field -- including this one -- comes across as a string.
export const gradeSchema = z.coerce.number().int().min(1).max(12);

export const signupSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    avatarKey: avatarKeySchema,
    role: roleSchema,
    grade: gradeSchema.optional(),
  })
  .refine((data) => data.role !== 'student' || data.grade !== undefined, {
    message: 'Please enter your grade.',
    path: ['grade'],
  });

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const verifyEmailSchema = z.object({
  oobCode: z.string().min(1, 'Missing verification code.'),
});

export const resendVerificationSchema = z.object({
  idToken: z.string().min(1, 'Missing verification token.'),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarKey: avatarKeySchema.optional(),
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
