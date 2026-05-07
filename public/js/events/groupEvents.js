import { showFeedback } from '../html.js';

export function bindGroupEvents({ api, render }) {
  document.querySelector('#refresh-account-groups')?.addEventListener('click', () => void render());

  const createAccountGroupButton = document.querySelector('#create-account-group');
  createAccountGroupButton?.addEventListener('click', async () => {
    const nameInput = document.querySelector('#new-group-name');
    const priorityInput = document.querySelector('#new-group-priority');
    const sortInput = document.querySelector('#new-group-sort');
    const feedback = document.querySelector('#group-feedback');
    const name = nameInput?.value.trim() ?? '';
    const priority = Number(priorityInput?.value ?? 0);
    const rawSort = sortInput?.value.trim() ?? '';
    const sortOrder = rawSort ? Number(rawSort) : undefined;

    createAccountGroupButton.disabled = true;
    try {
      await api('/api/account-groups', {
        method: 'POST',
        body: JSON.stringify({ name, priority, sortOrder })
      });
      if (feedback) {
        showFeedback(feedback, '分组已新增。', false);
      }
      if (nameInput) {
        nameInput.value = '';
      }
      void render();
    } catch (error) {
      if (feedback) {
        showFeedback(feedback, error instanceof Error ? error.message : '新增分组失败。', true);
      }
    } finally {
      createAccountGroupButton.disabled = false;
    }
  });

  document.querySelectorAll('[data-save-group]').forEach((button) => {
    button.addEventListener('click', async () => {
      const groupId = button.dataset.saveGroup;
      if (!groupId) {
        return;
      }

      const nameInput = document.querySelector(`[data-group-name="${CSS.escape(groupId)}"]`);
      const priorityInput = document.querySelector(`[data-group-priority="${CSS.escape(groupId)}"]`);
      const sortInput = document.querySelector(`[data-group-sort="${CSS.escape(groupId)}"]`);
      button.disabled = true;
      try {
        await api(`/api/account-groups/${encodeURIComponent(groupId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: nameInput?.value ?? '',
            priority: Number(priorityInput?.value ?? 0),
            sortOrder: Number(sortInput?.value ?? 0)
          })
        });
        void render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '保存分组失败');
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-delete-group]').forEach((button) => {
    button.addEventListener('click', async () => {
      const groupId = button.dataset.deleteGroup;
      if (!groupId) {
        return;
      }
      if (!window.confirm('确定删除该分组吗？组内账号会变为未分组。')) {
        return;
      }

      button.disabled = true;
      try {
        await api(`/api/account-groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
        void render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '删除分组失败');
        button.disabled = false;
      }
    });
  });
}
