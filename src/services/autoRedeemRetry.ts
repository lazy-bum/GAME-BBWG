import { listAccountsByStatus } from '../core/accountRepository.js';
import { ACCOUNT_STATUS } from '../core/dbTypes.js';
import { REDEEM_CODE_DELAY_MS, type RedeemService } from './redeem.js';
import type { RedeemSummary } from './redeemTypes.js';
import { mergeRedeemSummaries } from './redeemSummary.js';

export async function runAllAccountsRedeemWithSingleFailureRetry(
  redeemService: RedeemService,
  code: string,
  formatLogTime: () => string,
  actorUsername = 'system'
): Promise<RedeemSummary> {
  const firstSummary = await redeemService.runAutoRedeemForAllAccounts(code, actorUsername);
  if (firstSummary.failureCount === 0) {
    return firstSummary;
  }

  const failedAccounts = await listAccountsByStatus(ACCOUNT_STATUS.failed);
  const failedAccountIds = failedAccounts.map((account) => account.accountId);
  if (failedAccountIds.length === 0) {
    return firstSummary;
  }

  // eslint-disable-next-line no-console
  console.log(`[${formatLogTime()}] 自动兑换失败账号重试将在 ${REDEEM_CODE_DELAY_MS / 1000} 秒后开始：${code}`);
  const retrySummary = await redeemService.runBatchRedeem(code, failedAccountIds, {
    initialDelayMs: REDEEM_CODE_DELAY_MS,
    actorUsername
  });
  // eslint-disable-next-line no-console
  console.log(`[${formatLogTime()}] 自动兑换失败账号重试结束：${code}`);

  return mergeRedeemSummaries(firstSummary, retrySummary);
}

export async function runTargetAccountsRedeemWithSingleFailureRetry(
  redeemService: RedeemService,
  code: string,
  accountIds: string[],
  actorUsername = 'system'
): Promise<RedeemSummary> {
  const firstSummary = await redeemService.runRedeemForAccounts(code, accountIds, actorUsername);
  if (firstSummary.failureCount === 0) {
    return firstSummary;
  }

  const failedAccountIdSet = new Set(accountIds);
  const failedAccountIds = (await listAccountsByStatus(ACCOUNT_STATUS.failed))
    .map((account) => account.accountId)
    .filter((accountId) => failedAccountIdSet.has(accountId));
  if (failedAccountIds.length === 0) {
    return firstSummary;
  }

  // eslint-disable-next-line no-console
  console.log(`新增账号补兑最新兑换码失败账号重试将在 ${REDEEM_CODE_DELAY_MS / 1000} 秒后开始：code=${code}，账号数=${failedAccountIds.length}`);
  const retrySummary = await redeemService.runBatchRedeem(code, failedAccountIds, {
    initialDelayMs: REDEEM_CODE_DELAY_MS,
    actorUsername
  });
  // eslint-disable-next-line no-console
  console.log(`新增账号补兑最新兑换码失败账号重试完成：code=${code}`);

  return mergeRedeemSummaries(firstSummary, retrySummary);
}
