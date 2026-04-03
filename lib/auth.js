// lib/auth.js — JWT helpers & middleware
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'companionai-secret-fallback';

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Extract token from request Authorization header
export function getTokenFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Returns user or null — use in API routes
export async function getUserFromRequest(request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.isActive) return null;
  return user;
}

// Returns user or Response(401) — use in protected API routes
export async function requireAuth(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return { user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, error: null };
}

// Admin only
export async function requireAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (user.role !== 'admin') {
    return { user: null, error: Response.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { user, error: null };
}
