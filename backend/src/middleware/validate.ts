import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

/** The first message that we wrote ourselves for the form (zod's own texts like "Required" or "Invalid input" mean nothing to a person). */
function firstClearMessage(issues: { message: string }[]): string | null {
  for (const i of issues) {
    const m = i.message;
    if (/^[A-Z]/.test(m) && /[.!?]$/.test(m) && !/^(String|Number|Array|Expected|Invalid|Required|Too )/.test(m)) return m;
  }
  return null;
}

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: firstClearMessage(result.error.issues) ?? 'Something in the form is not right. Check it and try again.', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Wraps a multer middleware so any upload error (wrong type, too large, ...) becomes one 400 with `message`. */
export function handleUpload(upload: RequestHandler, message: string, tooLargeMessage?: string): RequestHandler {
  return (req, res, next) =>
    upload(req, res, (err?: unknown) => {
      if (err) {
        // a file over the size limit can say so, instead of the general "not a valid file" message
        const tooLarge = tooLargeMessage && (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
        res.status(400).json({ error: tooLarge ? tooLargeMessage : message });
      } else next();
    });
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
    res.status(403).json({ error: 'This request could not be completed. Refresh the page and try again.' });
    return;
  }
  next();
}
