import { getDb } from './dbConnection.js';
import { listAccountsByIdsIncludingDeleted } from './accountRepository.js';
import type {
  RedeemCodeInput,
  RedeemCodeManageInput,
  RedeemCodeRedemptionSummaryInput,
  RedeemCodeRow,
  RedeemCodeValidityType
} from './dbTypes.js';

type RedeemCodeSelectRow = {
  code: string;
  source_id: string;
  source_url: string;
  title: string;
  summary: string;
  content: string;
  published_at: number;
  first_seen_at: number;
  last_seen_at: number;
  validity_type: string;
  valid_from: number;
  valid_until: number;
  min_level: number;
  note: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  auto_redeem_status?: string | null;
  auto_redeem_started_at?: number | null;
  auto_redeem_completed_at?: number | null;
  auto_redeem_last_error?: string | null;
  failed_account_ids?: string | null;
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeValidityType(value: string): RedeemCodeValidityType {
  return value === 'timed' ? 'timed' : 'permanent';
}

function normalizeTimestamp(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function normalizeLevel(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function parseFailedAccountIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return Array.from(new Set(parsed.map((item) => String(item).trim()).filter(Boolean)));
  } catch {
    return [];
  }
}

function resolveValidity(
  validityType: RedeemCodeValidityType,
  validFrom: number | undefined,
  validUntil: number | undefined
): { isCurrentlyValid: boolean; invalidReason?: string } {
  const now = Date.now();
  if (validityType === 'timed') {
    if (validFrom && now < validFrom) {
      return { isCurrentlyValid: false, invalidReason: '未到生效时间' };
    }
    if (validUntil && now > validUntil) {
      return { isCurrentlyValid: false, invalidReason: '已过期' };
    }
  }

  return { isCurrentlyValid: true };
}

function toRedeemCodeRow(row: RedeemCodeSelectRow): RedeemCodeRow {
  const validityType = normalizeValidityType(row.validity_type);
  const validFrom = normalizeTimestamp(row.valid_from);
  const validUntil = normalizeTimestamp(row.valid_until);
  const minLevel = normalizeLevel(row.min_level);
  const validity = resolveValidity(validityType, validFrom, validUntil);
  const failedAccountIds = parseFailedAccountIds(row.failed_account_ids);

  return {
    code: row.code,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    title: row.title,
    summary: row.summary,
    content: row.content,
    publishedAt: row.published_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    validityType,
    validFrom,
    validUntil,
    minLevel,
    note: row.note,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isCurrentlyValid: validity.isCurrentlyValid,
    invalidReason: validity.invalidReason,
    failedAccountIds,
    failedAccounts: [],
    autoRedeemStatus:
      row.auto_redeem_status === 'running' || row.auto_redeem_status === 'completed' || row.auto_redeem_status === 'failed'
        ? row.auto_redeem_status
        : undefined,
    autoRedeemStartedAt: row.auto_redeem_started_at ?? undefined,
    autoRedeemCompletedAt: row.auto_redeem_completed_at ?? undefined,
    autoRedeemLastError: row.auto_redeem_last_error ?? undefined
  };
}

function normalizeManagedInput(input: RedeemCodeManageInput): RedeemCodeManageInput {
  const normalizedCode = normalizeCode(input.code);
  const validityType = input.validityType === 'timed' ? 'timed' : 'permanent';
  const validFrom = normalizeTimestamp(input.validFrom);
  const validUntil = normalizeTimestamp(input.validUntil);
  const minLevel = normalizeLevel(input.minLevel);
  const note = (input.note ?? '').trim();

  if (!normalizedCode) {
    throw new Error('兑换码不能为空');
  }

  if (validityType === 'timed') {
    if (!validFrom || !validUntil) {
      throw new Error(`兑换码 ${normalizedCode} 需要设置开始和结束时间`);
    }
    if (validUntil <= validFrom) {
      throw new Error(`兑换码 ${normalizedCode} 的结束时间必须晚于开始时间`);
    }
  }

  return {
    code: normalizedCode,
    validityType,
    validFrom: validityType === 'timed' ? validFrom : undefined,
    validUntil: validityType === 'timed' ? validUntil : undefined,
    minLevel,
    note
  };
}

function normalizeSourceInput(item: RedeemCodeInput): RedeemCodeInput {
  return {
    ...item,
    code: normalizeCode(item.code),
    sourceId: item.sourceId.trim(),
    sourceUrl: item.sourceUrl.trim(),
    title: item.title.trim(),
    summary: item.summary.trim(),
    content: item.content.trim()
  };
}

const REDEEM_CODE_SELECT = `
  SELECT
    redeem_codes.*,
    redeem_code_redemptions.status AS auto_redeem_status,
    redeem_code_redemptions.started_at AS auto_redeem_started_at,
    redeem_code_redemptions.completed_at AS auto_redeem_completed_at,
    redeem_code_redemptions.last_error AS auto_redeem_last_error,
    redeem_code_redemptions.failed_account_ids AS failed_account_ids
  FROM redeem_codes
  LEFT JOIN redeem_code_redemptions ON redeem_code_redemptions.code = redeem_codes.code
`;

async function attachFailedAccounts(rows: RedeemCodeRow[]): Promise<RedeemCodeRow[]> {
  const allFailedAccountIds = Array.from(new Set(rows.flatMap((row) => row.failedAccountIds)));
  if (allFailedAccountIds.length === 0) {
    return rows;
  }

  const accounts = await listAccountsByIdsIncludingDeleted(allFailedAccountIds, { includeBlacklisted: true });
  const accountMap = new Map(
    accounts.map((account) => [
      account.accountId,
      {
        accountId: account.accountId,
        name: account.name?.trim() || account.accountId,
        groupName: account.groupName?.trim() || '未分组',
        level: normalizeLevel(account.details?.stove_lv)
      }
    ])
  );

  return rows.map((row) => ({
    ...row,
    failedAccounts: row.failedAccountIds.map((accountId) => {
      const account = accountMap.get(accountId);
      return (
        account ?? {
          accountId,
          name: accountId,
          groupName: '未知',
          level: undefined
        }
      );
    })
  }));
}

export async function upsertRedeemCodes(
  codes: RedeemCodeInput[],
  actorUsername?: string
): Promise<{ inserted: number; updated: number; insertedCodes: string[] }> {
  const normalized = Array.from(
    new Map(
      codes.map(normalizeSourceInput).filter((item) => item.code).map((item) => [item.code, item])
    ).values()
  );

  if (normalized.length === 0) {
    return { inserted: 0, updated: 0, insertedCodes: [] };
  }

  const db = await getDb();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.exec('BEGIN');
  try {
    let inserted = 0;
    let updated = 0;
    const insertedCodes: string[] = [];
    const now = Date.now();
    const placeholders = normalized.map(() => '?').join(',');
    const existingRows = await db.all<{ code: string }[]>(
      `SELECT code FROM redeem_codes WHERE code IN (${placeholders})`,
      normalized.map((item) => item.code)
    );
    const existingCodes = new Set(existingRows.map((row) => row.code));

    for (const item of normalized) {
      await db.run(
        `INSERT INTO redeem_codes (
          code,
          source_id,
          source_url,
          title,
          summary,
          content,
          published_at,
          first_seen_at,
          last_seen_at,
          validity_type,
          valid_from,
          valid_until,
          min_level,
          note,
          created_by,
          updated_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'permanent', 0, 0, 0, '', ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          source_id = excluded.source_id,
          source_url = excluded.source_url,
          title = excluded.title,
          summary = excluded.summary,
          content = excluded.content,
          published_at = excluded.published_at,
          last_seen_at = excluded.last_seen_at,
          created_by = CASE
            WHEN TRIM(redeem_codes.created_by) = '' THEN excluded.created_by
            ELSE redeem_codes.created_by
          END,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`,
        item.code,
        item.sourceId,
        item.sourceUrl,
        item.title,
        item.summary,
        item.content,
        item.publishedAt,
        now,
        now,
        normalizedActorUsername,
        normalizedActorUsername,
        now,
        now
      );

      if (existingCodes.has(item.code)) {
        updated += 1;
      } else {
        inserted += 1;
        insertedCodes.push(item.code);
      }
    }

    await db.exec('COMMIT');
    return { inserted, updated, insertedCodes };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function createManagedRedeemCodes(
  inputs: RedeemCodeManageInput[],
  actorUsername?: string
): Promise<{ inserted: number; updated: number; codes: string[] }> {
  const normalized = Array.from(
    new Map(inputs.map(normalizeManagedInput).map((item) => [item.code, item])).values()
  );

  if (normalized.length === 0) {
    return { inserted: 0, updated: 0, codes: [] };
  }

  const db = await getDb();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.exec('BEGIN');
  try {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const item of normalized) {
      const existing = await db.get<{ code: string }>('SELECT code FROM redeem_codes WHERE code = ?', item.code);
      const managedTitle = '手动录入兑换码';

      await db.run(
        `INSERT INTO redeem_codes (
          code,
          source_id,
          source_url,
          title,
          summary,
          content,
          published_at,
          first_seen_at,
          last_seen_at,
          validity_type,
          valid_from,
          valid_until,
          min_level,
          note,
          created_by,
          updated_by,
          created_at,
          updated_at
        ) VALUES (?, 'manual', '', ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          validity_type = excluded.validity_type,
          valid_from = excluded.valid_from,
          valid_until = excluded.valid_until,
          min_level = excluded.min_level,
          note = excluded.note,
          title = CASE
            WHEN redeem_codes.title = '' OR redeem_codes.title = '手动录入兑换码' THEN excluded.title
            ELSE redeem_codes.title
          END,
          source_id = CASE
            WHEN redeem_codes.source_id = '' THEN 'manual'
            ELSE redeem_codes.source_id
          END,
          created_by = CASE
            WHEN TRIM(redeem_codes.created_by) = '' THEN excluded.created_by
            ELSE redeem_codes.created_by
          END,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`,
        item.code,
        managedTitle,
        now,
        now,
        now,
        item.validityType,
        item.validFrom ?? 0,
        item.validUntil ?? 0,
        item.minLevel ?? 0,
        item.note ?? '',
        normalizedActorUsername,
        normalizedActorUsername,
        now,
        now
      );

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    await db.exec('COMMIT');
    return {
      inserted,
      updated,
      codes: normalized.map((item) => item.code)
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function listRedeemCodes(limit = 50): Promise<RedeemCodeRow[]> {
  const db = await getDb();
  const rows = await db.all<RedeemCodeSelectRow[]>(
    `${REDEEM_CODE_SELECT}
     ORDER BY redeem_codes.published_at DESC, redeem_codes.last_seen_at DESC, redeem_codes.created_at DESC
     LIMIT ?`,
    Math.max(1, Math.min(limit, 500))
  );
  return attachFailedAccounts(rows.map(toRedeemCodeRow));
}

export async function getRedeemCodeByCode(code: string): Promise<RedeemCodeRow | null> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return null;
  }

  const db = await getDb();
  const row = await db.get<RedeemCodeSelectRow>(
    `${REDEEM_CODE_SELECT}
     WHERE redeem_codes.code = ?`,
    normalizedCode
  );
  if (!row) {
    return null;
  }
  const [withAccounts] = await attachFailedAccounts([toRedeemCodeRow(row)]);
  return withAccounts ?? null;
}

export async function deleteRedeemCode(code: string): Promise<boolean> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return false;
  }

  const db = await getDb();
  await db.exec('BEGIN');
  try {
    const redemptionResult = await db.run('DELETE FROM redeem_code_redemptions WHERE code = ?', normalizedCode);
    const codeResult = await db.run('DELETE FROM redeem_codes WHERE code = ?', normalizedCode);
    await db.exec('COMMIT');
    return ((codeResult.changes ?? 0) + (redemptionResult.changes ?? 0)) > 0;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function ensureRedeemCodeExists(code: string, actorUsername?: string): Promise<void> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return;
  }

  const db = await getDb();
  const now = Date.now();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.run(
    `INSERT OR IGNORE INTO redeem_codes (
      code,
      source_id,
      source_url,
      title,
      summary,
      content,
      published_at,
      first_seen_at,
      last_seen_at,
      validity_type,
      valid_from,
      valid_until,
      min_level,
      note,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) VALUES (?, 'manual', '', '手动录入兑换码', '', '', ?, ?, ?, 'permanent', 0, 0, 0, '', ?, ?, ?, ?)`,
    normalizedCode,
    now,
    now,
    now,
    normalizedActorUsername,
    normalizedActorUsername,
    now,
    now
  );
}

export async function reserveRedeemCodeRedemption(code: string, actorUsername?: string): Promise<boolean> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return false;
  }

  const db = await getDb();
  const now = Date.now();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  const result = await db.run(
    `INSERT OR IGNORE INTO redeem_code_redemptions (
      code,
      status,
      created_by,
      updated_by,
      started_at,
      updated_at
    ) VALUES (?, 'running', ?, ?, ?, ?)`,
    normalizedCode,
    normalizedActorUsername,
    normalizedActorUsername,
    now,
    now
  );

  return (result.changes ?? 0) > 0;
}

