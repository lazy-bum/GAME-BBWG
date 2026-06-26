import { escapeAttribute, escapeHtml } from './html.js';

function renderFailedAccountCell(giftCode, failedAccountIds) {
  const accountIds = Array.isArray(failedAccountIds) ? failedAccountIds : [];
  if (accountIds.length === 0) {
    return '0';
  }

  return `
    <details class="failed-account-details">
      <summary>${accountIds.length}</summary>
      <div class="failed-account-list">${accountIds.map((accountId) => `<span>${escapeHtml(accountId)}</span>`).join('')}</div>
      <button
        class="secondary-button failed-account-copy"
        type="button"
        data-copy-failed-code="${escapeAttribute(giftCode)}"
        data-copy-failed-accounts="${escapeAttribute(accountIds.join(','))}"
      >复制</button>
    </details>
  `;
}

export function renderRedeemSummaryRows(summaries) {
  return (Array.isArray(summaries) ? summaries : [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.giftCode)}</td>
          <td>${item.summary?.total ?? 0}</td>
          <td>${item.summary?.successCount ?? 0}</td>
          <td>${item.summary?.receivedCount ?? 0}</td>
          <td>${item.summary?.failureCount ?? 0}</td>
          <td>${renderFailedAccountCell(item.giftCode, item.summary?.failedAccountIds)}</td>
        </tr>
      `
    )
    .join('');
}

export function renderRedeemSummaryTable(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return '';
  }

  return `
    <div class="redeem-summary">
      <div class="redeem-section-title">兑换码结果</div>
      <div class="table-wrap redeem-summary-table">
        <table>
          <thead>
            <tr>
              <th>兑换码</th>
              <th>总数</th>
              <th>成功</th>
              <th>已领取</th>
              <th>失败</th>
              <th>失败记录</th>
            </tr>
          </thead>
          <tbody>${renderRedeemSummaryRows(summaries)}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderRedeemLogLines(logs) {
  return (Array.isArray(logs) ? logs : [])
    .slice(-80)
    .map((log) => `<div class="redeem-log-line" data-level="${escapeAttribute(log.level || 'info')}">${escapeHtml(log.message)}</div>`)
    .join('');
}

export function renderRedeemLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return '';
  }

  return `
    <div class="redeem-log-panel">
      <div class="redeem-section-title">实时日志</div>
      <div class="redeem-log-list">${renderRedeemLogLines(logs)}</div>
    </div>
  `;
}
