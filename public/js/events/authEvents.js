export function bindLoginEvents({ api, render, onLoginSuccess, setAuthError }) {
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
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      onLoginSuccess({
        username: result.username || username,
        role: result.role || ''
      });
      void render();
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败';
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
