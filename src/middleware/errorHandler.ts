import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', {
    method: req.method,
    path: req.path,
    error: err?.message || err,
    stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
  });

  // Postgres unique constraint violation
  if (err?.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Duplicate entry',
      detail: err.detail || undefined,
    });
  }

  // Zod validation errors (if thrown directly)
  if (err?.name === 'ZodError' || err?.issues) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: err.issues || err,
    });
  }

  // JWT errors handled earlier usually, but catch here too
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'InternalError' : 'RequestError',
    message: status >= 500 ? 'Internal server error' : (err?.message || 'Request failed'),
  });
}
