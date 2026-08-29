import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid request.', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Lightweight CSRF mitigation: since auth uses an httpOnly cookie, a plain
 * cross-site <form> POST could ride the cookie. Browsers won't let a
 * cross-site form (or simple fetch) attach a custom header, so requiring
 * this header on every mutating request blocks that vector without needing
 * a separate CSRF token round-trip.
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction) {
  if (req.header('X-Requested-With') !== 'anees') {
    res.status(403).json({ error: 'Missing required request header.' });
    return;
  }
  next();
}
