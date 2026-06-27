import { escapeAttribute, escapeHtml, formatDateTime } from '../html.js';

function renderValidityText(item) {
  if (item.validityType === 'timed') {
    return `${formatDateTime(item.validFrom)} 至 ${formatDateTime(item.validUntil)}`;
  }
  return '永久生效';
}

function renderStatusBadge(item) {
  if (item.isCurrentlyValid) {
    return '<span class="redeem-code-status-badge is-valid">生效中</span>';
  }
  return `<span class="redeem-code-status-badge is-invalid">${escapeHtml(item.invalidReason || '已失效')}</span>`;
}

function renderFailedAccountModal(state) {
  const selectedCode = state.redeemCodeFailedAccountsModal?.code ?? '';
  const failedAccounts = Array.isArray(state.redeemCodeFailedAccountsModal?.failedAccounts)
    ? state.redeemCodeFailedAccountsModal.failedAccounts
    : [];
  const content =
    failedAccounts.length === 0
      ? '<div class="empty-state redeem-code-failed-empty">当前没有未兑换账号。</div>'
      : `
        <div class="table-wrap redeem-code-failed-wrap">
          <table>
            <thead>
              <tr>
                <th>账号ID</th>
                <th>昵称</th>
                <th>分组</th>
                <th>等级</th>
              </tr>
            </thead>
            <tbody>
              ${failedAccounts
                .map(
                  (account) => `
                    <tr>
                      <td data-label="账号ID">${escapeHtml(account.accountId)}</td>
                      <td data-label="昵称">${escapeHtml(account.name || account.accountId)}</td>
                      <td data-label="分组">${escapeHtml(account.groupName || '未分组')}</td>
                      <td data-label="等级">${account.level ? `Lv.${account.level}` : '-'}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

  return `
    <div class="visitor-modal-backdrop" id="redeem-code-failed-modal" ${selectedCode ? '' : 'hidden'}>
      <div class="visitor-modal redeem-code-failed-modal" role="dialog" aria-modal="true" aria-labelledby="redeem-code-failed-title">
        <div class="visitor-modal-head">
          <h3 id="redeem-code-failed-title">未兑换账号：${escapeHtml(selectedCode)}</h3>
        </div>
        <div class="visitor-modal-body">
          ${content}
        </div>
        <div class="visitor-modal-actions">
          <button class="secondary-button" id="close-redeem-code-failed-modal">关闭</button>
        </div>
      </div>
    </div>
  `;
}

export function renderRedeemCodeManagementPage(shell, state) {
  const rows =
    state.redeemCodeItems.length === 0
      ? '<div class="empty-state">当前还没有兑换码。</div>'
      : `
        <div class="table-wrap redeem-code-table-wrap">
          <table>
            <thead>
              <tr>
                <th>兑换码</th>
                <th>状态</th>
                <th>有效期</th>
                <th>限制等级</th>
                <th>备注</th>
                <th>来源</th>
                <th>入库时间</th>
                <th>未兑换账号</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${state.redeemCodeItems
                .map(
                  (item) => `
                    <tr>
                      <td data-label="兑换码">
                        <div class="redeem-code-main-cell">
                          <strong>${escapeHtml(item.code)}</strong>
                          ${item.title ? `<span>${escapeHtml(item.title)}</span>` : ''}
                        </div>
                      </td>
                      <td data-label="状态">${renderStatusBadge(item)}</td>
                      <td data-label="有效期">${escapeHtml(renderValidityText(item))}</td>
                      <td data-label="限制等级">${item.minLevel ? `Lv.${item.minLevel}` : '不限'}</td>
                      <td data-label="备注">${escapeHtml(item.note || '-')}</td>
                      <td data-label="来源">${escapeHtml(item.sourceId || 'manual')}</td>
                      <td data-label="入库时间">${escapeHtml(formatDateTime(item.createdAt))}</td>
                      <td data-label="未兑换账号">
                        <button
                          class="secondary-button"
                          data-view-failed-accounts="${escapeAttribute(item.code)}"
                          ${item.failedAccountIds.length === 0 ? 'disabled' : ''}
                        >
                          查看 (${item.failedAccountIds.length})
                        </button>
                      </td>
                      <td class="table-actions" data-label="操作">
                        <button class="danger-button" data-delete-redeem-code="${escapeAttribute(item.code)}">删除</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

  return shell(`
    <section class="page-head">
      <div>
        <p class="lead">支持单个或批量录入兑换码，并设置永久生效、限时有效和最低等级限制。</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" id="refresh-redeem-codes">刷新</button>
        <button class="secondary-button" id="sync-redeem-codes" ${state.isAdmin ? '' : 'disabled'}>同步抓取兑换码</button>
      </div>
    </section>
    <section class="panel form-panel redeem-code-manage-panel">
      <div class="redeem-code-manage-grid">
        <div class="redeem-code-manage-card">
          <h3>单个添加</h3>
          <input id="new-redeem-code" class="search-input" type="text" placeholder="输入兑换码" />
          <select id="single-redeem-validity-type" class="search-input">
            <option value="permanent">永久生效</option>
            <option value="timed">限时生效</option>
          </select>
          <div class="redeem-code-time-grid">
            <input id="single-redeem-valid-from" class="search-input" type="datetime-local" />
            <input id="single-redeem-valid-until" class="search-input" type="datetime-local" />
          </div>
          <input id="single-redeem-min-level" class="search-input group-number-input" type="number" min="0" placeholder="最低等级，可留空" />
          <input id="single-redeem-note" class="search-input" type="text" placeholder="备注，可留空" />
          <button class="primary-button toolbar-button" id="create-single-redeem-code">添加兑换码</button>
        </div>
        <div class="redeem-code-manage-card">
          <h3>批量添加</h3>
          <textarea id="batch-redeem-codes" class="search-input redeem-code-batch-textarea" placeholder="每行一个兑换码，也支持逗号、空格分隔"></textarea>
          <select id="batch-redeem-validity-type" class="search-input">
            <option value="permanent">永久生效</option>
            <option value="timed">限时生效</option>
          </select>
          <div class="redeem-code-time-grid">
            <input id="batch-redeem-valid-from" class="search-input" type="datetime-local" />
            <input id="batch-redeem-valid-until" class="search-input" type="datetime-local" />
          </div>
          <input id="batch-redeem-min-level" class="search-input group-number-input" type="number" min="0" placeholder="最低等级，可留空" />
          <input id="batch-redeem-note" class="search-input" type="text" placeholder="备注，可留空" />
          <button class="primary-button toolbar-button" id="create-batch-redeem-codes">批量添加</button>
        </div>
      </div>
      <div id="redeem-code-feedback" class="feedback" hidden></div>
    </section>
    <section class="panel table-panel">
      ${rows}
    </section>
    ${renderFailedAccountModal(state)}
  `);
}
