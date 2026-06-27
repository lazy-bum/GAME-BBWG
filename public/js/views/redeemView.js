import { renderRedeemAccountRow } from '../accountViews.js';
import { escapeAttribute, escapeHtml } from '../html.js';
import { parseRedeemCodeInput } from '../redeemCodes.js';
import { renderRedeemLogs, renderRedeemSummaryTable } from '../redeemRenderers.js';
import { REDEEM_TARGET_MODE, groupRedeemAccounts } from '../redeemTargets.js';

export function renderRedeemPage(shell, state) {
  const progressPercent = state.redeemTotal > 0 ? Math.round((state.redeemProcessed / state.redeemTotal) * 100) : 0;
  const parsedRedeemCodes = parseRedeemCodeInput(state.redeemCode);
  const startRedeemText = state.redeemIsRunning ? '处理中...' : parsedRedeemCodes.codes.length > 1 ? '开始批量兑换' : '开始兑换';
  const retryableCodeFailureCount = Array.isArray(state.retryableCodeFailures) ? state.retryableCodeFailures.length : 0;
  const retryDisabled = state.redeemIsRunning || retryableCodeFailureCount === 0;
  const targetAccountIdSet = new Set(state.redeemTargetAccountIds);
  const collapsedGroupIdSet = new Set(state.redeemCollapsedGroupIds);
  const targetMode = state.redeemTargetMode || REDEEM_TARGET_MODE.all;
  const targetedAccounts = targetMode === REDEEM_TARGET_MODE.all ? state.redeemAccounts : state.redeemAccounts.filter((account) => targetAccountIdSet.has(account.accountId));
  const groupedAccounts = groupRedeemAccounts(state.redeemAccounts, state.accountGroups);
  const targetSummaryText =
    targetMode === REDEEM_TARGET_MODE.custom ? `当前将兑换选中的 ${targetedAccounts.length} 个账号` : `当前将兑换全部 ${state.redeemAccounts.length} 个账号`;
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
      <div class="redeem-target-panel">
        <div class="redeem-target-toolbar">
          <label class="batch-check-label">
            <span>兑换范围</span>
            <select id="redeem-target-mode" class="search-input batch-group-select" ${state.redeemIsRunning ? 'disabled' : ''}>
              <option value="${REDEEM_TARGET_MODE.all}" ${targetMode === REDEEM_TARGET_MODE.all ? 'selected' : ''}>全部账号</option>
              <option value="${REDEEM_TARGET_MODE.custom}" ${targetMode === REDEEM_TARGET_MODE.custom ? 'selected' : ''}>按分组/用户自定义</option>
            </select>
          </label>
          ${
            targetMode === REDEEM_TARGET_MODE.custom
              ? `
                <button class="secondary-button toolbar-button" id="redeem-select-visible" ${state.redeemIsRunning || state.redeemAccounts.length === 0 ? 'disabled' : ''}>
                  ${state.redeemVisibleAccountIds.every((accountId) => targetAccountIdSet.has(accountId)) && state.redeemVisibleAccountIds.length > 0 ? '取消当前显示' : '选择当前显示'}
                </button>
                <button class="secondary-button toolbar-button" id="redeem-clear-selected-accounts" ${state.redeemIsRunning || targetAccountIdSet.size === 0 ? 'disabled' : ''}>清空已选</button>
              `
              : ''
          }
        </div>
        <div class="redeem-target-summary">${escapeHtml(targetSummaryText)}</div>
        ${
          targetMode === REDEEM_TARGET_MODE.custom
            ? `
              <div class="redeem-target-groups">
                ${groupedAccounts
                  .map((group) => {
                    const groupAccountIds = group.accounts.map((account) => account.accountId);
                    const selectedCount = groupAccountIds.filter((accountId) => targetAccountIdSet.has(accountId)).length;
                    const allSelected = groupAccountIds.length > 0 && selectedCount === groupAccountIds.length;
                    const partiallySelected = selectedCount > 0 && selectedCount < groupAccountIds.length;
                    const isCollapsed = collapsedGroupIdSet.has(group.groupId);

                    return `
                      <section class="redeem-target-group-card ${isCollapsed ? 'is-collapsed' : ''}">
                        <div class="redeem-target-group-head">
                          <label class="batch-check-label redeem-target-group-select">
                            <input
                              type="checkbox"
                              data-select-redeem-group="${escapeAttribute(group.groupId)}"
                              ${allSelected ? 'checked' : ''}
                              ${partiallySelected ? 'data-indeterminate="true"' : ''}
                              ${state.redeemIsRunning ? 'disabled' : ''}
                            />
                            <span class="redeem-target-group-name">${escapeHtml(group.groupName)}</span>
                            <strong>${selectedCount}/${group.accounts.length}</strong>
                          </label>
                          <button
                            type="button"
                            class="secondary-button redeem-target-group-toggle"
                            data-toggle-redeem-group="${escapeAttribute(group.groupId)}"
                            aria-expanded="${isCollapsed ? 'false' : 'true'}"
                            ${state.redeemIsRunning ? 'disabled' : ''}
                          >
                            ${isCollapsed ? '展开' : '折叠'}
                          </button>
                        </div>
                        <div class="redeem-target-account-grid" ${isCollapsed ? 'hidden' : ''}>
                          ${group.accounts
                            .map((account) => {
                              const gameName = account.name?.trim() || account.accountId;
                              return `
                                <label class="redeem-target-account-chip ${targetAccountIdSet.has(account.accountId) ? 'is-selected' : ''}">
                                  <input
                                    type="checkbox"
                                    data-select-redeem-account="${escapeAttribute(account.accountId)}"
                                    ${targetAccountIdSet.has(account.accountId) ? 'checked' : ''}
                                    ${state.redeemIsRunning ? 'disabled' : ''}
                                  />
                                  <span>${escapeHtml(gameName)}</span>
                                  <code>${escapeHtml(account.accountId)}</code>
                                </label>
                              `;
                            })
                            .join('')}
                        </div>
                      </section>
                    `;
                  })
                  .join('')}
              </div>
            `
            : ''
        }
      </div>
    `
    : '<div class="feedback" data-state="success">当前为普通用户，只可查看兑换状态。</div>';
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
              <th>审计</th>
              <th>兑换状态</th>
            </tr>
          </thead>
          <tbody>${state.redeemAccounts
            .map((account) =>
              renderRedeemAccountRow(account, state.getRedeemStatusView(account), {
                targetMatched: targetMode === REDEEM_TARGET_MODE.all || targetAccountIdSet.has(account.accountId)
              })
            )
            .join('')}</tbody>
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
