import { getRedeemConfig, setRedeemToken } from '../../core/config.js';
import { fetchRemoteRedeemToken } from '../../services/redeemToken.js';
import { sendJsonError } from '../http.js';
import type { ApiRouteContext } from './types.js';

export function registerConfigRoutes({ app, authService }: ApiRouteContext): void {
  const requireRole = authService.requireRole.bind(authService);

  app.get('/api/config/redeem', authService.requireAuth, (req, res) => {
    const session = authService.getSessionFromRequest(req);
    res.json({
      redeemToken: session?.role === 'admin' ? getRedeemConfig().redeemToken : ''
    });
  });

  app.post('/api/config/redeem-token', requireRole('admin'), (req, res) => {
    try {
      const { token } = req.body as { token?: string };
      setRedeemToken(token ?? '');
      res.json(getRedeemConfig());
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/config/redeem-token/fetch', requireRole('admin'), async (_req, res) => {
    try {
      const { token, sourceUrl } = await fetchRemoteRedeemToken();
      setRedeemToken(token);
      res.json({
        ...getRedeemConfig(),
        sourceUrl
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });
}
