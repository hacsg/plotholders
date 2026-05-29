import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-in-production';

export interface AuthRequest extends Request {
  customerId?: string;
}

export function verifyJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { customerId: string; iat?: number; exp?: number };
    if (!decoded?.customerId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token payload' });
    }
    req.customerId = decoded.customerId;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }
}

export function generateJWT(customerId: string): string {
  return jwt.sign({ customerId }, JWT_SECRET, { expiresIn: '7d' });
}
