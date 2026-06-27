import type { Database } from 'sqlite';
import { randomUUID } from 'node:crypto';
import { getDb } from './dbConnection.js';
import sqlite3 from 'sqlite3';
import type { AccountBackupGroupRow, AccountGroupRow } from './dbTypes.js';

function toAccountGroupRow(row: {
  group_id: string;
  name: string;
  priority: number;
  sort_order: number;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}): AccountGroupRow {
  return {
    groupId: row.group_id,
    name: row.name,
    priority: row.priority,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getNextSortOrder(): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ value: number }>('SELECT COALESCE(MAX(sort_order), 0) as value FROM account_groups');
  return (row?.value ?? 0) + 1;
}

export async function listAccountGroups(): Promise<AccountGroupRow[]> {
  const db = await getDb();
  const rows = await db.all<
    {
      group_id: string;
      name: string;
      priority: number;
      sort_order: number;
      created_by: string;
      updated_by: string;
      created_at: number;
      updated_at: number;
    }[]
  >('SELECT * FROM account_groups ORDER BY priority DESC, sort_order ASC, created_at ASC');
  return rows.map(toAccountGroupRow);
}

export async function createAccountGroup(input: {
  name: string;
  priority?: number;
  sortOrder?: number;
  actorUsername?: string;
}): Promise<AccountGroupRow> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('请输入分组名称');
  }

  const db = await getDb();
  const now = Date.now();
  const groupId = randomUUID();
  const actorUsername = input.actorUsername?.trim() || 'system';
  const priority = Number.isFinite(input.priority) ? Number(input.priority) : 0;
  const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : await getNextSortOrder();
  await db.run(
    `INSERT INTO account_groups (group_id, name, priority, sort_order, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    groupId,
    name,
    priority,
    sortOrder,
    actorUsername,
    actorUsername,
    now,
    now
  );

  return {
    groupId,
    name,
    priority,
    sortOrder,
    createdBy: actorUsername,
    updatedBy: actorUsername,
    createdAt: now,
    updatedAt: now
  };
}

export async function updateAccountGroup(
  groupId: string,
  input: { name?: string; priority?: number; sortOrder?: number; actorUsername?: string }
): Promise<AccountGroupRow | null> {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return null;
  }

  const current = (await listAccountGroups()).find((group) => group.groupId === normalizedGroupId);
  if (!current) {
    return null;
  }

  const nextName = input.name === undefined ? current.name : input.name.trim();
  if (!nextName) {
    throw new Error('请输入分组名称');
  }

  const nextPriority = Number.isFinite(input.priority) ? Number(input.priority) : current.priority;
  const nextSortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : current.sortOrder;
  const actorUsername = input.actorUsername?.trim() || 'system';
  const now = Date.now();
  const db = await getDb();
  await db.run(
    'UPDATE account_groups SET name = ?, priority = ?, sort_order = ?, updated_by = ?, updated_at = ? WHERE group_id = ?',
    nextName,
    nextPriority,
    nextSortOrder,
    actorUsername,
    now,
    normalizedGroupId
  );

  return {
    ...current,
    name: nextName,
    priority: nextPriority,
    sortOrder: nextSortOrder,
    updatedBy: actorUsername,
    updatedAt: now
  };
}

export async function deleteAccountGroup(groupId: string, actorUsername?: string): Promise<boolean> {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return false;
  }

  const db = await getDb();
  const normalizedActorUsername = actorUsername?.trim() || 'system';
  await db.exec('BEGIN');
  try {
    await db.run(
      'UPDATE accounts SET group_id = ?, updated_by = ?, updated_at = ? WHERE group_id = ?',
      '',
      normalizedActorUsername,
      Date.now(),
      normalizedGroupId
    );
    const result = await db.run('DELETE FROM account_groups WHERE group_id = ?', normalizedGroupId);
    await db.exec('COMMIT');
    return (result.changes ?? 0) > 0;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
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

export async function upsertAccountGroupsFromBackup(
  groups: AccountBackupGroupRow[],
  dbArg?: Database<sqlite3.Database, sqlite3.Statement>,
  actorUsername?: string
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
}> {
  const normalized = Array.from(
    new Map(
      groups
        .map((group, index) => {
          const groupId = group.groupId?.trim();
          const name = group.name?.trim();
          if (!groupId || !name) {
            return null;
          }

          const now = Date.now();
          return [
            groupId,
            {
              groupId,
              name,
              priority: Number.isFinite(group.priority) ? Number(group.priority) : 0,
              sortOrder: normalizeBackupSortOrder(group.sortOrder, index + 1),
              createdBy: typeof group.createdBy === 'string' && group.createdBy.trim() ? group.createdBy.trim() : actorUsername?.trim() || 'system',
              updatedBy: typeof group.updatedBy === 'string' && group.updatedBy.trim() ? group.updatedBy.trim() : actorUsername?.trim() || 'system',
              createdAt: normalizeBackupTimestamp(group.createdAt, now),
              updatedAt: normalizeBackupTimestamp(group.updatedAt, now)
            }
          ] as const;
        })
        .filter((item): item is readonly [string, AccountBackupGroupRow] => Boolean(item))
    ).values()
  );

  if (normalized.length === 0) {
    return { inserted: 0, updated: 0, skipped: groups.length };
  }

  const db = dbArg ?? (await getDb());
  const ownsTransaction = !dbArg;
  if (ownsTransaction) {
    await db.exec('BEGIN');
  }
  try {
    const existingRows = await db.all<{ group_id: string }[]>(
      `SELECT group_id FROM account_groups WHERE group_id IN (${normalized.map(() => '?').join(',')})`,
      normalized.map((group) => group.groupId)
    );
    const existingIds = new Set(existingRows.map((item) => item.group_id));
    let inserted = 0;
    let updated = 0;

    for (const group of normalized) {
      if (existingIds.has(group.groupId)) {
        await db.run(
          'UPDATE account_groups SET name = ?, priority = ?, sort_order = ?, created_by = ?, updated_by = ?, created_at = ?, updated_at = ? WHERE group_id = ?',
          group.name,
          group.priority,
          group.sortOrder,
          group.createdBy,
          group.updatedBy,
          group.createdAt,
          group.updatedAt,
          group.groupId
        );
        updated += 1;
        continue;
      }

      await db.run(
        `INSERT INTO account_groups (group_id, name, priority, sort_order, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        group.groupId,
        group.name,
        group.priority,
        group.sortOrder,
        group.createdBy,
        group.updatedBy,
        group.createdAt,
        group.updatedAt
      );
      inserted += 1;
    }

    if (ownsTransaction) {
      await db.exec('COMMIT');
    }
    return {
      inserted,
      updated,
      skipped: groups.length - normalized.length
    };
  } catch (error) {
    if (ownsTransaction) {
      await db.exec('ROLLBACK');
    }
    throw error;
  }
}
