import { renderAccountGroupTabs } from '../accountGroupViews.js';
import { renderAccountRow } from '../accountViews.js';
import { escapeAttribute, escapeHtml } from '../html.js';

export function renderListPage(shell, state) {
  const groupOptions = [
    '<option value="">未分组</option>',
    ...state.accountGroups.map((group) => `<option value="${escapeAttribute(group.groupId)}">${escapeHtml(group.name)}</option>`)
  ].join('');
  const batchGroupToolbar = state.isAdmin
    ? `
      <div class="batch-toolbar">
        <label class="batch-check-label">
          <input id="select-visible-accounts" type="checkbox" ${state.allVisibleSelected ? 'checked' : ''} />
          <span>选择当前显示</span>
        </label>
        <select id="batch-account-group" class="search-input batch-group-select">
          ${groupOptions}
        </select>
        <button class="secondary-button toolbar-button" id="apply-account-group" ${state.selectedAccountIds.size === 0 ? 'disabled' : ''}>批量分组 (${state.selectedAccountIds.size})</button>
      </div>
    `
    : '';

  return shell(`
    <section class="page-head list-page-head">
      <div class="page-head-main">
        <div class="list-summary">
          <span class="list-summary-label">总用户人数</span>
          <strong class="list-summary-value">${state.accounts.length}</strong>
          ${
            state.filteredAccounts.length !== state.accounts.length
              ? `<span class="list-summary-meta">当前显示 ${state.filteredAccounts.length} 人</span>`
              : ''
          }
        </div>
        <div class="list-toolbar">
          <input id="search-account-id" class="search-input" type="text" placeholder="搜索账号ID" value="${escapeAttribute(state.accountIdFilter)}" />
          <input id="search-game-name" class="search-input" type="text" placeholder="搜索游戏名" value="${escapeAttribute(state.gameNameFilter)}" />
          <button class="secondary-button toolbar-button" id="apply-search">搜索</button>
          <button class="secondary-button toolbar-button" id="clear-search">清空搜索条件</button>
        </div>
      </div>
      <div class="page-actions list-page-actions">
        <button class="secondary-button" id="refresh-accounts">刷新</button>
        ${state.isAdmin ? `<button class="secondary-button" id="view-account-blacklist">查看黑名单 (${state.blacklistedAccounts.length})</button>` : ''}
        ${state.isAdmin ? '<button class="danger-button" id="delete-all-accounts">一键删除</button>' : ''}
      </div>
    </section>
    <section class="panel table-panel">
      ${state.isAdmin ? renderAccountGroupTabs(state.accounts, state.accountGroups, state.accountGroupFilter) : ''}
      ${batchGroupToolbar}
      ${
        state.isAdmin && (state.accountIdFilter.trim() !== '' || state.gameNameFilter.trim() !== '')
          ? '<div class="feedback" data-state="success">排序仅在未使用搜索筛选时可拖动调整。</div>'
          : ''
      }
      <div class="name-popup-layer" id="name-popup" hidden></div>
      ${
        state.accounts.length === 0
          ? '<div class="empty-state">当前还没有账号数据。</div>'
          : state.filteredAccounts.length === 0
            ? '<div class="empty-state">没有匹配到符合条件的账号。</div>'
            : `
            <div class="table-wrap account-list-wrap">
              <table>
                <thead>
                  <tr>
                    ${state.isAdmin ? '<th>选择</th>' : ''}
                    <th>游戏头像</th>
                    <th>账号ID</th>
                    <th>游戏名</th>
                    <th>游戏区</th>
                    <th>游戏等级</th>
                    ${state.isAdmin ? '<th>分组</th>' : ''}
                    ${state.isAdmin ? '<th>操作</th>' : ''}
                  </tr>
                </thead>
                <tbody>${state.filteredAccounts
                  .map((account) =>
                    renderAccountRow(account, {
                      isAdmin: state.isAdmin,
                      accountIdFilter: state.accountIdFilter,
                      gameNameFilter: state.gameNameFilter,
                      selectedAccountIds: state.selectedAccountIds
                    })
                  )
                  .join('')}</tbody>
              </table>
            </div>
          `
      }
    </section>
    ${state.accountBlacklistModal}
  `);
}
