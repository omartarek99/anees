import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { seed } from './db/seed.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { reelsRouter } from './routes/reels.js';
import { mapRouter } from './routes/map.js';
import { worksheetsRouter } from './routes/worksheets.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { friendsRouter } from './routes/friends.js';
import { newsRouter } from './routes/news.js';
import { craftRouter } from './routes/craft.js';

seed();

const app = express();
// Deliberately not `process.env.PORT` — dev tooling that launches the combined
// `npm run dev` script (backend + frontend via concurrently) may inject a generic
// PORT meant for the frontend, which both child processes would otherwise inherit.
const PORT = Number(process.env.BACKEND_PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Student-only feature areas — a teacher account gets a 403 from the API even if it
// somehow reaches these routes directly, matching the student-only UI/routing on the
// frontend. News stays open to both roles (everyone reads announcements; only the
// POST/DELETE routes inside newsRouter itself are teacher-gated).
const studentOnly = [requireAuth, requireRole('student')];
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/reels', ...studentOnly, reelsRouter);
app.use('/api/map', ...studentOnly, mapRouter);
app.use('/api/worksheets', ...studentOnly, worksheetsRouter);
app.use('/api/leaderboard', ...studentOnly, leaderboardRouter);
app.use('/api/friends', ...studentOnly, friendsRouter);
app.use('/api/news', newsRouter);
app.use('/api/craft', ...studentOnly, craftRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Anees backend running on http://localhost:${PORT}`);
});
