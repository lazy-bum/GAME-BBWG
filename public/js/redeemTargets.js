export const REDEEM_TARGET_MODE = {
  all: 'all',
  custom: 'custom'
};

export const REDEEM_TARGET_UNGROUPED = '__ungrouped__';

export function getRedeemAccountGroupKey(account) {
  return account?.groupId || REDEEM_TARGET_UNGROUPED;
}

export function getRedeemTargetAccountIds(accounts, mode, selectedAccountIds) {
  if (mode === REDEEM_TARGET_MODE.all) {
    return accounts.map((account) => account.accountId);
  }

  const selectedSet = selectedAccountIds instanceof Set ? selectedAccountIds : new Set(selectedAccountIds || []);
  return accounts.filter((account) => selectedSet.has(account.accountId)).map((account) => account.accountId);
}

export function groupRedeemAccounts(accounts, accountGroups) {
  const groupedMap = new Map();
  const knownGroups = Array.isArray(accountGroups) ? accountGroups : [];

  for (const group of knownGroups) {
    groupedMap.set(group.groupId, {
      groupId: group.groupId,
      groupName: group.name,
      accounts: []
    });
  }

  groupedMap.set(REDEEM_TARGET_UNGROUPED, {
    groupId: REDEEM_TARGET_UNGROUPED,
    groupName: '未分组',
    accounts: []
  });

  for (const account of accounts) {
    const key = getRedeemAccountGroupKey(account);
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        groupId: key,
        groupName: account.groupName || '未命名分组',
        accounts: []
      });
    }
    groupedMap.get(key).accounts.push(account);
  }

  return Array.from(groupedMap.values()).filter((group) => group.accounts.length > 0);
}
