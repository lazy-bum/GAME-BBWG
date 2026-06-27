import { countUsers, createInitialAdmin, createUser } from '../../core/userRepository.js';
import { sendJsonError } from '../http.js';
import { hashPassword } from '../userPassword.js';
import type { ApiRouteContext } from './types.js';

function shouldUseSecureCookie(req: { secure: boolean; get(name: string): string | undefined }): boolean {
  return req.secure;
}

function normalizeAuthInput(body: { username?: string; password?: string }): { username: string; password: string } {
  return {
    username: body.username?.trim() ?? '',
    password: typeof body.password === 'string' ? body.password : ''
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
  if (password.length > 256) {
    return '密码长度不能超过 256 个字符。';
  }
  return null;
}

function isDuplicateUsernameError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: users\.username/i.test(error.message);
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

      const passwordHash = hashPassword(password);
      let createdUser = null;
      if ((await countUsers()) === 0) {
        createdUser = await createInitialAdmin({
          username,
          passwordHash
        });
      }
      if (!createdUser) {
        createdUser = await createUser({
          username,
          passwordHash,
          role: 'user',
          actorUsername: username
        });
      }

      const token = authService.createSession(createdUser.username, createdUser.role);
      authService.setSessionCookie(res, token, { secure: shouldUseSecureCookie(req) });

      res.json({
        ok: true,
        username: createdUser.username,
        role: createdUser.role
      });
    } catch (error) {
      if (isDuplicateUsernameError(error)) {
        sendJsonError(res, new Error('用户名已存在。'), 409);
        return;
      }
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
      authService.setSessionCookie(res, token, { secure: shouldUseSecureCookie(req) });

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
    authService.clearSessionCookie(res, { secure: shouldUseSecureCookie(req) });
    res.json({ ok: true });
  });
}
