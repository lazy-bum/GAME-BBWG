import { listAccountsByIdsIncludingDeleted } from './accountRepository.js';
import { ensureAccountMissingBaselineCreatedAt } from './config.js';
import { getDb } from './dbConnection.js';
import type { AccountMissingRedeemCodeRow, RedeemAccountResultStatus } from './dbTypes.js';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim();
}

function normalizeStatus(status: string): RedeemAccountResultStatus {
  if (status === 'success' || status === 'received' || status === 'level_limited') {
    return status;
  }
  return 'failed';
}

export async function upsertRedeemAccountResult(input: {
  code: string;
  accountId: string;
  status: RedeemAccountResultStatus;
  message: string;
  attemptedAt?: number;
  updatedBy?: string;
}): Promise<void> {
  const code = normalizeCode(input.code);
  const accountId = normalizeAccountId(input.accountId);
  if (!code || !accountId) {
    return;
  }

  const db = await getDb();
  const attemptedAt = input.attemptedAt ?? Date.now();
  const updatedBy = input.updatedBy?.trim() || 'system';
  await db.run(
    `INSERT INTO redeem_account_results (
      code,
      account_id,
      status,
      message,
      updated_by,
      attempted_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code, account_id) DO UPDATE SET
      status = excluded.status,
      message = excluded.message,
      updated_by = excluded.updated_by,
      attempted_at = excluded.attempted_at`,
    code,
    accountId,
    input.status,
    input.message.trim(),
    updatedBy,
    attemptedAt
  );
}

export async function listMissingRedeemCodesForAccount(accountId: string): Promise<AccountMissingRedeemCodeRow[]> {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) {
    return [];
  }

  const account = (
    await listAccountsByIdsIncludingDeleted([normalizedAccountId], {
      includeBlacklisted: true
    })
  )[0];
  if (!account || account.deleted || account.blacklisted) {
    return [];
  }

  const accountLevel = Number(account.details?.stove_lv);
  const resolvedLevel = Number.isFinite(accountLevel) && accountLevel > 0 ? Math.trunc(accountLevel) : 0;
  const db = await getDb();
  const latestExistingRedeemCodeRow = await db.get<{ value: number }>('SELECT COALESCE(MAX(created_at), 0) AS value FROM redeem_codes');
  const baselineCreatedAt = ensureAccountMissingBaselineCreatedAt(latestExistingRedeemCodeRow?.value ?? 0);

  const rows = await db.all<
    Array<{
      code: string;
      title: string;
      note: string;
      source_id: string;
      min_level: number;
      valid_from: number;
      valid_until: number;
      validity_type: string;
      created_at: number;
      result_status?: string | null;
      result_message?: string | null;
      attempted_at?: number | null;
    }>
  >(
    `SELECT
       rc.code,
       rc.title,
       rc.note,
       rc.source_id,
       rc.min_level,
       rc.valid_from,
       rc.valid_until,
       rc.validity_type,
       rc.created_at,
       rar.status AS result_status,
       rar.message AS result_message,
       rar.attempted_at AS attempted_at
     FROM redeem_codes rc
     LEFT JOIN redeem_account_results rar
       ON rar.code = rc.code AND rar.account_id = ?
     ORDER BY rc.published_at DESC, rc.last_seen_at DESC, rc.created_at DESC`,
    normalizedAccountId
  );

  const now = Date.now();
  return rows
    .map((row) => {
      const minLevel = Number.isFinite(row.min_level) && row.min_level > 0 ? Math.trunc(row.min_level) : undefined;
      const validFrom = Number.isFinite(row.valid_from) && row.valid_from > 0 ? Math.trunc(row.valid_from) : undefined;
      const validUntil = Number.isFinite(row.valid_until) && row.valid_until > 0 ? Math.trunc(row.valid_until) : undefined;
      const createdAt = Number.isFinite(row.created_at) && row.created_at > 0 ? Math.trunc(row.created_at) : 0;
      const lastResultStatus = row.result_status ? normalizeStatus(row.result_status) : undefined;

      let missingReason = '';
      let canRedeem = true;

      if (row.validity_type === 'timed' && validFrom && now < validFrom) {
        missingReason = '未到生效时间';
        canRedeem = false;
      } else if (row.validity_type === 'timed' && validUntil && now > validUntil) {
        missingReason = '兑换码已过期';
        canRedeem = false;
      } else if (minLevel && resolvedLevel < minLevel) {
        missingReason = `等级不足，需 Lv.${minLevel}`;
        canRedeem = false;
      } else if (lastResultStatus === 'success' || lastResultStatus === 'received' || lastResultStatus === 'level_limited') {
        missingReason = '';
        canRedeem = false;
      } else if (lastResultStatus === 'failed') {
        missingReason = row.result_message?.trim() || '上次兑换失败';
      } else if (createdAt > 0 && createdAt <= baselineCreatedAt) {
        missingReason = '';
        canRedeem = false;
      } else {
        missingReason = '尚未兑换';
      }

      return {
        code: row.code,
        title: row.title,
        note: row.note,
        sourceId: row.source_id,
        minLevel,
        validFrom,
        validUntil,
        lastTriedAt: row.attempted_at ?? undefined,
        lastResultStatus,
        lastResultMessage: row.result_message?.trim() || undefined,
        missingReason,
        canRedeem
      };
    })
    .filter((row) => row.missingReason);
}
