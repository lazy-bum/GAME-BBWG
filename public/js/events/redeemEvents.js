import { ACCOUNT_STATUS } from '../constants.js';

export function bindRedeemEvents({
  api,
  render,
  getCurrentRoute,
  getRedeemCode,
  persistRedeemCode,
  getRedeemAccounts,
  getRetryableAccountIds,
  setRedeemState,
  setRedeemToken,
  setRedeemStatuses
}) {
  const redeemCodeInput = document.querySelector('#redeem-code');
  redeemCodeInput?.addEventListener('input', (event) => {
    persistRedeemCode(event.currentTarget.value);
  });

  const startRedeemButton = document.querySelector('#start-redeem');
  startRedeemButton?.addEventListener('click', async () => {
    const nextRedeemCode = redeemCodeInput?.value.trim() ?? '';

    if (!nextRedeemCode) {
      setRedeemState({
        redeemLogs: [{ level: 'error', message: '请输入兑换码。' }],
        redeemSummary: null
      });
      void render();
      return;
    }

    persistRedeemCode(nextRedeemCode);
    setRedeemState({
      redeemIsRunning: true,
      redeemProcessed: 0,
      redeemTotal: 0,
      redeemSummary: null,
      redeemLogs: [{ level: 'info', message: `准备开始兑换，兑换码: ${getRedeemCode()}` }]
    });
    setRedeemStatuses(
      Object.fromEntries(
        getRedeemAccounts()
          .filter((account) => account.status === ACCOUNT_STATUS.pending)
          .map((account) => [account.accountId, { code: ACCOUNT_STATUS.pending, text: '等待处理' }])
      )
    );
    void render();

    try {
      const result = await api('/api/redeem/run', {
        method: 'POST',
        body: JSON.stringify({ giftCode: getRedeemCode() })
      });

      if (result.ok) {
        setRedeemState({ redeemSummary: result.data });
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

  const retryFailedRedeemButton = document.querySelector('#retry-failed-redeem');
  retryFailedRedeemButton?.addEventListener('click', async () => {
    const failedAccountIds = getRetryableAccountIds();

    if (failedAccountIds.length === 0) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'warn', message: '当前没有失败账号可重新兑换。' }]
      }));
      void render();
      return;
    }

    const nextRedeemCode = redeemCodeInput?.value.trim() ?? getRedeemCode();
    if (!nextRedeemCode) {
      setRedeemState((state) => ({
        redeemLogs: [...state.redeemLogs, { level: 'error', message: '重新兑换前请先输入兑换码。' }]
      }));
      void render();
      return;
    }

    persistRedeemCode(nextRedeemCode);
    setRedeemState({
      redeemIsRunning: true,
      redeemProcessed: 0,
      redeemTotal: 0,
      redeemSummary: null
    });
    setRedeemStatuses((statuses) => {
      const nextStatuses = { ...statuses };
      for (const accountId of failedAccountIds) {
        nextStatuses[accountId] = { code: ACCOUNT_STATUS.pending, text: '等待重试' };
      }
      return nextStatuses;
    });

    void render();

    try {
      const result = await api('/api/redeem/retry-failed', {
        method: 'POST',
        body: JSON.stringify({ giftCode: getRedeemCode(), accountIds: failedAccountIds })
      });
      if (result.ok) {
        setRedeemState({ redeemSummary: result.data });
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
        redeemSummary: null
      }));
      const accounts = await api('/api/accounts');
      setRedeemState({
        redeemAccounts: accounts,
        redeemStatuses: {},
        redeemSummary: null
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
