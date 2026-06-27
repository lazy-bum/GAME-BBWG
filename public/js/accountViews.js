import { renderAccountGroupBadge } from './accountGroupViews.js';
import { escapeAttribute, escapeHtml } from './html.js';
import { getDefaultRedeemStatus } from './redeemStatus.js';

export function renderAccountBlacklistRow(account) {
  const gameAvatar = account.details?.avatar_image?.trim() || '';
  const gameName = account.name?.trim() || '-';
  const statusView = getDefaultRedeemStatus(account.status);
  const avatarContent = gameAvatar
    ? `<img class="avatar-image" src="${escapeAttribute(gameAvatar)}" alt="${escapeAttribute(gameName || account.accountId)}" loading="lazy" />`
    : '<span class="avatar-fallback">无头像</span>';

  return `
    <tr>
      <td data-label="头像">${avatarContent}</td>
      <td data-label="账号ID"><span class="mono-text">${escapeHtml(account.accountId)}</span></td>
      <td data-label="游戏名">${escapeHtml(gameName)}</td>
      <td data-label="状态">
        <span class="status-badge status-${statusView.code}">${escapeHtml(statusView.text)}</span>
      </td>
      <td data-label="操作">
        <button class="secondary-button" data-unblacklist-account="${escapeAttribute(account.accountId)}">移出黑名单</button>
      </td>
    </tr>
  `;
}

export function renderAccountBlacklistModal({ isAdmin, blacklistedAccounts, accountBlacklistModalOpen }) {
  if (!isAdmin) {
    return '';
  }

  const modalContent =
    blacklistedAccounts.length === 0
      ? '<div class="empty-state blacklist-empty">当前没有黑名单账号。</div>'
      : `
      <div class="table-wrap blacklist-wrap">
        <table>
          <thead>
            <tr>
              <th>头像</th>
              <th>账号ID</th>
              <th>游戏名</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${blacklistedAccounts.map(renderAccountBlacklistRow).join('')}</tbody>
        </table>
      </div>
    `;

  return `
    <div class="visitor-modal-backdrop" id="account-blacklist-modal" ${accountBlacklistModalOpen ? '' : 'hidden'}>
      <div class="visitor-modal" role="dialog" aria-modal="true" aria-labelledby="account-blacklist-title">
        <div class="visitor-modal-head">
          <h3 id="account-blacklist-title">账号黑名单</h3>
        </div>
        <div class="visitor-modal-body">
          ${modalContent}
        </div>
        <div class="visitor-modal-actions">
          <button class="secondary-button" id="close-account-blacklist">关闭</button>
        </div>
      </div>
    </div>
  `;
}

export function renderAccountMissingRedeemCodesModal({ accountMissingRedeemCodesModal }) {
  const selectedAccountId = accountMissingRedeemCodesModal?.accountId ?? '';
  const missingCodes = Array.isArray(accountMissingRedeemCodesModal?.missingCodes) ? accountMissingRedeemCodesModal.missingCodes : [];

  const modalContent =
    missingCodes.length === 0
      ? '<div class="empty-state blacklist-empty">当前没有未兑换的兑换码。</div>'
      : `
      <div class="table-wrap blacklist-wrap account-missing-redeem-wrap">
        <table>
          <thead>
            <tr>
              <th>兑换码</th>
              <th>来源</th>
              <th>等级限制</th>
              <th>未兑换原因</th>
              <th>上次尝试</th>
            </tr>
          </thead>
          <tbody>
            ${missingCodes
              .map(
                (item) => `
                  <tr>
                    <td data-label="兑换码">
                      <div class="redeem-code-main-cell">
                        <strong>${escapeHtml(item.code)}</strong>
                        ${item.title ? `<span>${escapeHtml(item.title)}</span>` : ''}
                      </div>
                    </td>
                    <td data-label="来源">${escapeHtml(item.sourceId || 'manual')}</td>
                    <td data-label="等级限制">${item.minLevel ? `Lv.${item.minLevel}` : '不限'}</td>
                    <td data-label="未兑换原因">${escapeHtml(item.missingReason || '-')}</td>
                    <td data-label="上次尝试">${escapeHtml(item.lastTriedAt ? new Date(item.lastTriedAt).toLocaleString('zh-CN', { hour12: false }) : '-')}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

  return `
    <div class="visitor-modal-backdrop" id="account-missing-redeem-modal" ${selectedAccountId ? '' : 'hidden'}>
      <div class="visitor-modal" role="dialog" aria-modal="true" aria-labelledby="account-missing-redeem-title">
        <div class="visitor-modal-head">
          <h3 id="account-missing-redeem-title">未兑换兑换码：${escapeHtml(selectedAccountId)}</h3>
        </div>
        <div class="visitor-modal-body">
          ${modalContent}
        </div>
        <div class="visitor-modal-actions">
          <button
            class="primary-button"
            id="redeem-account-missing-codes"
            ${missingCodes.some((item) => item.canRedeem) ? '' : 'disabled'}
          >
            一键兑换可补兑换码
          </button>
          <button class="secondary-button" id="close-account-missing-redeem">关闭</button>
        </div>
      </div>
    </div>
  `;
}

