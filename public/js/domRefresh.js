import { parseRedeemCodeInput } from './redeemCodes.js';
import { renderRedeemLogLines, renderRedeemSummaryRows } from './redeemRenderers.js';

let lastRedeemLogsVersion = -1;
let lastRedeemCodeSummariesVersion = -1;

export function refreshRedeemDom(state) {
  const progressPercent = state.redeemTotal > 0 ? Math.round((state.redeemProcessed / state.redeemTotal) * 100) : 0;
  const progressBar = document.querySelector('.redeem-progress-bar span');
  const accountProgressText = document.querySelector('.redeem-account-progress-text');
  const codeProgressText = document.querySelector('.redeem-code-progress-text');
  const summaryBody = document.querySelector('.redeem-summary-table tbody');
  const logList = document.querySelector('.redeem-log-list');
  const startRedeemButton = document.querySelector('#start-redeem');
  const stopRedeemButton = document.querySelector('#stop-redeem');
  const retryFailedRedeemButton = document.querySelector('#retry-failed-redeem');
  const forceCompleteRedeemButton = document.querySelector('#force-complete-redeem');
  const fetchRedeemTokenButton = document.querySelector('#fetch-redeem-token');
  const saveRedeemTokenButton = document.querySelector('#save-redeem-token');
  const redeemTargetModeSelect = document.querySelector('#redeem-target-mode');
  const redeemSelectVisibleButton = document.querySelector('#redeem-select-visible');
  const redeemClearSelectedAccountsButton = document.querySelector('#redeem-clear-selected-accounts');
  const redeemTargetSummary = document.querySelector('.redeem-target-summary');
  const redeemCodeInput = document.querySelector('#redeem-code');
  const redeemTokenInput = document.querySelector('#redeem-token');
  const parsedRedeemCodes = parseRedeemCodeInput(state.redeemCode);
  const targetAccountIdSet = new Set(state.redeemTargetAccountIds || []);

  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }
  if (accountProgressText) {
    accountProgressText.textContent = `账号进度 ${state.redeemProcessed} / ${state.redeemTotal}`;
  }
  if (codeProgressText) {
    codeProgressText.textContent =
      state.redeemCodeTotal > 1
        ? `兑换码 ${state.redeemCodeProcessed} / ${state.redeemCodeTotal}${
            state.redeemCurrentCode ? `，当前码：${state.redeemCurrentCode}` : ''
          }`
        : '';
  }
  if (
    summaryBody &&
    Array.isArray(state.redeemCodeSummaries) &&
    (state.redeemCodeSummariesVersion !== lastRedeemCodeSummariesVersion || summaryBody.childElementCount === 0)
  ) {
    summaryBody.innerHTML = renderRedeemSummaryRows(state.redeemCodeSummaries);
    lastRedeemCodeSummariesVersion = state.redeemCodeSummariesVersion;
  }
  if (
    logList &&
    Array.isArray(state.redeemLogs) &&
    (state.redeemLogsVersion !== lastRedeemLogsVersion || logList.childElementCount === 0)
  ) {
    logList.innerHTML = renderRedeemLogLines(state.redeemLogs);
    logList.scrollTop = logList.scrollHeight;
    lastRedeemLogsVersion = state.redeemLogsVersion;
  }
  if (startRedeemButton) {
    startRedeemButton.disabled = state.redeemIsRunning;
    startRedeemButton.textContent = state.redeemIsRunning
      ? '处理中...'
      : parsedRedeemCodes.codes.length > 1
        ? '开始批量兑换'
        : '开始兑换';
  }
  if (stopRedeemButton) {
    stopRedeemButton.disabled = !state.redeemIsRunning;
  }
  if (retryFailedRedeemButton) {
    const retryableCodeFailureCount = Array.isArray(state.retryableCodeFailures) ? state.retryableCodeFailures.length : 0;
    retryFailedRedeemButton.disabled = state.redeemIsRunning || retryableCodeFailureCount === 0;
    retryFailedRedeemButton.textContent = '重试兑换码失败记录';
  }
  if (forceCompleteRedeemButton) {
    forceCompleteRedeemButton.disabled = state.redeemIsRunning;
  }
  if (fetchRedeemTokenButton) {
    fetchRedeemTokenButton.disabled = state.redeemIsRunning;
  }
  if (saveRedeemTokenButton) {
    saveRedeemTokenButton.disabled = state.redeemIsRunning;
  }
  if (redeemTargetModeSelect) {
    redeemTargetModeSelect.disabled = state.redeemIsRunning;
    if (redeemTargetModeSelect.value !== state.redeemTargetMode) {
      redeemTargetModeSelect.value = state.redeemTargetMode;
    }
  }
  if (redeemSelectVisibleButton) {
    redeemSelectVisibleButton.disabled = state.redeemIsRunning || state.redeemAccounts.length === 0;
  }
  if (redeemClearSelectedAccountsButton) {
    redeemClearSelectedAccountsButton.disabled = state.redeemIsRunning || targetAccountIdSet.size === 0;
  }
  if (redeemTargetSummary) {
    const selectedCount = state.redeemAccounts.filter((account) => targetAccountIdSet.has(account.accountId)).length;
    redeemTargetSummary.textContent =
      state.redeemTargetMode === 'custom' ? `当前将兑换选中的 ${selectedCount} 个账号` : `当前将兑换全部 ${state.redeemAccounts.length} 个账号`;
  }
  if (redeemCodeInput) {
    redeemCodeInput.disabled = state.redeemIsRunning;
    if (redeemCodeInput.value !== state.redeemCode) {
      redeemCodeInput.value = state.redeemCode;
    }
  }
  if (redeemTokenInput) {
    redeemTokenInput.disabled = state.redeemIsRunning;
  }

  state.redeemAccounts.forEach((account) => {
    const statusView = state.getRedeemStatusView(account);
    const badge = document.querySelector(`[data-redeem-status="${CSS.escape(account.accountId)}"]`);
    if (!badge) {
      return;
    }

    badge.className = `status-badge status-${statusView.code}`;
    badge.textContent = statusView.text;
  });

  document.querySelectorAll('[data-select-redeem-account]').forEach((checkbox) => {
    const accountId = checkbox.dataset.selectRedeemAccount ?? '';
    checkbox.checked = targetAccountIdSet.has(accountId);
    checkbox.disabled = state.redeemIsRunning;
  });

  document.querySelectorAll('[data-select-redeem-group]').forEach((checkbox) => {
    const groupId = checkbox.dataset.selectRedeemGroup ?? '';
    const groupAccountIds = state.redeemAccounts
      .filter((account) => (account.groupId || '__ungrouped__') === groupId)
      .map((account) => account.accountId);
    const selectedCount = groupAccountIds.filter((accountId) => targetAccountIdSet.has(accountId)).length;
    checkbox.checked = groupAccountIds.length > 0 && selectedCount === groupAccountIds.length;
    checkbox.indeterminate = selectedCount > 0 && selectedCount < groupAccountIds.length;
    checkbox.disabled = state.redeemIsRunning;
  });

  const collapsedGroupIdSet = new Set(state.redeemCollapsedGroupIds || []);
  document.querySelectorAll('[data-toggle-redeem-group]').forEach((button) => {
    const groupId = button.dataset.toggleRedeemGroup ?? '';
    const isCollapsed = collapsedGroupIdSet.has(groupId);
    button.textContent = isCollapsed ? '展开' : '折叠';
    button.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    button.disabled = state.redeemIsRunning;
    const card = button.closest('.redeem-target-group-card');
    const grid = card?.querySelector('.redeem-target-account-grid');
    if (card) {
      card.classList.toggle('is-collapsed', isCollapsed);
    }
    if (grid) {
      grid.hidden = isCollapsed;
    }
  });
}

export function refreshCreateDom(state) {
  const submitButton = document.querySelector('#submit-accounts');
  const textarea = document.querySelector('#account-ids');
  const progressBar = document.querySelector('.create-progress .redeem-progress-bar span');
  const progressTexts = document.querySelectorAll('.create-progress .redeem-progress-text');
  const progressPercent = state.importTotal > 0 ? Math.round((state.importProcessed / state.importTotal) * 100) : 0;

  if (submitButton) {
    submitButton.disabled = state.importIsRunning;
    submitButton.textContent = state.importIsRunning ? '录入中...' : '提交';
  }

  if (textarea) {
    textarea.disabled = state.importIsRunning;
  }

  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }

  if (progressTexts[0]) {
    progressTexts[0].textContent = `录入进度 ${state.importProcessed} / ${state.importTotal}，成功 ${state.importInserted}，跳过 ${state.importSkipped}，失败 ${state.importFailed}`;
  }

  if (progressTexts[1]) {
    progressTexts[1].textContent = state.importCurrentAccountId ? `当前处理：${state.importCurrentAccountId}` : '';
  }
}
