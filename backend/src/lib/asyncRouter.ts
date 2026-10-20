import { Router } from 'express';
import type { RequestHandler } from 'express';

// Express 4 doesn't catch a rejected promise from an `async` handler: the error becomes an
// unhandled rejection and Node exits, taking every user down with it (a duplicate-username signup
// race and a mismatched ENCRYPTION_KEY on login both did exactly that). A router built here wraps
// each handler so a throw/rejection reaches the error middleware in index.ts instead.
// Error middlewares (4 args) are left alone so Express still recognises them.
function wrap(handler: RequestHandler): RequestHandler {
  if (handler.length > 3) return handler;
  return (req, res, next) => {
    try {
      const result = handler(req, res, next) as unknown;
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

export function asyncRouter(): Router {
  const router = Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const original = router[method].bind(router) as (path: unknown, ...handlers: unknown[]) => Router;
    (router as unknown as Record<string, unknown>)[method] = (path: unknown, ...handlers: unknown[]) =>
      original(path, ...handlers.map((h) => (typeof h === 'function' ? wrap(h as RequestHandler) : h)));
  }
  return router;
}
