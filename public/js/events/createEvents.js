import { showFeedback } from '../html.js';

export function bindCreateEvents({ api, render, refreshCreateUi, setImportState }) {
  const submitButton = document.querySelector('#submit-accounts');
  submitButton?.addEventListener('click', async () => {
    const textarea = document.querySelector('#account-ids');
    const feedback = document.querySelector('#create-feedback');
    if (!textarea || !feedback) {
      return;
    }

    const accountIds = textarea.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (accountIds.length === 0) {
      showFeedback(feedback, '请至少输入一个 account_id。', true);
      return;
    }

    submitButton.disabled = true;
    setImportState({
      importIsRunning: true,
      importProcessed: 0,
      importTotal: accountIds.length,
      importInserted: 0,
      importSkipped: 0,
      importFailed: 0,
      importCurrentAccountId: ''
    });
    refreshCreateUi();
    try {
      const result = await api('/api/accounts/batch', {
        method: 'POST',
        body: JSON.stringify({ accountIds })
      });
      const failedText = result.failed > 0 ? `，请求失败 ${result.failed} 个` : '';
      showFeedback(feedback, `已写入 ${result.inserted} 个，已存在跳过 ${result.skipped} 个${failedText}。`, false);
      textarea.value = '';
    } catch (error) {
      setImportState({ importIsRunning: false });
      showFeedback(feedback, error instanceof Error ? error.message : '写入失败，请稍后重试。', true);
    } finally {
      setImportState({ importIsRunning: false });
      refreshCreateUi();
      submitButton.disabled = false;
    }
  });

  document.querySelector('#refresh-accounts')?.addEventListener('click', () => void render());
}
