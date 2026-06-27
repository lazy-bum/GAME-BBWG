export interface RedeemSummary {
  total: number;
  processed: number;
  successCount: number;
  receivedCount: number;
  failureCount: number;
  remaining: number;
  resetTriggered: boolean;
  failedAccountIds: string[];
}

export interface MultiRedeemCodeSummary {
  giftCode: string;
  summary: RedeemSummary;
}

export interface MultiRedeemSummary {
  totalCodes: number;
  processedCodes: number;
  summaries: MultiRedeemCodeSummary[];
}

export interface RedeemProgressPayload {
  type: 'start' | 'log' | 'progress' | 'done';
  level?: 'info' | 'warn' | 'error' | 'success';
  message?: string;
  processed?: number;
  total?: number;
  summary?: RedeemSummary;
  currentCode?: string;
  currentCodeIndex?: number;
  totalCodes?: number;
}

export interface RedeemRunOptions {
  includeAllAccounts?: boolean;
  includeTargetAccounts?: boolean;
  initialDelayMs?: number;
  autoRetryFailedOnce?: boolean;
  minLevel?: number;
}

export interface ApiEnvelope {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
}
