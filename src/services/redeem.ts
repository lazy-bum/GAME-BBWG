import { EventEmitter } from 'node:events';
import { forceSetAllAccountsRedeemed, listAccountsByIdsIncludingDeleted } from '../core/accountRepository.js';
import { RedeemAccountProcessor } from './redeemAccountProcessor.js';
import { countRemainingRedeemAccounts, selectRedeemAccounts } from './redeemAccountSelector.js';
import { RedeemCancelledError } from './redeemCancellation.js';
import { RedeemRunState } from './redeemRunState.js';
import { mergeRedeemSummaries } from './redeemSummary.js';
import type { MultiRedeemSummary, RedeemProgressPayload, RedeemRunOptions, RedeemSummary } from './redeemTypes.js';
export type {
  ApiEnvelope,
  MultiRedeemCodeSummary,
  MultiRedeemSummary,
  RedeemProgressPayload,
  RedeemRunOptions,
  RedeemSummary
} from './redeemTypes.js';

const REQUEST_DELAY_MS = 1200;
const CHUNK_DELAY_MS = 4000;
export const REDEEM_CODE_DELAY_MS = 10000;
const CHUNK_SIZE = 30;

interface RedeemProgressContext {
  currentCode?: string;
  currentCodeIndex?: number;
  totalCodes?: number;
}

