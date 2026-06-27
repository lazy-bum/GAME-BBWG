import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './core/dbConnection.js';
import { ActiveRedeemCodeSource } from './sources/activeRedeemCodeSource.js';
import { AccountImportService } from './services/accountImport.js';
import { AccountBackupService } from './services/accountBackup.js';
import { AutoRedeemCoordinator } from './services/autoRedeem.js';
import { RedeemService } from './services/redeem.js';
import { AuthService } from './server/auth.js';
import { startVisitorLogCleanup, VISITOR_LOG_RETENTION_DAYS } from './server/maintenance.js';
import { registerApiRoutes } from './server/routes.js';
import { SseHub } from './server/sse.js';
import { createVisitorAuditMiddleware, createVisitorBlacklistMiddleware } from './server/visitorMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const redeemService = new RedeemService();
const accountImportService = new AccountImportService();
const accountBackupService = new AccountBackupService();
const sseHub = new SseHub();
const redeemCodeSource = new ActiveRedeemCodeSource(process.argv.includes('--wechat'), {
  forceWechatLogin: process.argv.includes('--force-wechat-login')
});

const authService = new AuthService({
  sessionSecret: process.env.SESSION_SECRET?.trim() || 'bbwg-dev-session-secret'
});

const autoRedeemCoordinator = new AutoRedeemCoordinator({
  redeemService,
  pauseSourcePolling: () => redeemCodeSource.pause(),
  resumeSourcePolling: () => redeemCodeSource.resume()
});

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(createVisitorAuditMiddleware(authService));
app.use(createVisitorBlacklistMiddleware());
app.use(
  '/.well-known',
  express.static(path.resolve(__dirname, '../.well-known'), {
    dotfiles: 'allow'
  })
);
app.use(
  express.static(path.resolve(__dirname, '../public'), {
    maxAge: '5m',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

redeemService.on('progress', (payload) => {
  sseHub.broadcastRedeemProgress(payload);
});

registerApiRoutes({
  app,
  authService,
  redeemService,
  accountImportService,
  accountBackupService,
  autoRedeemCoordinator,
  sseHub,
  pollActiveRedeemCodeSource: () => redeemCodeSource.poll(),
  visitorLogRetentionDays: VISITOR_LOG_RETENTION_DAYS
});

app.get('*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

const port = Number(process.env.PORT || 3458);

void getDb()
  .then(async () => {
    await redeemCodeSource.initialize();
    redeemCodeSource.start(autoRedeemCoordinator);
    startVisitorLogCleanup();

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`bb-web is running at http://localhost:${port}`);
    });
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('failed to start bb-web', error);
    process.exitCode = 1;
  });
