import { createUser, listUsers } from '../../core/userRepository.js';
import { sendJsonError } from '../http.js';
import { hashPassword } from '../userPassword.js';
import type { ApiRouteContext } from './types.js';

function isDuplicateUsernameError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: users\.username/i.test(error.message);
}

function normalizeUserInput(body: { username?: string; password?: string }): { username: string; password: string } {
  return {
    username: body.username?.trim() ?? '',
    password: typeof body.password === 'string' ? body.password : ''
  };
}

function validateUserInput(username: string, password: string): string | null {
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

export function registerUserRoutes({ app, authService }: ApiRouteContext): void {
  const requireRole = authService.requireRole.bind(authService);

  app.get('/api/users', requireRole('admin'), async (_req, res) => {
    try {
      res.json(await listUsers());
    } catch (error) {
      sendJsonError(res, error);
    }
  });

  app.post('/api/users', requireRole('admin'), async (req, res) => {
    try {
      const { username, password } = normalizeUserInput(req.body as { username?: string; password?: string });
      const validationMessage = validateUserInput(username, password);
      if (validationMessage) {
        sendJsonError(res, new Error(validationMessage), 400);
        return;
      }

      const createdUser = await createUser({
        username,
        passwordHash: hashPassword(password),
        role: 'user'
      });

      res.json({
        ok: true,
        data: createdUser
      });
    } catch (error) {
      if (isDuplicateUsernameError(error)) {
        sendJsonError(res, new Error('用户名已存在。'), 409);
        return;
      }
      sendJsonError(res, error);
    }
  });
}
