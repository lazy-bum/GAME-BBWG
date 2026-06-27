import type express from 'express';
import { enqueueVisitorLog, getCachedBlacklistEntry } from '../core/visitorRepository.js';
import type { AuthService } from './auth.js';
import { normalizeIpAddress, sendJsonError } from './http.js';

const REDACTED_VALUE = '[redacted]';
const SENSITIVE_FIELD_PATTERN =
  /(pass(word)?|token|secret|cookie|authorization|session|sign|api[-_]?key|password_hash)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSensitiveFieldName(value: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(value);
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveFieldName(key) ? REDACTED_VALUE : sanitizeForLog(nestedValue)
      ])
    );
  }

  return value;
}

function getClientIp(req: express.Request): string {
  return normalizeIpAddress(req.ip || req.socket.remoteAddress || '');
}

function getRequestProtocol(req: express.Request): string {
  return req.protocol;
}

function getRequestHost(req: express.Request): string {
  return req.get('host') || '';
}

function stringifyForLog(value: unknown, maxLength = 16_000): string {
  if (value === undefined) {
    return '';
  }

  try {
    const sanitizedValue = sanitizeForLog(value);
    const serialized = typeof sanitizedValue === 'string' ? sanitizedValue : JSON.stringify(sanitizedValue);
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...[truncated]` : serialized;
  } catch {
    return '[unserializable]';
  }
}

function shouldAuditRequest(req: express.Request): boolean {
  const requestPath = req.path || '';
  const staticAssetPattern =
    /^\/(?:app\.js|style\.css|favicon\.ico|manifest\.json|robots\.txt|apple-touch-icon.*|.*\.(?:js|css|map|png|jpg|jpeg|gif|svg|webp|ico|txt|woff|woff2))$/i;
  const auditExcludedPaths = new Set([
    '/',
    '/api/auth/status',
    '/api/config/redeem',
    '/api/visitor-logs',
    '/api/visitor-blacklist'
  ]);

  if (staticAssetPattern.test(requestPath)) {
    return false;
  }

  if (auditExcludedPaths.has(requestPath) || requestPath.startsWith('/api/visitor-blacklist/')) {
    return false;
  }

  return true;
}

export function createVisitorAuditMiddleware(authService: AuthService): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    const shouldAudit = shouldAuditRequest(req);

    res.on('finish', () => {
      if (!shouldAudit) {
        return;
      }

      const session = authService.getSessionFromRequest(req);
      enqueueVisitorLog({
        ipAddress: getClientIp(req),
        method: req.method,
        protocol: getRequestProtocol(req),
        host: getRequestHost(req),
        path: req.path,
        query: stringifyForLog(req.query),
        params: stringifyForLog(req.params),
        headers: stringifyForLog(req.headers),
        body: stringifyForLog(req.body),
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        username: session?.username ?? '',
        userRole: session?.role ?? '',
        userAgent: req.get('user-agent') || '',
        referer: req.get('referer') || '',
        cfRay: req.get('cf-ray') || '',
        cfCountry: req.get('cf-ipcountry') || '',
        blocked: Boolean(res.locals.auditBlocked),
        blockReason: typeof res.locals.auditBlockReason === 'string' ? res.locals.auditBlockReason : '',
        createdAt: Date.now()
      });
    });

    next();
  };
}

export function createVisitorBlacklistMiddleware(): express.RequestHandler {
  return async (req, res, next) => {
    try {
      const ipAddress = getClientIp(req);
      if (!ipAddress) {
        next();
        return;
      }

      const blacklistEntry = await getCachedBlacklistEntry(ipAddress);
      if (!blacklistEntry) {
        next();
        return;
      }

      res.locals.auditBlocked = true;
      res.locals.auditBlockReason = blacklistEntry.reason || '命中访问黑名单';
      res.status(404).send('Not Found');
    } catch (error) {
      sendJsonError(res, error);
    }
  };
}
