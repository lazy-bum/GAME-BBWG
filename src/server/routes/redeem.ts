import {
  createManagedRedeemCodes,
  deleteRedeemCode,
  listRedeemCodes
} from '../../core/redeemCodeRepository.js';
import { sendJsonError } from '../http.js';
import type { ApiRouteContext } from './types.js';

export function registerRedeemRoutes({
  app,
  authService,
  redeemService,
  sseHub,
  pollActiveRedeemCodeSource
}: ApiRouteContext): void {
  const requireAuth = authService.requireAuth;
  const requireRole = authService.requireRole.bind(authService);
  const getActorUsername = (req: Parameters<typeof authService.getSessionFromRequest>[0]): string =>
    authService.getSessionFromRequest(req)?.username ?? 'system';

  app.get('/api/redeem/events', requireAuth, (req, res) => {
    sseHub.handleRedeemEvents(req, res);
  });

  app.post('/api/redeem/run', requireRole('admin'), async (req, res) => {
    try {
      const { giftCode, targetAccountIds } = req.body as { giftCode?: string; targetAccountIds?: string[] };
      const result = await redeemService.runBatchRedeem(
        giftCode ?? '',
        Array.isArray(targetAccountIds) ? targetAccountIds : undefined,
        {
          autoRetryFailedOnce: true,
          includeTargetAccounts: Array.isArray(targetAccountIds) && targetAccountIds.length > 0,
          actorUsername: getActorUsername(req)
        }
      );
      res.json({ ok: true, data: result });
    } catch (error) {
      res.json({
        ok: false,
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  });

  app.post('/api/redeem/run-many', requireRole('admin'), async (req, res) => {
    try {
      const { giftCodes, targetAccountIds } = req.body as { giftCodes?: string[]; targetAccountIds?: string[] };
      const result = await redeemService.runMultiCodeRedeem(
        Array.isArray(giftCodes) ? giftCodes : [],
        Array.isArray(targetAccountIds) ? targetAccountIds : undefined,
        getActorUsername(req)
      );
      res.json({ ok: true, data: result });
    } catch (error) {
      res.json({
        ok: false,
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  });

  app.post('/api/redeem/retry-code-failures', requireRole('admin'), async (req, res) => {
    try {
      const { failures } = req.body as { failures?: Array<{ giftCode?: string; accountIds?: string[] }> };
      const result = await redeemService.runCodeFailureRedeem(
        Array.isArray(failures)
          ? failures.map((item) => ({
              giftCode: item.giftCode ?? '',
              accountIds: Array.isArray(item.accountIds) ? item.accountIds : []
            }))
          : [],
        getActorUsername(req)
      );
      res.json({ ok: true, data: result });
    } catch (error) {
      res.json({
        ok: false,
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  });

  app.post('/api/redeem/stop', requireRole('admin'), (_req, res) => {
    res.json({
      ok: true,
      stopped: redeemService.requestCancel()
    });
  });

  app.post('/api/redeem/force-complete-all', requireRole('admin'), async (req, res) => {
    try {
      const result = await redeemService.forceCompleteAllRedeem(getActorUsername(req));
      res.json(result);
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.get('/api/redeem-codes', requireAuth, async (req, res) => {
    try {
      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const parsedLimit = Number(rawLimit);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 200)) : 50;
      const rows = await listRedeemCodes(limit);
      res.json(rows);
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/redeem-codes', requireRole('admin'), async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        code?: string;
        validityType?: 'permanent' | 'timed';
        validFrom?: number;
        validUntil?: number;
        minLevel?: number;
        note?: string;
      };
      const result = await createManagedRedeemCodes([
        {
          code: body.code ?? '',
          validityType: body.validityType ?? 'permanent',
          validFrom: body.validFrom,
          validUntil: body.validUntil,
          minLevel: body.minLevel,
          note: body.note
        }
      ], getActorUsername(req));
      res.json({ ok: true, data: result });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/redeem-codes/batch', requireRole('admin'), async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        codes?: string[];
        validityType?: 'permanent' | 'timed';
        validFrom?: number;
        validUntil?: number;
        minLevel?: number;
        note?: string;
      };
      const codes = Array.isArray(body.codes) ? body.codes : [];
      const result = await createManagedRedeemCodes(
        codes.map((code) => ({
          code,
          validityType: body.validityType ?? 'permanent',
          validFrom: body.validFrom,
          validUntil: body.validUntil,
          minLevel: body.minLevel,
          note: body.note
        })),
        getActorUsername(req)
      );
      res.json({ ok: true, data: result });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.delete('/api/redeem-codes/:code', requireRole('admin'), async (req, res) => {
    try {
      const rawCode = req.params.code;
      const deleted = await deleteRedeemCode(Array.isArray(rawCode) ? rawCode[0] ?? '' : rawCode ?? '');
      res.json({ ok: true, deleted });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/redeem-codes/sync', requireRole('admin'), async (req, res) => {
    try {
      const result = await pollActiveRedeemCodeSource(getActorUsername(req));
      res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });
}
