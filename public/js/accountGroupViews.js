import { escapeAttribute, escapeHtml, formatDateTime } from './html.js';

export function getAccountGroupName(account) {
  return account.groupName?.trim() || '未分组';
}

export function renderAccountGroupBadge(account) {
  const groupName = getAccountGroupName(account);
  const title = account.groupId
    ? `优先级 ${account.groupPriority ?? 0}，排序 ${account.groupSortOrder ?? 0}`
    : '未分组账号排在已分组账号之后';
  return `<span class="group-badge" title="${escapeAttribute(title)}">${escapeHtml(groupName)}</span>`;
}

export function renderAccountGroupTabs(accounts, accountGroups, accountGroupFilter) {
  const ungroupedCount = accounts.filter((account) => !account.groupId).length;
  const allCount = accounts.length;
  const groupCountMap = new Map();
  for (const account of accounts) {
    if (!account.groupId) {
      continue;
    }
    groupCountMap.set(account.groupId, (groupCountMap.get(account.groupId) ?? 0) + 1);
  }

  const tabItems = [
    { value: 'ungrouped', label: '未分组', count: ungroupedCount },
    ...accountGroups.map((group) => ({
      value: group.groupId,
      label: group.name,
      count: groupCountMap.get(group.groupId) ?? 0
    })),
    { value: 'all', label: '全部', count: allCount }
  ];

  return `
    <div class="group-tabs" role="tablist" aria-label="账号分组">
      ${tabItems
        .map(
          (item) => `
          <button
            class="group-tab"
            type="button"
            role="tab"
            aria-selected="${accountGroupFilter === item.value ? 'true' : 'false'}"
            data-account-group-tab="${escapeAttribute(item.value)}"
          >
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </button>
        `
        )
        .join('')}
    </div>
  `;
}

export function renderAccountGroupRow(group) {
  return `
    <tr>
      <td data-label="分组名称">
        <input class="search-input group-name-input" type="text" value="${escapeAttribute(group.name)}" data-group-name="${escapeAttribute(group.groupId)}" />
      </td>
      <td data-label="优先级">
        <input class="search-input group-number-input" type="number" value="${Number(group.priority) || 0}" data-group-priority="${escapeAttribute(group.groupId)}" />
      </td>
      <td data-label="排序">
        <input class="search-input group-number-input" type="number" value="${Number(group.sortOrder) || 0}" data-group-sort="${escapeAttribute(group.groupId)}" />
      </td>
      <td data-label="审计">
        <div>${escapeHtml(group.createdBy || 'system')} 创建</div>
        <div>${escapeHtml(group.updatedBy || 'system')} 更新</div>
        <div>${escapeHtml(formatDateTime(group.updatedAt))}</div>
      </td>
      <td class="table-actions" data-label="操作">
        <button class="secondary-button" data-save-group="${escapeAttribute(group.groupId)}">保存</button>
        <button class="danger-button" data-delete-group="${escapeAttribute(group.groupId)}">删除</button>
      </td>
    </tr>
  `;
}
