import type { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { getDb } from './dbConnection.js';
import {
  ACCOUNT_STATUS,
  type AccountBackupAccountRow,
  type AccountStatus,
  type AccountRow,
  type NewAccountInput
} from './dbTypes.js';

function toAccountRow(row: {
  account_id: string;
  name: string;
  kid: string;
  group_id?: string | null;
  group_name?: string | null;
  group_priority?: number | null;
  group_sort_order?: number | null;
  status: number;
  is_blacklisted: number;
  is_deleted: number;
  details: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}): AccountRow {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(row.details || '{}') as Record<string, unknown>;
  } catch {
    details = {};
  }

  return {
    accountId: row.account_id,
    name: row.name,
    kid: row.kid,
    groupId: row.group_id ?? '',
    groupName: row.group_name ?? '',
    groupPriority: row.group_priority ?? 0,
    groupSortOrder: row.group_sort_order ?? 0,
    status: row.status as AccountStatus,
    blacklisted: row.is_blacklisted === 1,
    deleted: row.is_deleted === 1,
    details,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getNextSortOrder(db: Database<sqlite3.Database, sqlite3.Statement>): Promise<number> {
  const row = await db.get<{ value: number }>('SELECT COALESCE(MAX(sort_order), 0) as value FROM accounts');
  return (row?.value ?? 0) + 1;
}

function extractAccountKid(details: Record<string, unknown>): string {
  const kid = details.kid;
  if (typeof kid === 'number' && Number.isFinite(kid)) {
    return String(kid);
  }
  if (typeof kid === 'string') {
    return kid.trim();
  }
  return '';
}

export async function getExistingAccountIds(accountIds: string[]): Promise<Set<string>> {
  const normalized = Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    return new Set();
  }

  const db = await getDb();
  const placeholders = normalized.map(() => '?').join(',');
  const existing = await db.all<{ account_id: string }[]>(
    `SELECT account_id FROM accounts WHERE account_id IN (${placeholders}) AND is_deleted = 0`,
    normalized
  );

  return new Set(existing.map((item) => item.account_id));
}

export async function createAccountsBatch(accounts: NewAccountInput[]): Promise<{ inserted: number; insertedAccountIds: string[] }> {
  const normalized = Array.from(
    new Map(
      accounts
        .map((account) => ({
          accountId: account.accountId.trim(),
          name: account.name.trim(),
          kid: extractAccountKid(account.details ?? {}),
          details: account.details ?? {}
        }))
        .filter((account) => account.accountId)
        .map((account) => [account.accountId, account])
    ).values()
  );
  if (normalized.length === 0) {
    return { inserted: 0, insertedAccountIds: [] };
  }

  const db = await getDb();
  await db.exec('BEGIN');
  try {
    let nextSortOrder = await getNextSortOrder(db);
    const existingRows = await db.all<{ account_id: string; is_deleted: number }[]>(
      `SELECT account_id, is_deleted FROM accounts WHERE account_id IN (${normalized.map(() => '?').join(',')})`,
      normalized.map((account) => account.accountId)
    );
    const existingMap = new Map(existingRows.map((row) => [row.account_id, row]));
    let inserted = 0;
    const insertedAccountIds: string[] = [];

    for (const account of normalized) {
      const now = Date.now();
      const existing = existingMap.get(account.accountId);

      if (existing?.is_deleted === 1) {
        await db.run(
          `UPDATE accounts
           SET name = ?, kid = ?, status = ?, is_blacklisted = 0, is_deleted = 0, details = ?, sort_order = ?, updated_at = ?
           WHERE account_id = ?`,
          account.name,
          account.kid,
          ACCOUNT_STATUS.pending,
          JSON.stringify(account.details),
          nextSortOrder,
          now,
          account.accountId
        );
        nextSortOrder += 1;
        inserted += 1;
        insertedAccountIds.push(account.accountId);
        continue;
      }

      if (existing) {
        continue;
      }

      await db.run(
        `INSERT INTO accounts (account_id, name, kid, status, is_blacklisted, is_deleted, details, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
        account.accountId,
        account.name,
        account.kid,
        ACCOUNT_STATUS.pending,
        JSON.stringify(account.details),
        nextSortOrder,
        now,
        now
      );
      nextSortOrder += 1;
      inserted += 1;
      insertedAccountIds.push(account.accountId);
    }
    await db.exec('COMMIT');

    return {
      inserted,
      insertedAccountIds
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

const ACCOUNT_SELECT = `
  SELECT
    a.*,
    g.name as group_name,
    g.priority as group_priority,
    g.sort_order as group_sort_order
  FROM accounts a
  LEFT JOIN account_groups g ON g.group_id = a.group_id
`;

const ACCOUNT_REDEEM_ORDER = `
  ORDER BY
    CASE WHEN g.group_id IS NULL THEN 1 ELSE 0 END ASC,
    COALESCE(g.priority, 0) DESC,
    COALESCE(g.sort_order, 0) ASC,
    a.sort_order ASC,
    a.created_at ASC
`;

export async function listAccounts(): Promise<AccountRow[]> {
  const db = await getDb();
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(`${ACCOUNT_SELECT} WHERE a.is_blacklisted = 0 AND a.is_deleted = 0 ${ACCOUNT_REDEEM_ORDER}`);
  return rows.map(toAccountRow);
}

export async function listAccountsForBackup(): Promise<AccountBackupAccountRow[]> {
  const db = await getDb();
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(`${ACCOUNT_SELECT} WHERE a.is_deleted = 0 ORDER BY a.sort_order ASC, a.created_at ASC`);

  return rows.map((row) => {
    const account = toAccountRow(row);
    return {
      accountId: account.accountId,
      name: account.name,
      kid: account.kid,
      groupId: account.groupId,
      status: account.status,
      blacklisted: account.blacklisted,
      details: account.details,
      sortOrder: account.sortOrder,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  });
}

export async function listBlacklistedAccounts(): Promise<AccountRow[]> {
  const db = await getDb();
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(`${ACCOUNT_SELECT} WHERE a.is_blacklisted = 1 AND a.is_deleted = 0 ORDER BY a.updated_at DESC, a.sort_order ASC, a.created_at ASC`);
  return rows.map(toAccountRow);
}

export async function listAccountsByStatus(status: AccountStatus): Promise<AccountRow[]> {
  const db = await getDb();
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(
    `${ACCOUNT_SELECT} WHERE a.status = ? AND a.is_blacklisted = 0 AND a.is_deleted = 0 ${ACCOUNT_REDEEM_ORDER}`,
    status
  );
  return rows.map(toAccountRow);
}

export async function listAccountsByIds(accountIds: string[], options?: { includeBlacklisted?: boolean }): Promise<AccountRow[]> {
  if (accountIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const placeholders = accountIds.map(() => '?').join(',');
  const includeBlacklisted = options?.includeBlacklisted ?? false;
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(
    `${ACCOUNT_SELECT} WHERE a.account_id IN (${placeholders})${
      includeBlacklisted ? '' : ' AND a.is_blacklisted = 0'
    } AND a.is_deleted = 0 ${ACCOUNT_REDEEM_ORDER}`,
    accountIds
  );

  return rows.map(toAccountRow);
}

export async function listAccountsByIdsIncludingDeleted(
  accountIds: string[],
  options?: { includeBlacklisted?: boolean }
): Promise<AccountRow[]> {
  if (accountIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const placeholders = accountIds.map(() => '?').join(',');
  const includeBlacklisted = options?.includeBlacklisted ?? false;
  const rows = await db.all<
    {
      account_id: string;
      name: string;
      kid: string;
      group_id: string;
      group_name: string | null;
      group_priority: number | null;
      group_sort_order: number | null;
      status: number;
      is_blacklisted: number;
      is_deleted: number;
      details: string;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }[]
  >(
    `${ACCOUNT_SELECT} WHERE a.account_id IN (${placeholders})${
      includeBlacklisted ? '' : ' AND a.is_blacklisted = 0'
    } ${ACCOUNT_REDEEM_ORDER}`,
    accountIds
  );

  return rows.map(toAccountRow);
}

export async function reorderAccounts(accountIds: string[]): Promise<void> {
  const normalized = Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    return;
  }

  const db = await getDb();
  await db.exec('BEGIN');
  try {
    const now = Date.now();
    for (let index = 0; index < normalized.length; index += 1) {
      await db.run(
        'UPDATE accounts SET sort_order = ?, updated_at = ? WHERE account_id = ? AND is_deleted = 0',
        index + 1,
        now,
        normalized[index]
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function assignAccountsToGroup(accountIds: string[], groupId: string): Promise<number> {
  const normalizedAccountIds = Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));
  const normalizedGroupId = groupId.trim();
  if (normalizedAccountIds.length === 0) {
    return 0;
  }

  const db = await getDb();
  if (normalizedGroupId) {
    const group = await db.get<{ group_id: string }>('SELECT group_id FROM account_groups WHERE group_id = ?', normalizedGroupId);
    if (!group) {
      throw new Error('分组不存在');
    }
  }

  const placeholders = normalizedAccountIds.map(() => '?').join(',');
  const result = await db.run(
    `UPDATE accounts SET group_id = ?, updated_at = ? WHERE account_id IN (${placeholders}) AND is_deleted = 0`,
    [normalizedGroupId, Date.now(), ...normalizedAccountIds]
  );
  return result.changes ?? 0;
}

export async function countAccountsByStatus(status: AccountStatus): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ value: number }>(
    'SELECT COUNT(*) as value FROM accounts WHERE status = ? AND is_blacklisted = 0 AND is_deleted = 0',
    status
  );
  return row?.value ?? 0;
}

export async function resetAccountsStatus(from: AccountStatus, to: AccountStatus): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    'UPDATE accounts SET status = ?, updated_at = ? WHERE status = ? AND is_blacklisted = 0 AND is_deleted = 0',
    to,
    Date.now(),
    from
  );
  return result.changes ?? 0;
}

export async function updateAccountProfile(
  accountId: string,
  profile: { name: string; details: Record<string, unknown> }
): Promise<void> {
  const db = await getDb();
  await db.run(
    'UPDATE accounts SET name = ?, kid = ?, details = ?, updated_at = ? WHERE account_id = ?',
    profile.name,
    extractAccountKid(profile.details ?? {}),
    JSON.stringify(profile.details ?? {}),
    Date.now(),
    accountId
  );
}

export async function updateAccountStatus(accountId: string, status: AccountStatus): Promise<void> {
  const db = await getDb();
  await db.run(
    'UPDATE accounts SET status = ?, updated_at = ? WHERE account_id = ?',
    status,
    Date.now(),
    accountId
  );
}

export async function forceSetAllAccountsRedeemed(): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    'UPDATE accounts SET status = ?, updated_at = ? WHERE is_blacklisted = 0 AND is_deleted = 0',
    ACCOUNT_STATUS.redeemed,
    Date.now()
  );
  return result.changes ?? 0;
}

export async function setAccountBlacklist(accountId: string, blacklisted: boolean): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    'UPDATE accounts SET is_blacklisted = ?, updated_at = ? WHERE account_id = ? AND is_deleted = 0',
    blacklisted ? 1 : 0,
    Date.now(),
    accountId
  );
  return (result.changes ?? 0) > 0;
}

export async function deleteAccount(accountId: string): Promise<void> {
  const db = await getDb();
  await db.run(
    'UPDATE accounts SET is_deleted = 1, is_blacklisted = 0, updated_at = ? WHERE account_id = ? AND is_deleted = 0',
    Date.now(),
    accountId
  );
}

export async function deleteAllAccounts(): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    'UPDATE accounts SET is_deleted = 1, is_blacklisted = 0, updated_at = ? WHERE is_deleted = 0',
    Date.now()
  );
  return result.changes ?? 0;
}

function normalizeBackupTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return fallback;
}

function normalizeBackupSortOrder(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return fallback;
}

function normalizeBackupAccount(input: AccountBackupAccountRow, index: number): AccountBackupAccountRow | null {
  const accountId = input.accountId?.trim();
  if (!accountId) {
    return null;
  }

  const now = Date.now();
  return {
    accountId,
    name: typeof input.name === 'string' ? input.name.trim() : '',
    kid: typeof input.kid === 'string' ? input.kid.trim() : '',
    groupId: typeof input.groupId === 'string' ? input.groupId.trim() : '',
    status:
      input.status === ACCOUNT_STATUS.redeemed || input.status === ACCOUNT_STATUS.failed
        ? input.status
        : ACCOUNT_STATUS.pending,
    blacklisted: input.blacklisted === true,
    details: input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? input.details : {},
    sortOrder: normalizeBackupSortOrder(input.sortOrder, index + 1),
    createdAt: normalizeBackupTimestamp(input.createdAt, now),
    updatedAt: normalizeBackupTimestamp(input.updatedAt, now)
  };
}

export async function upsertAccountsFromBackup(
  accounts: AccountBackupAccountRow[],
  dbArg?: Database<sqlite3.Database, sqlite3.Statement>
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
}> {
  const normalized = Array.from(
    new Map(
      accounts
        .map((account, index) => normalizeBackupAccount(account, index))
        .filter((account): account is AccountBackupAccountRow => Boolean(account))
        .map((account) => [account.accountId, account])
    ).values()
  );

  if (normalized.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const db = dbArg ?? (await getDb());
  const ownsTransaction = !dbArg;
  if (ownsTransaction) {
    await db.exec('BEGIN');
  }
  try {
    const existingGroupRows = await db.all<{ group_id: string }[]>('SELECT group_id FROM account_groups');
    const existingGroupIds = new Set(existingGroupRows.map((item) => item.group_id));
    const existingRows = await db.all<{ account_id: string }[]>(
      `SELECT account_id FROM accounts WHERE account_id IN (${normalized.map(() => '?').join(',')})`,
      normalized.map((account) => account.accountId)
    );
    const existingIds = new Set(existingRows.map((item) => item.account_id));
    let inserted = 0;
    let updated = 0;

    for (const account of normalized) {
      const details = account.details ?? {};
      const kid = account.kid || extractAccountKid(details);
      const groupId = account.groupId && existingGroupIds.has(account.groupId) ? account.groupId : '';
      if (existingIds.has(account.accountId)) {
        await db.run(
          `UPDATE accounts
           SET name = ?, kid = ?, group_id = ?, status = ?, is_blacklisted = ?, is_deleted = 0, details = ?, sort_order = ?, created_at = ?, updated_at = ?
           WHERE account_id = ?`,
          account.name,
          kid,
          groupId,
          account.status,
          account.blacklisted ? 1 : 0,
          JSON.stringify(details),
          account.sortOrder,
          account.createdAt,
          account.updatedAt,
          account.accountId
        );
        updated += 1;
        continue;
      }

      await db.run(
        `INSERT INTO accounts (account_id, name, kid, group_id, status, is_blacklisted, is_deleted, details, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        account.accountId,
        account.name,
        kid,
        groupId,
        account.status,
        account.blacklisted ? 1 : 0,
        JSON.stringify(details),
        account.sortOrder,
        account.createdAt,
        account.updatedAt
      );
      inserted += 1;
    }

    if (ownsTransaction) {
      await db.exec('COMMIT');
    }
    return {
      inserted,
      updated,
      skipped: accounts.length - normalized.length
    };
  } catch (error) {
    if (ownsTransaction) {
      await db.exec('ROLLBACK');
    }
    throw error;
  }
}