export async function completeRedeemCodeRedemption(
  code: string,
  summary: RedeemCodeRedemptionSummaryInput,
  actorUsername?: string
): Promise<void> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return;
  }

  const db = await getDb();
  const now = Date.now();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.run(
    `UPDATE redeem_code_redemptions
     SET status = 'completed',
         total = ?,
         processed = ?,
         success_count = ?,
         received_count = ?,
         failure_count = ?,
         failed_account_ids = ?,
         remaining = ?,
         completed_at = ?,
         last_error = '',
         updated_by = ?,
         updated_at = ?
     WHERE code = ?`,
    summary.total,
    summary.processed,
    summary.successCount,
    summary.receivedCount,
    summary.failureCount,
    JSON.stringify(Array.isArray(summary.failedAccountIds) ? summary.failedAccountIds : []),
    summary.remaining,
    now,
    normalizedActorUsername,
    now,
    normalizedCode
  );
}

export async function failRedeemCodeRedemption(code: string, error: string, actorUsername?: string): Promise<void> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return;
  }

  const db = await getDb();
  const now = Date.now();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.run(
    `UPDATE redeem_code_redemptions
     SET status = 'failed',
         completed_at = ?,
         last_error = ?,
         updated_by = ?,
         updated_at = ?
     WHERE code = ?`,
    now,
    error.trim(),
    normalizedActorUsername,
    now,
    normalizedCode
  );
}
