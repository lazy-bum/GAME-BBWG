import { ACCOUNT_STATUS } from '../constants.js';
import { parseRedeemCodeInput } from '../redeemCodes.js';
import { REDEEM_TARGET_MODE, REDEEM_TARGET_UNGROUPED, getRedeemAccountGroupKey, getRedeemTargetAccountIds } from '../redeemTargets.js';

function refreshRedeemCodeControls(value, isRunning, retryableCodeFailureCount) {
  const parsed = parseRedeemCodeInput(value);
  const startButton = document.querySelector('#start-redeem');
  const retryButton = document.querySelector('#retry-failed-redeem');

  if (startButton) {
    startButton.textContent = isRunning ? '处理中...' : parsed.codes.length > 1 ? '开始批量兑换' : '开始兑换';
  }

  if (retryButton) {
    retryButton.textContent = '重试兑换码失败记录';
    retryButton.disabled = isRunning || retryableCodeFailureCount === 0;
  }
}

function mergeCodeSummaries(currentSummaries, nextSummaries) {
  const summaryMap = new Map((Array.isArray(currentSummaries) ? currentSummaries : []).map((item) => [item.giftCode, item]));
  for (const summary of Array.isArray(nextSummaries) ? nextSummaries : []) {
    summaryMap.set(summary.giftCode, summary);
  }
  return Array.from(summaryMap.values());
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function bindRedeemEvents({
  api,
  render,
  getCurrentRoute,
  getRedeemCode,
  getRedeemIsRunning,
  persistRedeemCode,
  getRedeemAccounts,
  getRedeemTargetMode,
  getRedeemTargetAccountIds,
  getRedeemCollapsedGroupIds,
  setRedeemTargetMode,
  setRedeemTargetAccountIds,
  setRedeemCollapsedGroupIds,
  getRetryableCodeFailures,
  setRedeemState,
  setRedeemToken,
  setRedeemStatuses
}) {
  const redeemCodeInput = document.querySelector('#redeem-code');
  redeemCodeInput?.addEventListener('input', (event) => {
    persistRedeemCode(event.currentTarget.value);
    refreshRedeemCodeControls(event.currentTarget.value, getRedeemIsRunning(), getRetryableCodeFailures().length);
  });
  refreshRedeemCodeControls(redeemCodeInput?.value ?? getRedeemCode(), getRedeemIsRunning(), getRetryableCodeFailures().length);

  document.querySelector('#redeem-target-mode')?.addEventListener('change', (event) => {
    const nextMode = event.currentTarget?.value;
    if (nextMode !== REDEEM_TARGET_MODE.all && nextMode !== REDEEM_TARGET_MODE.custom) {
      return;
    }
    setRedeemTargetMode(nextMode);
    void render({ refreshData: false });
  });

  document.querySelector('#redeem-select-visible')?.addEventListener('click', () => {
    const selectedAccountIds = new Set(getRedeemTargetAccountIds());
    const visibleCheckboxes = Array.from(document.querySelectorAll('[data-select-redeem-account]'));
    const visibleAccountIds = visibleCheckboxes.map((checkbox) => checkbox.dataset.selectRedeemAccount ?? '').filter(Boolean);
    const allVisibleSelected = visibleAccountIds.length > 0 && visibleAccountIds.every((accountId) => selectedAccountIds.has(accountId));

    if (allVisibleSelected) {
      for (const accountId of visibleAccountIds) {
        selectedAccountIds.delete(accountId);
      }
    } else {
      for (const accountId of visibleAccountIds) {
        selectedAccountIds.add(accountId);
      }
    }

    setRedeemTargetAccountIds(selectedAccountIds);
    void render({ refreshData: false });
  });

  document.querySelector('#redeem-clear-selected-accounts')?.addEventListener('click', () => {
    setRedeemTargetAccountIds(new Set());
    void render({ refreshData: false });
  });

  const startRedeemButton = document.querySelector('#start-redeem');
  startRedeemButton?.addEventListener('click', async () => {
    const nextRedeemCode = redeemCodeInput?.value.trim() ?? '';
    const giftCodes = parseRedeemCodeInput(nextRedeemCode).codes;
    const targetMode = getRedeemTargetMode();
    const resolvedTargetAccountIds = getRedeemTargetAccountIdsFromState({
      accounts: getRedeemAccounts(),
      mode: targetMode,
      selectedAccountIds: getRedeemTargetAccountIds()
    });
    const requestTargetAccountIds = targetMode === REDEEM_TARGET_MODE.all ? undefined : resolvedTargetAccountIds;
    const statusTargetAccountIdSet = targetMode === REDEEM_TARGET_MODE.all ? null : new Set(resolvedTargetAccountIds);

    if (giftCodes.length === 0) {
      setRedeemState({
        redeemLogs: [{ level: 'error', message: '请输入兑换码。' }]
      });
      void render();
      return;
    }

    if (targetMode === REDEEM_TARGET_MODE.custom && resolvedTargetAccountIds.length === 0) {
      setRedeemState({
        redeemLogs: [{ level: 'error', message: '请至少选择一个用户，或者切换到全部账号。' }]
      });
      void render({ refreshData: false });
      return;
    }

    persistRedeemCode(nextRedeemCode);
    setRedeemState({
      redeemIsRunning: true,
      redeemProcessed: 0,
      redeemTotal: 0,
      redeemCodeProcessed: 0,
      redeemCodeTotal: giftCodes.length,
      redeemCurrentCode: '',
      redeemCodeSummaries: [],
      redeemLogs: []
    });
    setRedeemStatuses(
      Object.fromEntries(
        getRedeemAccounts()
          .filter(
            (account) =>
              (statusTargetAccountIdSet === null || statusTargetAccountIdSet.has(account.accountId)) &&
              (giftCodes.length > 1 || account.status === ACCOUNT_STATUS.pending)
          )
          .map((account) => [
            account.accountId,
            { code: ACCOUNT_STATUS.pending, text: giftCodes.length === 1 ? '等待处理' : '等待批量处理' }
          ])
      )
    );
    void render();

    try {
      const result =
        giftCodes.length === 1
          ? await api('/api/redeem/run', {
              method: 'POST',
              body: JSON.stringify({ giftCode: giftCodes[0], targetAccountIds: requestTargetAccountIds })
            })
          : await api('/api/redeem/run-many', {
              method: 'POST',
              body: JSON.stringify({ giftCodes, targetAccountIds: requestTargetAccountIds })
            });

      if (result.ok) {
        setRedeemState({
          redeemCodeProcessed: result.data?.processedCodes ?? giftCodes.length,
          redeemCodeTotal: giftCodes.length,
          redeemCodeSummaries: Array.isArray(result.data?.summaries) ? result.data.summaries : []
        });
      } else {
        setRedeemState((state) => ({
          redeemLogs: [
            ...state.redeemLogs,
            {
              level: result.error === '兑换已手动停止。' ? 'warn' : 'error',
              message: result.error
            }
          ]
        }));
      }
    } finally {
      setRedeemState({ redeemIsRunning: false });
      void render();
    }
  });

  document.querySelector('.redeem-panel')?.addEventListener('change', (event) => {
    const groupCheckbox = event.target?.closest?.('[data-select-redeem-group]');
    if (groupCheckbox) {
      const groupId = groupCheckbox.dataset.selectRedeemGroup ?? REDEEM_TARGET_UNGROUPED;
      const selectedAccountIds = new Set(getRedeemTargetAccountIds());
      const groupAccountIds = getRedeemAccounts()
        .filter((account) => getRedeemAccountGroupKey(account) === groupId)
        .map((account) => account.accountId);

      if (groupCheckbox.checked) {
        for (const accountId of groupAccountIds) {
          selectedAccountIds.add(accountId);
        }
      } else {
        for (const accountId of groupAccountIds) {
          selectedAccountIds.delete(accountId);
        }
      }

      setRedeemTargetAccountIds(selectedAccountIds);
      void render({ refreshData: false });
      return;
    }

    const checkbox = event.target?.closest?.('[data-select-redeem-account]');
    if (!checkbox) {
      return;
    }

    const accountId = checkbox.dataset.selectRedeemAccount;
    if (!accountId) {
      return;
    }

    const selectedAccountIds = new Set(getRedeemTargetAccountIds());
    if (checkbox.checked) {
      selectedAccountIds.add(accountId);
    } else {
      selectedAccountIds.delete(accountId);
    }
    setRedeemTargetAccountIds(selectedAccountIds);
    void render({ refreshData: false });
  });

  document.querySelector('.redeem-panel')?.addEventListener('click', (event) => {
    const toggleButton = event.target?.closest?.('[data-toggle-redeem-group]');
    if (!toggleButton) {
      return;
    }

    const groupId = toggleButton.dataset.toggleRedeemGroup;
    if (!groupId) {
      return;
    }

    const collapsedGroupIds = new Set(getRedeemCollapsedGroupIds());
    if (collapsedGroupIds.has(groupId)) {
      collapsedGroupIds.delete(groupId);
    } else {
      collapsedGroupIds.add(groupId);
    }
    setRedeemCollapsedGroupIds(collapsedGroupIds);
    void render({ refreshData: false });
  });

  const retryFailedRedeemButton = document.querySelector('#retry-failed-redeem');
  retryFailedRedeemButton?.addEventListener('click', async () => {
    const codeFailures = getRetryableCodeFailures();

    if (codeFailures.length === 0) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'warn', message: '当前没有兑换码失败记录可重试。' }]
      }));
      void render();
      return;
    }

    const failedAccountIdSet = new Set(codeFailures.flatMap((item) => item.accountIds));
    setRedeemState({
      redeemIsRunning: true,
      redeemProcessed: 0,
      redeemTotal: 0,
      redeemCodeProcessed: 0,
      redeemCodeTotal: codeFailures.length,
      redeemCurrentCode: '',
      redeemLogs: []
    });
    setRedeemStatuses((statuses) => {
      const nextStatuses = { ...statuses };
      for (const accountId of failedAccountIdSet) {
        nextStatuses[accountId] = { code: ACCOUNT_STATUS.pending, text: '等待失败记录重试' };
      }
      return nextStatuses;
    });

    void render();

    try {
      const result = await api('/api/redeem/retry-code-failures', {
        method: 'POST',
        body: JSON.stringify({ failures: codeFailures })
      });
      if (result.ok) {
        setRedeemState((state) => ({
          redeemCodeProcessed: result.data?.processedCodes ?? codeFailures.length,
          redeemCodeTotal: codeFailures.length,
          redeemCodeSummaries: mergeCodeSummaries(state.redeemCodeSummaries, result.data?.summaries)
        }));
      } else {
        setRedeemState((state) => ({
          redeemLogs: [
            ...state.redeemLogs,
            {
              level: result.error === '兑换已手动停止。' ? 'warn' : 'error',
              message: result.error
            }
          ]
        }));
      }
    } finally {
      setRedeemState({ redeemIsRunning: false });
      void render();
    }
  });

  const stopRedeemButton = document.querySelector('#stop-redeem');
  stopRedeemButton?.addEventListener('click', async () => {
    stopRedeemButton.disabled = true;

    try {
      await api('/api/redeem/stop', { method: 'POST' });
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'warn', message: '已发送停止请求，等待当前任务终止。' }]
      }));
    } catch (error) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'error', message: error instanceof Error ? error.message : '停止兑换失败。' }]
      }));
      stopRedeemButton.disabled = false;
    } finally {
      if (getCurrentRoute() === 'redeem') {
        void render();
      }
    }
  });

  document.querySelector('#force-complete-redeem')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/redeem/force-complete-all', { method: 'POST' });
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'warn', message: `已强制将 ${result.updated} 个账号设为已兑换。` }],
        redeemCodeSummaries: []
      }));
      const accounts = await api('/api/accounts');
      setRedeemState({
        redeemAccounts: accounts,
        redeemStatuses: {}
      });
    } catch (error) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'error', message: error instanceof Error ? error.message : '强制设置失败。' }]
      }));
    } finally {
      if (getCurrentRoute() === 'redeem') {
        void render();
      }
    }
  });

  const summaryPanel = document.querySelector('.redeem-summary');
  if (summaryPanel && !summaryPanel.dataset.copyBound) {
    summaryPanel.dataset.copyBound = 'true';
    summaryPanel.addEventListener('click', async (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const copyButton = event.target.closest('[data-copy-failed-accounts]');
      if (!copyButton) {
        return;
      }

      const encodedAccounts = copyButton.dataset.copyFailedAccounts ?? '';
      const giftCode = copyButton.dataset.copyFailedCode ?? '';
      const accountIds = encodedAccounts.split(',').filter(Boolean);
      if (accountIds.length === 0) {
        return;
      }

      try {
        await copyText(accountIds.join('\n'));
        setRedeemState((state) => ({
          redeemLogs: [
            ...state.redeemLogs,
            { level: 'success', message: `已复制 ${giftCode || '兑换码'} 的 ${accountIds.length} 个失败账号。` }
          ]
        }));
      } catch (error) {
        setRedeemState((state) => ({
          redeemLogs: [
            ...state.redeemLogs,
            { level: 'error', message: error instanceof Error ? error.message : '复制失败账号失败。' }
          ]
        }));
      } finally {
        if (getCurrentRoute() === 'redeem') {
          void render({ refreshData: false });
        }
      }
    });
  }

  document.querySelector('#fetch-redeem-token')?.addEventListener('click', async () => {
    try {
      const config = await api('/api/config/redeem-token/fetch', {
        method: 'POST'
      });
      setRedeemToken(config.redeemToken);
      setRedeemState((state) => ({
        redeemLogs: [
          ...state.redeemLogs,
          {
            level: 'success',
            message: `已从目标站点抓取并保存 TOKEN。来源：${config.sourceUrl || '未知'}`
          }
        ]
      }));
    } catch (error) {
      setRedeemState((state) => ({
        redeemLogs: [
          ...state.redeemLogs,
          {
            level: 'error',
            message: error instanceof Error ? error.message : 'TOKEN 获取失败。'
          }
        ]
      }));
    } finally {
      if (getCurrentRoute() === 'redeem') {
        void render();
      }
    }
  });

  document.querySelector('#save-redeem-token')?.addEventListener('click', async () => {
    const redeemTokenInput = document.querySelector('#redeem-token');
    const nextRedeemToken = redeemTokenInput?.value.trim() ?? '';
    try {
      const config = await api('/api/config/redeem-token', {
        method: 'POST',
        body: JSON.stringify({ token: nextRedeemToken })
      });
      setRedeemToken(config.redeemToken);
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'success', message: '兑换 TOKEN 已保存。' }]
      }));
    } catch (error) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'error', message: error instanceof Error ? error.message : 'TOKEN 保存失败。' }]
      }));
    } finally {
      if (getCurrentRoute() === 'redeem') {
        void render();
      }
    }
  });
}

function getRedeemTargetAccountIdsFromState({ accounts, mode, selectedAccountIds }) {
  return getRedeemTargetAccountIds(accounts, mode, selectedAccountIds);
}
