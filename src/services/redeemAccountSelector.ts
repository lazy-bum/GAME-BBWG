import {
  countAccountsByStatus,
  listAccounts,
  listAccountsByIds,
  listAccountsByStatus,
  resetAccountsStatus
} from '../core/accountRepository.js';
import { ACCOUNT_STATUS, type AccountRow } from '../core/dbTypes.js';
import type { RedeemRunOptions } from './redeemTypes.js';

function getAccountLevel(account: AccountRow): number {
  const rawLevel = account.details?.stove_lv;
  const parsed = Number(rawLevel);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function filterAccountsByMinLevel(accounts: AccountRow[], minLevel: number | undefined): AccountRow[] {
  if (!minLevel || minLevel <= 0) {
    return accounts;
  }

  return accounts.filter((account) => getAccountLevel(account) >= minLevel);
}

export async function selectRedeemAccounts(
  targetAccountIds: string[] | undefined,
  options: RedeemRunOptions | undefined
): Promise<{ accounts: AccountRow[]; resetTriggered: boolean }> {
  const includeAllAccounts = options?.includeAllAccounts ?? false;
  const includeTargetAccounts = options?.includeTargetAccounts ?? false;
  let accounts = includeAllAccounts
    ? await listAccounts()
    : targetAccountIds && targetAccountIds.length > 0
      ? includeTargetAccounts
        ? await listAccountsByIds(targetAccountIds)
        : (await listAccountsByIds(targetAccountIds)).filter((item) => item.status === ACCOUNT_STATUS.failed)
      : await listAccountsByStatus(ACCOUNT_STATUS.pending);

  accounts = filterAccountsByMinLevel(accounts, options?.minLevel);

  if (!includeAllAccounts && (!targetAccountIds || targetAccountIds.length === 0) && accounts.length === 0) {
    await resetAccountsStatus(ACCOUNT_STATUS.redeemed, ACCOUNT_STATUS.pending);
    accounts = filterAccountsByMinLevel(await listAccountsByStatus(ACCOUNT_STATUS.pending), options?.minLevel);
    return { accounts, resetTriggered: true };
  }

  return { accounts, resetTriggered: false };
}

export async function countRemainingRedeemAccounts(options: RedeemRunOptions | undefined): Promise<number> {
  if (options?.includeAllAccounts || options?.includeTargetAccounts) {
    return 0;
  }

  return countAccountsByStatus(ACCOUNT_STATUS.pending);
}
