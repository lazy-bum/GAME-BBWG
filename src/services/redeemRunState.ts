import type { RedeemAccountResult } from './redeemAccountProcessor.js';
import type { RedeemSummary } from './redeemTypes.js';

export class RedeemRunState {
  processed = 0;
  successCount = 0;
  receivedCount = 0;
  failureCount = 0;
  private readonly failedAccountIds = new Set<string>();

  constructor(
    readonly total: number,
    readonly resetTriggered: boolean
  ) {}

  markProcessed(): void {
    this.processed += 1;
  }

  applyAccountResult(result: RedeemAccountResult): void {
    this.successCount += result.successCount;
    this.receivedCount += result.receivedCount;
    this.failureCount += result.failureCount;
  }

  markFailedAccount(accountId: string): void {
    this.failedAccountIds.add(accountId);
  }

  toSummary(remaining: number): RedeemSummary {
    return {
      total: this.total,
      processed: this.processed,
      successCount: this.successCount,
      receivedCount: this.receivedCount,
      failureCount: this.failureCount,
      remaining,
      resetTriggered: this.resetTriggered,
      failedAccountIds: Array.from(this.failedAccountIds)
    };
  }
}