export function renderAccountRow(account, options) {
  const gameAvatar = account.details?.avatar_image?.trim() || '';
  const gameZone = account.kid?.toString().trim() || '-';
  const gameLevel = account.details?.stove_lv?.toString().trim() || '-';
  const gameName = account.name?.trim() || '-';
  const avatarContent = gameAvatar
    ? `<img class="avatar-image" src="${escapeAttribute(gameAvatar)}" alt="${escapeAttribute(gameName || account.accountId)}" loading="lazy" />`
    : '<span class="avatar-fallback">无头像</span>';
  const sortEnabled = options.isAdmin && options.accountIdFilter.trim() === '' && options.gameNameFilter.trim() === '';

  return `
    <tr
      ${options.isAdmin ? `data-sort-account-id="${escapeAttribute(account.accountId)}"` : ''}
    >
      ${
        options.isAdmin
          ? `<td data-label="选择"><input class="account-select-checkbox" type="checkbox" data-select-account="${escapeAttribute(account.accountId)}" ${options.selectedAccountIds.has(account.accountId) ? 'checked' : ''} /></td>`
          : ''
      }
      <td data-label="游戏头像">${avatarContent}</td>
      <td data-label="账号ID">
        ${
          sortEnabled
            ? `<button class="sort-trigger-button" type="button" data-sort-trigger="true">${escapeHtml(account.accountId)}</button>`
            : escapeHtml(account.accountId)
        }
      </td>
      <td data-label="游戏名">
        <div class="name-cell">
          <button class="name-preview-button" type="button" data-full-game-name="${escapeAttribute(gameName)}">${escapeHtml(gameName)}</button>
        </div>
      </td>
      <td data-label="游戏区">${escapeHtml(gameZone)}</td>
      <td data-label="游戏等级">${escapeHtml(gameLevel)}</td>
      ${options.isAdmin ? `<td data-label="分组">${renderAccountGroupBadge(account)}</td>` : ''}
      ${
        options.isAdmin
          ? `<td data-label="审计"><div>${escapeHtml(account.createdBy || 'system')} 创建</div><div>${escapeHtml(account.updatedBy || 'system')} 更新</div></td>`
          : ''
      }
      ${
        options.isAdmin
          ? `
      <td class="table-actions" data-label="操作">
        <button class="secondary-button" data-view-account-missing-redeem="${escapeAttribute(account.accountId)}">缺码查询</button>
        <button class="secondary-button" data-blacklist-account="${escapeAttribute(account.accountId)}">拉黑</button>
        <button class="danger-button" data-delete-account="${escapeAttribute(account.accountId)}">删除</button>
      </td>
      `
          : ''
      }
    </tr>
  `;
}

export function renderRedeemAccountRow(account, statusView, options = {}) {
  const gameAvatar = account.details?.avatar_image?.trim() || '';
  const gameName = account.name?.trim() || account.accountId;
  const avatarContent = gameAvatar
    ? `<img class="avatar-image" src="${escapeAttribute(gameAvatar)}" alt="${escapeAttribute(gameName)}" loading="lazy" />`
    : '<span class="avatar-fallback">无头像</span>';
  const rowClassName = options.targetMatched === false ? 'redeem-row-muted' : '';

  return `
    <tr data-redeem-account-id="${escapeAttribute(account.accountId)}" class="${rowClassName}">
      <td data-label="头像">${avatarContent}</td>
      <td data-label="名字">${escapeHtml(gameName)}</td>
      <td data-label="分组">${renderAccountGroupBadge(account)}</td>
      <td data-label="审计">${escapeHtml(account.updatedBy || account.createdBy || 'system')}</td>
      <td data-label="兑换状态">
        <span class="status-badge status-${statusView.code}" data-redeem-status="${escapeAttribute(account.accountId)}">${escapeHtml(statusView.text)}</span>
      </td>
    </tr>
  `;
}
