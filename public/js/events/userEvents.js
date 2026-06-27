import { showFeedback } from '../html.js';

export function bindUserEvents({ api, render }) {
  document.querySelector('#refresh-users')?.addEventListener('click', () => void render());

  const createUserButton = document.querySelector('#create-user');
  createUserButton?.addEventListener('click', async () => {
    const usernameInput = document.querySelector('#new-user-username');
    const passwordInput = document.querySelector('#new-user-password');
    const feedback = document.querySelector('#user-feedback');
    const username = usernameInput?.value.trim() ?? '';
    const password = passwordInput?.value ?? '';

    createUserButton.disabled = true;
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (usernameInput) {
        usernameInput.value = '';
      }
      if (passwordInput) {
        passwordInput.value = '';
      }
      if (feedback) {
        showFeedback(feedback, '普通用户已新增。', false);
      }
      void render();
    } catch (error) {
      if (feedback) {
        showFeedback(feedback, error instanceof Error ? error.message : '新增普通用户失败。', true);
      }
    } finally {
      createUserButton.disabled = false;
    }
  });
}
