export const ACCOUNT_STATUS = {
  pending: 0,
  redeemed: 1,
  failed: 2
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export interface AccountRow {
  accountId: string;
  name: string;
  kid: string;
  groupId: string;
  groupName: string;
  groupPriority: number;
  groupSortOrder: number;
  status: AccountStatus;
  blacklisted: boolean;
  deleted: boolean;
  details: Record<string, unknown>;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface NewAccountInput {
  accountId: string;
  name: string;
  details: Record<string, unknown>;
}

export type AccountBackupAccountRow = Omit<AccountRow, 'groupName' | 'groupPriority' | 'groupSortOrder' | 'deleted'>;
export type AccountBackupGroupRow = AccountGroupRow;

export interface AccountBackupPayload {
  type: 'bbwg-account-backup';
  schemaVersion: 1;
  exportedAt: number;
  accountGroups: AccountBackupGroupRow[];
  accounts: AccountBackupAccountRow[];
}

export interface AccountGroupRow {
  groupId: string;
  name: string;
  priority: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface VisitorLogInput {
  ipAddress: string;
  method: string;
  protocol: string;
  host: string;
  path: string;
  query: string;
  params: string;
  headers: string;
  body: string;
  statusCode: number;
  durationMs: number;
  username: string;
  userRole: string;
  userAgent: string;
  referer: string;
  cfRay: string;
  cfCountry: string;
  blocked: boolean;
  blockReason: string;
  createdAt: number;
}

export interface VisitorLogRow extends VisitorLogInput {
  id: number;
}

export interface BlacklistEntry {
  ipAddress: string;
  reason: string;
  createdAt: number;
  updatedAt: number;
}

export interface RedeemCodeInput {
  code: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  summary: string;
  content: string;
  publishedAt: number;
}

export type RedeemCodeValidityType = 'permanent' | 'timed';
export type RedeemAccountResultStatus = 'success' | 'received' | 'level_limited' | 'failed';

export interface RedeemCodeManageInput {
  code: string;
  validityType: RedeemCodeValidityType;
  validFrom?: number;
  validUntil?: number;
  minLevel?: number;
  note?: string;
}

export interface RedeemCodeRow extends RedeemCodeInput {
  firstSeenAt: number;
  lastSeenAt: number;
  validityType: RedeemCodeValidityType;
  validFrom?: number;
  validUntil?: number;
  minLevel?: number;
  note: string;
  createdAt: number;
  updatedAt: number;
  isCurrentlyValid: boolean;
  invalidReason?: string;
  failedAccountIds: string[];
  failedAccounts: Array<{
    accountId: string;
    name: string;
    groupName: string;
    level?: number;
  }>;
  autoRedeemStatus?: RedeemCodeRedemptionStatus;
  autoRedeemStartedAt?: number;
  autoRedeemCompletedAt?: number;
  autoRedeemLastError?: string;
}

export interface AccountMissingRedeemCodeRow {
  code: string;
  title: string;
  note: string;
  sourceId: string;
  minLevel?: number;
  validFrom?: number;
  validUntil?: number;
  lastTriedAt?: number;
  lastResultStatus?: RedeemAccountResultStatus;
  lastResultMessage?: string;
  missingReason: string;
  canRedeem: boolean;
}

export type RedeemCodeRedemptionStatus = 'running' | 'completed' | 'failed';

export interface RedeemCodeRedemptionSummaryInput {
  total: number;
  processed: number;
  successCount: number;
  receivedCount: number;
  failureCount: number;
  remaining: number;
  failedAccountIds: string[];
}

export interface WechatArticleInput {
  aid: string;
  title: string;
  link: string;
  author: string;
  fakeid: string;
  digest: string;
  cover: string;
  publishedAt: number;
  updatedAt: number;
}

export interface WechatArticleDetailInput {
  aid: string;
  html: string;
  text: string;
  fetchStatus: 'ok' | 'failed';
  fetchError: string;
}