export interface RedeemCodeFailureRetryInput {
  giftCode: string;
  accountIds: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RedeemService extends EventEmitter {
  private running = false;
  private cancelRequested = false;
  private activeController: AbortController | null = null;

  private emitProgress(payload: RedeemProgressPayload): void {
    this.emit('progress', payload);
  }

  private log(level: RedeemProgressPayload['level'], message: string): void {
    this.emitProgress({
      type: 'log',
      level,
      message
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  requestCancel(): boolean {
    if (!this.running) {
      return false;
    }

    this.cancelRequested = true;
    this.activeController?.abort();
    this.log('warn', '已收到停止请求，正在终止当前兑换任务...');
    return true;
  }

  private ensureNotCancelled(): void {
    if (this.cancelRequested) {
      throw new RedeemCancelledError();
    }
  }

  private async sleepWithCancel(ms: number): Promise<void> {
    const slice = 100;
    let remaining = ms;

    while (remaining > 0) {
      this.ensureNotCancelled();
      const waitMs = Math.min(slice, remaining);
      await sleep(waitMs);
      remaining -= waitMs;
    }
  }

  async runBatchRedeem(
    giftCode: string,
    targetAccountIds?: string[],
    options?: RedeemRunOptions
  ): Promise<RedeemSummary> {
    if (this.running) {
      throw new Error('当前已有兑换任务正在执行，请稍后再试。');
    }

    this.running = true;
    this.cancelRequested = false;
    try {
      const initialDelayMs = options?.initialDelayMs ?? 0;
      if (initialDelayMs > 0) {
        this.log('info', `等待 ${Math.round(initialDelayMs / 1000)} 秒后开始兑换...`);
        await this.sleepWithCancel(initialDelayMs);
      }
      if (options?.autoRetryFailedOnce) {
        return await this.executeBatchRedeemWithSingleFailureRetry(giftCode, targetAccountIds, options);
      }
      return await this.executeBatchRedeem(giftCode, targetAccountIds, options);
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.activeController = null;
    }
  }

  private async executeBatchRedeem(
    giftCode: string,
    targetAccountIds?: string[],
    options?: RedeemRunOptions,
    progressContext: RedeemProgressContext = {}
  ): Promise<RedeemSummary> {
    let runState = new RedeemRunState(0, false);
    try {
      const trimmedCode = giftCode.trim();
      if (!trimmedCode) {
        throw new Error('请输入兑换码');
      }

      const includeAllAccounts = options?.includeAllAccounts ?? false;
      const includeTargetAccounts = options?.includeTargetAccounts ?? false;
      const selected = await selectRedeemAccounts(targetAccountIds, options);
      const pendingAccounts = selected.accounts;
      runState = new RedeemRunState(pendingAccounts.length, selected.resetTriggered);

      if (runState.total === 0) {
        throw new Error(targetAccountIds && targetAccountIds.length > 0 ? '没有可重试的失败账号' : '没有可用账号');
      }

      this.emitProgress({
        type: 'start',
        total: runState.total,
        processed: 0,
        ...progressContext
      });

      if (runState.resetTriggered) {
        this.log('warn', '开始兑换前，已将 status=1 的账号重置为 0。');
      }

      this.log('info', `共找到 ${runState.total} 个账号，开始处理...`);
      const accountProcessor = new RedeemAccountProcessor({
        ensureNotCancelled: () => this.ensureNotCancelled(),
        sleepWithCancel: (ms) => this.sleepWithCancel(ms),
        setActiveController: (controller) => {
          this.activeController = controller;
        },
        log: (level, message) => this.log(level, message)
      });

      for (let index = 0; index < pendingAccounts.length; index += CHUNK_SIZE) {
        this.ensureNotCancelled();
        const chunk = pendingAccounts.slice(index, index + CHUNK_SIZE);
        const latestAccounts = await listAccountsByIdsIncludingDeleted(
          chunk.map((account) => account.accountId),
          { includeBlacklisted: true }
        );
        const latestAccountMap = new Map(latestAccounts.map((account) => [account.accountId, account]));

        for (const account of chunk) {
          this.ensureNotCancelled();
          try {
            const result = await accountProcessor.processAccount(
              account,
              trimmedCode,
              latestAccountMap.get(account.accountId) ?? null
            );
            runState.applyAccountResult(result);
            if (result.failureCount > 0) {
              runState.markFailedAccount(account.accountId);
            }
          } finally {
            this.activeController = null;
            runState.markProcessed();
            this.emitProgress({
              type: 'progress',
              processed: runState.processed,
              total: runState.total,
              ...progressContext
            });
            if (!this.cancelRequested) {
              await this.sleepWithCancel(REQUEST_DELAY_MS);
            }
          }
        }

        if (index + CHUNK_SIZE < pendingAccounts.length) {
          this.log('info', '休息 4 秒后继续...');
          await this.sleepWithCancel(CHUNK_DELAY_MS);
        }
      }

      const remaining = includeAllAccounts || includeTargetAccounts ? 0 : await countRemainingRedeemAccounts(options);
      const summary = runState.toSummary(remaining);

      if (remaining > 0) {
        this.log('warn', `还有 ${remaining} 个账号未处理，建议重新运行一次。`);
      }

      this.log('info', '兑换流程执行完毕。');
      this.emitProgress({
        type: 'done',
        summary,
        ...progressContext
      });

      return summary;
    } catch (error) {
      if (error instanceof RedeemCancelledError) {
        const remaining = await countRemainingRedeemAccounts(options);
        const summary = runState.toSummary(remaining);

        this.log('warn', '兑换任务已停止。');
        this.emitProgress({
          type: 'done',
          summary,
          ...progressContext
        });

        throw error;
      }

      throw error;
    }
  }

  private async executeBatchRedeemWithSingleFailureRetry(
    giftCode: string,
    targetAccountIds?: string[],
    options?: RedeemRunOptions,
    progressContext: RedeemProgressContext = {}
  ): Promise<RedeemSummary> {
    const firstSummary = await this.executeBatchRedeem(giftCode, targetAccountIds, options, progressContext);
    if (firstSummary.failureCount === 0) {
      return firstSummary;
    }

    const failedAccountIds = firstSummary.failedAccountIds;
    if (failedAccountIds.length === 0) {
      this.log('warn', `兑换码 ${giftCode} 有失败结果，但未找到可自动重试的失败账号。`);
      return firstSummary;
    }

    this.log('warn', `兑换码 ${giftCode} 失败账号将在 ${REDEEM_CODE_DELAY_MS / 1000} 秒后自动重试一次，失败账号数：${failedAccountIds.length}`);
    await this.sleepWithCancel(REDEEM_CODE_DELAY_MS);
    this.log('info', `兑换码 ${giftCode} 自动重试失败账号开始，账号数：${failedAccountIds.length}`);

    const retrySummary = await this.executeBatchRedeem(giftCode, failedAccountIds, undefined, progressContext);
    const mergedSummary = mergeRedeemSummaries(firstSummary, retrySummary);

    this.log(
      'success',
      `兑换码 ${giftCode} 自动重试完成：总处理 ${mergedSummary.processed}/${mergedSummary.total}，成功 ${mergedSummary.successCount}，已领取 ${mergedSummary.receivedCount}，失败 ${mergedSummary.failureCount}`
    );
    this.emitProgress({
      type: 'done',
      summary: mergedSummary,
      ...progressContext
    });

    return mergedSummary;
  }

  async runMultiCodeRedeem(giftCodes: string[]): Promise<MultiRedeemSummary> {
    if (this.running) {
      throw new Error('当前已有兑换任务正在执行，请稍后再试。');
    }

    const normalizedCodes = Array.from(
      new Set(
        giftCodes
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (normalizedCodes.length === 0) {
      throw new Error('请输入兑换码');
    }

    this.running = true;
    this.cancelRequested = false;
    const summaries: MultiRedeemSummary['summaries'] = [];

    try {
      for (let index = 0; index < normalizedCodes.length; index += 1) {
        this.ensureNotCancelled();
        const giftCode = normalizedCodes[index];
        const progressContext = {
          currentCode: giftCode,
          currentCodeIndex: index + 1,
          totalCodes: normalizedCodes.length
        };
        this.log('info', `===== 开始兑换 ${giftCode}，${index + 1} / ${normalizedCodes.length} =====`);
        const summary = await this.executeBatchRedeemWithSingleFailureRetry(
          giftCode,
          undefined,
          { includeAllAccounts: true },
          progressContext
        );
        summaries.push({ giftCode, summary });
        this.log(
          'success',
          `===== ${giftCode} 完成：已处理 ${summary.processed}/${summary.total}，成功 ${summary.successCount}，已领取 ${summary.receivedCount}，失败 ${summary.failureCount} =====`
        );
        if (index + 1 < normalizedCodes.length) {
          this.log('info', `等待 ${REDEEM_CODE_DELAY_MS / 1000} 秒后开始下一个兑换码...`);
          await this.sleepWithCancel(REDEEM_CODE_DELAY_MS);
        }
      }

      this.log('success', `全部兑换码处理完成，共 ${summaries.length} 个。`);
      return {
        totalCodes: normalizedCodes.length,
        processedCodes: summaries.length,
        summaries
      };
    } catch (error) {
      if (error instanceof RedeemCancelledError) {
        this.log('warn', `批量兑换已停止，已完成 ${summaries.length} / ${normalizedCodes.length} 个兑换码。`);
      }

      throw error;
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.activeController = null;
    }
  }

  async runCodeFailureRedeem(failures: RedeemCodeFailureRetryInput[]): Promise<MultiRedeemSummary> {
    if (this.running) {
      throw new Error('当前已有兑换任务正在执行，请稍后再试。');
    }

    const normalizedFailures = failures
      .map((item) => ({
        giftCode: item.giftCode.trim().toUpperCase(),
        accountIds: Array.from(new Set(item.accountIds.map((accountId) => accountId.trim()).filter(Boolean)))
      }))
      .filter((item) => item.giftCode && item.accountIds.length > 0);

    if (normalizedFailures.length === 0) {
      throw new Error('没有可重试的兑换码失败记录');
    }

    this.running = true;
    this.cancelRequested = false;
    const summaries: MultiRedeemSummary['summaries'] = [];

    try {
      for (let index = 0; index < normalizedFailures.length; index += 1) {
        this.ensureNotCancelled();
        const failure = normalizedFailures[index];
        const progressContext = {
          currentCode: failure.giftCode,
          currentCodeIndex: index + 1,
          totalCodes: normalizedFailures.length
        };

        this.log(
          'info',
          `===== 重试兑换码失败记录 ${failure.giftCode}，${index + 1} / ${normalizedFailures.length}，账号数：${failure.accountIds.length} =====`
        );
        this.log('info', `等待 ${REDEEM_CODE_DELAY_MS / 1000} 秒后开始重试 ${failure.giftCode}...`);
        await this.sleepWithCancel(REDEEM_CODE_DELAY_MS);

        const summary = await this.executeBatchRedeemWithSingleFailureRetry(
          failure.giftCode,
          failure.accountIds,
          { includeTargetAccounts: true },
          progressContext
        );
        summaries.push({ giftCode: failure.giftCode, summary });
        this.log(
          'success',
          `===== ${failure.giftCode} 失败记录重试完成：已处理 ${summary.processed}/${summary.total}，成功 ${summary.successCount}，已领取 ${summary.receivedCount}，失败 ${summary.failureCount} =====`
        );

        if (index + 1 < normalizedFailures.length) {
          this.log('info', `等待 ${REDEEM_CODE_DELAY_MS / 1000} 秒后开始下一个兑换码失败记录...`);
          await this.sleepWithCancel(REDEEM_CODE_DELAY_MS);
        }
      }

      return {
        totalCodes: normalizedFailures.length,
        processedCodes: summaries.length,
        summaries
      };
    } catch (error) {
      if (error instanceof RedeemCancelledError) {
        this.log('warn', `兑换码失败记录重试已停止，已完成 ${summaries.length} / ${normalizedFailures.length} 个兑换码。`);
      }

      throw error;
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.activeController = null;
    }
  }

  async forceCompleteAllRedeem(): Promise<{ updated: number }> {
    return { updated: await forceSetAllAccountsRedeemed() };
  }

  async runAutoRedeemForAllAccounts(giftCode: string): Promise<RedeemSummary> {
    return this.runBatchRedeem(giftCode, undefined, { includeAllAccounts: true });
  }

  async runRedeemForAccounts(giftCode: string, accountIds: string[]): Promise<RedeemSummary> {
    return this.runBatchRedeem(giftCode, accountIds, { includeTargetAccounts: true });
  }
}
