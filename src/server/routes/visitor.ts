import {
  deleteAllVisitorLogs,
  deleteBlacklistEntry,
  listBlacklistEntries,
  listVisitorLogs,
  upsertBlacklistEntry
} from '../../core/visitorRepository.js';
import { isValidIpAddress, normalizeIpAddress, sendJsonError } from '../http.js';
import type { ApiRouteContext } from './types.js';

export function registerVisitorRoutes({ app, authService, visitorLogRetentionDays }: ApiRouteContext): void {
  const requireRole = authService.requireRole.bind(authService);
  const getActorUsername = (req: Parameters<typeof authService.getSessionFromRequest>[0]): string =>
    authService.getSessionFromRequest(req)?.username ?? 'system';

  app.get('/api/visitor-logs', requireRole('admin'), async (req, res) => {
    try {
      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const rawOffset = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
      const rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
      const parsedLimit = Number(rawLimit);
      const parsedOffset = Number(rawOffset);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.trunc(parsedLimit) : undefined;
      const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? Math.trunc(parsedOffset) : 0;
      const pathFilter = typeof rawPath === 'string' ? rawPath.trim() : '';
      const rows = await listVisitorLogs({
        limit: limit ? limit + 1 : undefined,
        offset,
        pathFilter
      });
      const hasMore = Boolean(limit && rows.length > limit);
      const items = hasMore && limit ? rows.slice(0, limit) : rows;
      res.json({
        retentionDays: visitorLogRetentionDays,
        items,
        offset,
        limit: limit ?? items.length,
        hasMore,
        pathFilter
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.delete('/api/visitor-logs', requireRole('admin'), async (_req, res) => {
    try {
      const deleted = await deleteAllVisitorLogs();
      res.json({ ok: true, deleted });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.get('/api/visitor-blacklist', requireRole('admin'), async (_req, res) => {
    try {
      const items = await listBlacklistEntries();
      res.json(items);
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/visitor-blacklist', requireRole('admin'), async (req, res) => {
    try {
      const { ipAddress, reason } = req.body as { ipAddress?: string; reason?: string };
      const normalizedIpAddress = normalizeIpAddress(ipAddress ?? '');
      const normalizedReason = reason?.trim() ?? '';

      if (!normalizedIpAddress) {
        sendJsonError(res, new Error('请输入要拉黑的 IP 地址。'), 400);
        return;
      }
      if (!isValidIpAddress(normalizedIpAddress)) {
        sendJsonError(res, new Error('IP 地址格式不正确。'), 400);
        return;
      }
      if (normalizedReason.length > 200) {
        sendJsonError(res, new Error('拉黑原因长度不能超过 200 个字符。'), 400);
        return;
      }

      await upsertBlacklistEntry(normalizedIpAddress, normalizedReason, getActorUsername(req));
      res.json({ ok: true });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.delete('/api/visitor-blacklist/:ipAddress', requireRole('admin'), async (req, res) => {
    try {
      const ipAddress = normalizeIpAddress(
        Array.isArray(req.params.ipAddress) ? req.params.ipAddress[0] : req.params.ipAddress
      );
      if (!ipAddress || !isValidIpAddress(ipAddress)) {
        sendJsonError(res, new Error('IP 地址格式不正确。'), 400);
        return;
      }
      await deleteBlacklistEntry(ipAddress);
      res.json({ ok: true });
    } catch (error) {
      sendJsonError(res, error);
    }
  });
}
