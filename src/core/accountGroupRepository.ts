import { randomUUID } from 'node:crypto';
import { getDb } from './dbConnection.js';
import type { AccountGroupRow } from './dbTypes.js';

function toAccountGroupRow(row: {
  group_id: string;
  name: string;
  priority: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}): AccountGroupRow {
  return {
    groupId: row.group_id,
    name: row.name,
    priority: row.priority,
    sortOrder: row.sort_order,
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
      created_at: number;
      updated_at: number;
    }[]
  >('SELECT * FROM account_groups ORDER BY priority DESC, sort_order ASC, created_at ASC');
  return rows.map(toAccountGroupRow);
}

export async function createAccountGroup(input: { name: string; priority?: number; sortOrder?: number }): Promise<AccountGroupRow> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('请输入分组名称');
  }

  const db = await getDb();
  const now = Date.now();
  const groupId = randomUUID();
  const priority = Number.isFinite(input.priority) ? Number(input.priority) : 0;
  const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : await getNextSortOrder();
  await db.run(
    `INSERT INTO account_groups (group_id, name, priority, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    groupId,
    name,
    priority,
    sortOrder,
    now,
    now
  );

  return {
    groupId,
    name,
    priority,
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

export async function updateAccountGroup(
  groupId: string,
  input: { name?: string; priority?: number; sortOrder?: number }
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
  const now = Date.now();
  const db = await getDb();
  await db.run(
    'UPDATE account_groups SET name = ?, priority = ?, sort_order = ?, updated_at = ? WHERE group_id = ?',
    nextName,
    nextPriority,
    nextSortOrder,
    now,
    normalizedGroupId
  );

  return {
    ...current,
    name: nextName,
    priority: nextPriority,
    sortOrder: nextSortOrder,
    updatedAt: now
  };
}

export async function deleteAccountGroup(groupId: string): Promise<boolean> {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return false;
  }

  const db = await getDb();
  await db.exec('BEGIN');
  try {
    await db.run('UPDATE accounts SET group_id = ?, updated_at = ? WHERE group_id = ?', '', Date.now(), normalizedGroupId);
    const result = await db.run('DELETE FROM account_groups WHERE group_id = ?', normalizedGroupId);
    await db.exec('COMMIT');
    return (result.changes ?? 0) > 0;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
