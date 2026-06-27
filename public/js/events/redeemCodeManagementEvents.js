import { showFeedback } from '../html.js';
import { parseRedeemCodeInput } from '../redeemCodes.js';

function parseDateTimeInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  const timestamp = new Date(trimmed).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getInputValue(selector) {
  const element = document.querySelector(selector);
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
    ? element.value
    : '';
}

function readCommonFormValues(prefix) {
  const validityType = getInputValue(`#${prefix}-redeem-validity-type`) || 'permanent';
  return {
    validityType,
    validFrom: parseDateTimeInput(getInputValue(`#${prefix}-redeem-valid-from`)),
    validUntil: parseDateTimeInput(getInputValue(`#${prefix}-redeem-valid-until`)),
    minLevel: Number(getInputValue(`#${prefix}-redeem-min-level`) || 0) || undefined,
    note: getInputValue(`#${prefix}-redeem-note`)
  };
}

function clearSingleInputs() {
  const codeInput = document.querySelector('#new-redeem-code');
  const noteInput = document.querySelector('#single-redeem-note');
  const minLevelInput = document.querySelector('#single-redeem-min-level');
  if (codeInput) {
    codeInput.value = '';
  }
  if (noteInput) {
    noteInput.value = '';
  }
  if (minLevelInput) {
    minLevelInput.value = '';
  }
}

function clearBatchInputs() {
  const codeInput = document.querySelector('#batch-redeem-codes');
  const noteInput = document.querySelector('#batch-redeem-note');
  const minLevelInput = document.querySelector('#batch-redeem-min-level');
  if (codeInput) {
    codeInput.value = '';
  }
  if (noteInput) {
    noteInput.value = '';
  }
  if (minLevelInput) {
    minLevelInput.value = '';
  }
}

export function bindRedeemCodeManagementEvents({ api, render, renderLocal, getRedeemCodeItems, setRedeemCodeFailedAccountsModal }) {
  const feedback = document.querySelector('#redeem-code-feedback');

  document.querySelector('#refresh-redeem-codes')?.addEventListener('click', () => void render());

  document.querySelector('#sync-redeem-codes')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    try {
      const result = await api('/api/redeem-codes/sync', { method: 'POST' });
      if (feedback) {
        showFeedback(feedback, `同步完成，新增 ${result.insertedCodes?.length ?? 0} 个兑换码。`, false);
      }
      void render();
    } catch (error) {
      if (feedback) {
        showFeedback(feedback, error instanceof Error ? error.message : '同步兑换码失败。', true);
      }
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#create-single-redeem-code')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const code = getInputValue('#new-redeem-code');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    try {
      await api('/api/redeem-codes', {
        method: 'POST',
        body: JSON.stringify({
          code,
          ...readCommonFormValues('single')
        })
      });
      clearSingleInputs();
      if (feedback) {
        showFeedback(feedback, '兑换码已添加。', false);
      }
      void render();
    } catch (error) {
      if (feedback) {
        showFeedback(feedback, error instanceof Error ? error.message : '添加兑换码失败。', true);
      }
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#create-batch-redeem-codes')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const batchValue = getInputValue('#batch-redeem-codes');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    try {
      const parsed = parseRedeemCodeInput(batchValue);
      await api('/api/redeem-codes/batch', {
        method: 'POST',
        body: JSON.stringify({
          codes: parsed.codes,
          ...readCommonFormValues('batch')
        })
      });
      clearBatchInputs();
      if (feedback) {
        showFeedback(feedback, `已批量添加 ${parsed.codes.length} 个兑换码。`, false);
      }
      void render();
    } catch (error) {
      if (feedback) {
        showFeedback(feedback, error instanceof Error ? error.message : '批量添加兑换码失败。', true);
      }
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll('[data-delete-redeem-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const code = button.dataset.deleteRedeemCode;
      if (!code) {
        return;
      }
      if (!window.confirm(`确定删除兑换码 ${code} 吗？`)) {
        return;
      }

      button.disabled = true;
      try {
        await api(`/api/redeem-codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
        if (feedback) {
          showFeedback(feedback, `兑换码 ${code} 已删除。`, false);
        }
        void render();
      } catch (error) {
        if (feedback) {
          showFeedback(feedback, error instanceof Error ? error.message : '删除兑换码失败。', true);
        }
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-view-failed-accounts]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const code = button.dataset.viewFailedAccounts;
      if (!code) {
        return;
      }

      const matchedItem = getRedeemCodeItems().find((item) => item.code === code);
      if (!matchedItem) {
        return;
      }

      setRedeemCodeFailedAccountsModal({
        code: matchedItem.code,
        failedAccounts: Array.isArray(matchedItem.failedAccounts) ? matchedItem.failedAccounts : []
      });
      void renderLocal();
    });
  });

  const failedModal = document.querySelector('#redeem-code-failed-modal');
  failedModal?.addEventListener('click', (event) => {
    if (event.target !== failedModal) {
      return;
    }
    setRedeemCodeFailedAccountsModal(null);
    void renderLocal();
  });

  document.querySelector('#close-redeem-code-failed-modal')?.addEventListener('click', () => {
    setRedeemCodeFailedAccountsModal(null);
    void renderLocal();
  });
}
