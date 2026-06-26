import { renderRedeemAccountRow } from '../accountViews.js';
import { escapeAttribute, escapeHtml } from '../html.js';
import { parseRedeemCodeInput } from '../redeemCodes.js';
import { renderRedeemLogs, renderRedeemSummaryTable } from '../redeemRenderers.js';

export function renderRedeemPage(shell, state) {
  const progressPercent = state.redeemTotal > 0 ? Math.round((state.redeemProcessed / state.redeemTotal) * 100) : 0;
  const parsedRedeemCodes = parseRedeemCodeInput(state.redeemCode);
  const startRedeemText = state.redeemIsRunning ? '处理中...' : parsedRedeemCodes.codes.length > 1 ? '开始批量兑换' : '开始兑换';
  const retryableCodeFailureCount = Array.isArray(state.retryableCodeFailures) ? state.retryableCodeFailures.length : 0;
  const retryDisabled = state.redeemIsRunning || retryableCodeFailureCount === 0;
  const codeProgress =
    state.redeemCodeTotal > 1
      ? `<div class="redeem-progress-text redeem-code-progress-text">兑换码 ${state.redeemCodeProcessed} / ${state.redeemCodeTotal}${state.redeemCurrentCode ? `，当前码：${escapeHtml(state.redeemCurrentCode)}` : ''}</div>`
      : '';
  const redeemToolbar = state.isAdmin
    ? `
      <div class="redeem-toolbar">
        <input id="redeem-token" class="search-input redeem-input" type="text" placeholder="输入兑换 TOKEN" value="${escapeAttribute(state.redeemToken)}" ${state.redeemIsRunning ? 'disabled' : ''} />
        <button class="secondary-button toolbar-button" id="fetch-redeem-token" ${state.redeemIsRunning ? 'disabled' : ''}>获取TOKEN</button>
        <button class="secondary-button toolbar-button" id="save-redeem-token" ${state.redeemIsRunning ? 'disabled' : ''}>保存TOKEN</button>
      </div>
      <div class="redeem-toolbar redeem-code-toolbar">
        <div class="redeem-code-field">
          <textarea id="redeem-code" class="search-input redeem-input redeem-code-textarea" placeholder="输入兑换码，多个可换行或用逗号分隔" ${state.redeemIsRunning ? 'disabled' : ''}>${escapeAttribute(state.redeemCode)}</textarea>
        </div>
        <button class="primary-button toolbar-button" id="start-redeem" ${state.redeemIsRunning ? 'disabled' : ''}>${startRedeemText}</button>
        <button class="danger-button toolbar-button" id="stop-redeem" ${state.redeemIsRunning ? '' : 'disabled'}>停止兑换</button>
        <button class="secondary-button toolbar-button" id="retry-failed-redeem" ${retryDisabled ? 'disabled' : ''}>重试兑换码失败记录</button>
        <button class="secondary-button toolbar-button" id="force-complete-redeem" ${state.redeemIsRunning ? 'disabled' : ''}>强制全部设为已兑换</button>
      </div>
    `
    : '<div class="feedback" data-state="success">当前为临时账号，只可查看兑换状态。</div>';
  const rows =
    state.redeemAccounts.length === 0
      ? '<div class="empty-state">当前没有可兑换账号。</div>'
      : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>头像</th>
              <th>名字</th>
              <th>分组</th>
              <th>兑换状态</th>
            </tr>
          </thead>
          <tbody>${state.redeemAccounts.map((account) => renderRedeemAccountRow(account, state.getRedeemStatusView(account))).join('')}</tbody>
        </table>
      </div>
    `;

  return shell(`
    <section class="panel redeem-panel">
      ${redeemToolbar}
      <div class="redeem-progress">
        <div class="redeem-progress-bar"><span style="width: ${progressPercent}%"></span></div>
        ${codeProgress}
        <div class="redeem-progress-text redeem-account-progress-text">账号进度 ${state.redeemProcessed} / ${state.redeemTotal}</div>
      </div>
      ${renderRedeemSummaryTable(state.redeemCodeSummaries)}
      ${renderRedeemLogs(state.redeemLogs)}
      ${rows}
    </section>
  `);
}
