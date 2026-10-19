import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auto-generating quiz questions calls a paid external API (Gemini) per request -- a
// tighter, dedicated limit keeps that cost bounded regardless of how generous apiLimiter is.
export const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Worksheets built from a video call the AI on EVERY click (a fresh set each time), so this
// is keyed per signed-in user rather than per IP -- a whole class behind one school IP
// shouldn't share a single allowance. Must run after requireAuth.
export const worksheetAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${(req as any).userId ?? 'anon'}`,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
