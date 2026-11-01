import { asyncRouter } from '../lib/asyncRouter.js';
import { VIOLATIONS } from '../lib/violations.js';

export const violationsRouter = asyncRouter();

// The rules and what happens when they are broken -- public, like the Terms page that lists them, and the same list the admin panel applies.
violationsRouter.get('/', (_req, res) => {
  res.json({ violations: VIOLATIONS });
});
