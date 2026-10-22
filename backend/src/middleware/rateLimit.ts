import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// For load tests only (loadtest/README.md): one machine firing hundreds of requests a minute would just
// hit this limit and measure the limiter instead of the app. Never honoured in production.
const skipForLoadTest = () => process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMITS === '1';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipForLoadTest,
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
