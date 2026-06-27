export function bindLoginEvents({ api, render, onLoginSuccess, setAuthError, getAllowRegistration, setAllowRegistration }) {
  const loginButton = document.querySelector('#login-button');
  loginButton?.addEventListener('click', async () => {
    const usernameInput = document.querySelector('#login-username');
    const passwordInput = document.querySelector('#login-password');
    const feedback = document.querySelector('#login-feedback');
    const username = usernameInput?.value.trim() ?? '';
    const password = passwordInput?.value ?? '';

    setAuthError('');
    if (feedback) {
      feedback.hidden = true;
    }

    loginButton.disabled = true;
    try {
      const endpoint = getAllowRegistration() ? '/api/auth/register' : '/api/auth/login';
      const result = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      onLoginSuccess({
        username: result.username || username,
        role: result.role || ''
      });
      setAllowRegistration(false);
      void render();
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败';
      if (message.includes('系统已经完成初始化')) {
        setAllowRegistration(false);
      }
      if (message.includes('系统尚未初始化')) {
        setAllowRegistration(true);
      }
      setAuthError(message);
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = message;
      }
    } finally {
      loginButton.disabled = false;
    }
  });

  document.querySelector('#login-password')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      loginButton?.click();
    }
  });

  document.querySelector('#login-username')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      loginButton?.click();
    }
  });
}

export function bindLogoutEvents({ api, render, onLogout }) {
  const logoutButton = document.querySelector('#logout-button');
  logoutButton?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout request failure and clear local state anyway
    } finally {
      onLogout();
      void render();
    }
  });
}
