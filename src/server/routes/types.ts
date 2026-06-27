import type express from 'express';
import type { AccountImportService } from '../../services/accountImport.js';
import type { AccountBackupService } from '../../services/accountBackup.js';
import type { AutoRedeemCoordinator } from '../../services/autoRedeem.js';
import type { RedeemService } from '../../services/redeem.js';
import type { AuthService } from '../auth.js';
import type { SseHub } from '../sse.js';

export interface ApiRouteContext {
  app: express.Express;
  authService: AuthService;
  redeemService: RedeemService;
  autoRedeemCoordinator: AutoRedeemCoordinator;
  accountImportService: AccountImportService;
  accountBackupService: AccountBackupService;
  sseHub: SseHub;
  pollActiveRedeemCodeSource: () => Promise<{ insertedCodes: string[] }>;
  visitorLogRetentionDays: number;
}
