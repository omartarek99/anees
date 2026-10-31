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

// Requests per minute per IP. Defaults to 200; API_RATE_LIMIT_PER_MIN overrides it (e.g. raised for a short
// load test of the live site, then removed again). Anything that is not a positive whole number is ignored.
const configuredApiLimit = Number.parseInt(process.env.API_RATE_LIMIT_PER_MIN ?? '', 10);
const API_LIMIT_PER_MIN = Number.isInteger(configuredApiLimit) && configuredApiLimit > 0 ? configuredApiLimit : 200;

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: API_LIMIT_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  // The challenge screen asks "is there a game for me?" every few seconds; that one call has its own per-player limit instead (challengePollLimiter).
  skip: (req) => skipForLoadTest() || (req.method === 'GET' && req.path === '/challenges/current'),
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

// A teacher's video uploads each hold up to 100MB in memory and run a transcode: per signed-in user,
// a handful per quarter hour is plenty for real lesson work. Must run after requireAuth.
export const videoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${(req as any).userId ?? 'anon'}`,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// One signed-in player may poll for their friend challenge about every second; keyed by user, not IP, so a classroom behind one address is fine.
export const challengePollLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req as any).userId ?? "anonymous"),
});
