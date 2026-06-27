import { countUsers, createInitialAdmin } from '../../core/userRepository.js';
import { sendJsonError } from '../http.js';
import { hashPassword } from '../userPassword.js';
import type { ApiRouteContext } from './types.js';

function normalizeAuthInput(body: { username?: string; password?: string }): { username: string; password: string } {
  return {
    username: body.username?.trim() ?? '',
    password: body.password?.trim() ?? ''
  };
}

function validateCredentials(username: string, password: string): string | null {
  if (!username) {
    return '请输入用户名。';
  }
  if (!password) {
    return '请输入密码。';
  }
  if (username.length > 64) {
    return '用户名长度不能超过 64 个字符。';
  }
  return null;
}

export function registerAuthRoutes({ app, authService }: ApiRouteContext): void {
  app.get('/api/auth/status', async (req, res) => {
    try {
      const session = authService.getSessionFromRequest(req);
      const userCount = await countUsers();
      res.json({
        authenticated: Boolean(session),
        username: session?.username ?? '',
        role: session?.role ?? '',
        initialized: userCount > 0,
        allowRegistration: userCount === 0
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password } = normalizeAuthInput(req.body as { username?: string; password?: string });
      const validationMessage = validateCredentials(username, password);
      if (validationMessage) {
        sendJsonError(res, new Error(validationMessage), 400);
        return;
      }

      const createdUser = await createInitialAdmin({
        username,
        passwordHash: hashPassword(password)
      });
      if (!createdUser) {
        sendJsonError(res, new Error('系统已经完成初始化，请直接登录。'), 409);
        return;
      }

      const token = authService.createSession(createdUser.username, createdUser.role);
      authService.setSessionCookie(res, token);

      res.json({
        ok: true,
        username: createdUser.username,
        role: createdUser.role
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = normalizeAuthInput(req.body as { username?: string; password?: string });
      const validationMessage = validateCredentials(username, password);
      if (validationMessage) {
        sendJsonError(res, new Error(validationMessage), 400);
        return;
      }

      const userCount = await countUsers();
      if (userCount === 0) {
        sendJsonError(res, new Error('系统尚未初始化，请先注册首个管理员。'), 409);
        return;
      }

      const matchedUser = await authService.verifyCredentials(username, password);
      if (!matchedUser) {
        sendJsonError(res, new Error('账号或密码错误。'), 401);
        return;
      }

      const token = authService.createSession(matchedUser.username, matchedUser.role);
      authService.setSessionCookie(res, token);

      res.json({
        ok: true,
        username: matchedUser.username,
        role: matchedUser.role
      });
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    authService.clearSessionFromRequest(req);
    authService.clearSessionCookie(res);
    res.json({ ok: true });
  });
}
