import {
  completeRedeemCodeRedemption,
  failRedeemCodeRedemption,
  listRedeemCodes,
  reserveRedeemCodeRedemption
} from '../core/redeemCodeRepository.js';
import { RedeemService } from './redeem.js';
import {
  runAllAccountsRedeemWithSingleFailureRetry,
  runTargetAccountsRedeemWithSingleFailureRetry
} from './autoRedeemRetry.js';
import { ensureRedeemTokenForAutoRedeem } from './autoRedeemToken.js';
import { ExclusiveTaskRunner } from './exclusiveTaskRunner.js';
import type { RedeemProgressPayload, RedeemSummary } from './redeemTypes.js';
import { UniqueStringQueue } from './uniqueStringQueue.js';

const AUTO_REDEEM_MAX_CODE_AGE_MS = 1000 * 60 * 60 * 24;
const AUTO_REDEEM_PROGRESS_LOG_STEP = 10;

function formatLogTime(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export class AutoRedeemCoordinator {
  private readonly autoRedeemQueue = new UniqueStringQueue();
  private autoRedeemQueueRunning = false;
  private readonly newAccountRedeemQueue = new UniqueStringQueue();
  private newAccountRedeemQueueRunning = false;
  private readonly redeemTaskRunner: ExclusiveTaskRunner;

  constructor(
    private readonly options: {
      redeemService: RedeemService;
      pauseSourcePolling: () => void;
      resumeSourcePolling: () => void;
    }
  ) {
    this.redeemTaskRunner = new ExclusiveTaskRunner({
      isBlocked: () => this.options.redeemService.isRunning()
    });
  }

  private async runWithConsoleProgress<T extends RedeemSummary>(
    label: string,
    task: () => Promise<T>
  ): Promise<T> {
    let total = 0;
    let lastLoggedProcessed = 0;

    const shouldLogProgress = (processed: number): boolean => {
      if (processed <= 0 || processed === lastLoggedProcessed) {
        return false;
      }
      return processed === 1 || processed === total || processed % AUTO_REDEEM_PROGRESS_LOG_STEP === 0;
    };

    const onProgress = (payload: RedeemProgressPayload) => {
      if (payload.type === 'start') {
        total = payload.total ?? 0;
        lastLoggedProcessed = 0;
        // eslint-disable-next-line no-console
        console.log(`[${formatLogTime()}] ${label}进度：0/${total}`);
        return;
      }

      if (payload.type === 'progress') {
        const processed = payload.processed ?? 0;
        total = payload.total ?? total;
        if (!shouldLogProgress(processed)) {
          return;
        }
        lastLoggedProcessed = processed;
        const percent = total > 0 ? Math.floor((processed / total) * 100) : 0;
        // eslint-disable-next-line no-console
        console.log(`[${formatLogTime()}] ${label}进度：${processed}/${total} (${percent}%)`);
        return;
      }

      if (payload.type === 'done' && payload.summary) {
        lastLoggedProcessed = payload.summary.processed;
        // eslint-disable-next-line no-console
        console.log(
          `[${formatLogTime()}] ${label}汇总：已处理=${payload.summary.processed}/${payload.summary.total}，成功=${payload.summary.successCount}，已领取=${payload.summary.receivedCount}，失败=${payload.summary.failureCount}`
        );
      }
    };

    this.options.redeemService.on('progress', onProgress);
    try {
      return await task();
    } finally {
      this.options.redeemService.off('progress', onProgress);
    }
  }

  async enqueueAutoRedeemCodes(codes: string[]): Promise<void> {
    const normalizedCodes = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)));
    if (normalizedCodes.length === 0) {
      return;
    }

    const redeemCodes = await listRedeemCodes(200);
    const redeemCodeMap = new Map(redeemCodes.map((item) => [item.code, item]));
    const now = Date.now();

    for (const normalizedCode of normalizedCodes) {
      const redeemCode = redeemCodeMap.get(normalizedCode);
      if (!redeemCode?.isCurrentlyValid) {
        // eslint-disable-next-line no-console
        console.log(`auto redeem skipped for inactive code ${normalizedCode}, reason=${redeemCode?.invalidReason ?? 'unknown'}`);
        continue;
      }
      const publishedAt = redeemCode?.publishedAt ?? 0;
      if (publishedAt <= 0 || now - publishedAt > AUTO_REDEEM_MAX_CODE_AGE_MS) {
        // eslint-disable-next-line no-console
        console.log(`auto redeem skipped for old code ${normalizedCode}, publishedAt=${publishedAt || 'unknown'}`);
        continue;
      }

      this.autoRedeemQueue.enqueue(normalizedCode);
    }

    void this.drainAutoRedeemQueue();
  }

  enqueueLatestRedeemForNewAccounts(accountIds: string[]): void {
    for (const accountId of accountIds) {
      this.newAccountRedeemQueue.enqueue(accountId);
    }

    void this.drainNewAccountRedeemQueue();
  }

  private async drainAutoRedeemQueue(): Promise<void> {
    if (this.autoRedeemQueueRunning) {
      return;
    }

    this.autoRedeemQueueRunning = true;
    this.options.pauseSourcePolling();
    try {
      while (this.autoRedeemQueue.length > 0) {
        const code = this.autoRedeemQueue.dequeue();
        if (!code) {
          continue;
        }

        try {
          const reserved = await reserveRedeemCodeRedemption(code);
          if (!reserved) {
            continue;
          }

          const summary = await this.redeemTaskRunner.run(async () => {
            await ensureRedeemTokenForAutoRedeem();
            // eslint-disable-next-line no-console
            console.log(`[${formatLogTime()}] 自动兑换开始：${code}`);
            return this.runWithConsoleProgress(`自动兑换 ${code}`, () =>
              runAllAccountsRedeemWithSingleFailureRetry(this.options.redeemService, code, formatLogTime)
            );
          });
          await completeRedeemCodeRedemption(code, summary);
          // eslint-disable-next-line no-console
          console.log(`[${formatLogTime()}] 自动兑换结束：${code}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          await failRedeemCodeRedemption(code, message).catch((persistError: unknown) => {
            // eslint-disable-next-line no-console
            console.error('failed to persist auto redeem failure', persistError);
          });
          // eslint-disable-next-line no-console
          console.error(`[${formatLogTime()}] 自动兑换失败：${code}`, error);
        } finally {
          this.autoRedeemQueue.release(code);
        }
      }
    } finally {
      this.options.resumeSourcePolling();
      this.autoRedeemQueueRunning = false;
    }
  }

  private async drainNewAccountRedeemQueue(): Promise<void> {
    if (this.newAccountRedeemQueueRunning) {
      return;
    }

    this.newAccountRedeemQueueRunning = true;
    try {
      while (this.newAccountRedeemQueue.length > 0) {
        const accountIds = this.newAccountRedeemQueue.drainAll();
        try {
          const latestCode = (await listRedeemCodes(50)).find((item) => item.isCurrentlyValid);
          if (!latestCode) {
            // eslint-disable-next-line no-console
            console.log(`新增账号补兑最新兑换码已跳过：未找到兑换码，账号数=${accountIds.length}`);
            continue;
          }

          await this.redeemTaskRunner.run(async () => {
            await ensureRedeemTokenForAutoRedeem();
            // eslint-disable-next-line no-console
            console.log(`新增账号触发补兑最新兑换码开始：code=${latestCode.code}，账号数=${accountIds.length}`);
            const summary = await this.runWithConsoleProgress(
              `新增账号补兑 ${latestCode.code}`,
              () =>
                runTargetAccountsRedeemWithSingleFailureRetry(
                  this.options.redeemService,
                  latestCode.code,
                  accountIds
                )
            );
            // eslint-disable-next-line no-console
            console.log(
              `新增账号触发补兑最新兑换码完成：code=${latestCode.code}，已处理=${summary.processed}，失败=${summary.failureCount}`
            );
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('新增账号触发补兑最新兑换码失败', error);
        } finally {
          for (const accountId of accountIds) {
            this.newAccountRedeemQueue.release(accountId);
          }
        }
      }
    } finally {
      this.newAccountRedeemQueueRunning = false;
    }
  }
}
