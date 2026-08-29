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

export const signupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  avatarKey: avatarKeySchema,
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarKey: avatarKeySchema.optional(),
});
