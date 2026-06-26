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
  const redeemCodeInput = document.querySelector('#redeem-code');
  const redeemTokenInput = document.querySelector('#redeem-token');
  const parsedRedeemCodes = parseRedeemCodeInput(state.redeemCode);

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
