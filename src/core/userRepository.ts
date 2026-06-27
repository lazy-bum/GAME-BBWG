import { getDb } from './dbConnection.js';
import type { UserAuthRow, UserRole, UserRow } from './dbTypes.js';

interface UserDbRow {
  username: string;
  password_hash: string;
  role: UserRole;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

function toUserRow(row: UserDbRow): UserRow {
  return {
    username: row.username,
    role: row.role,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toUserAuthRow(row: UserDbRow): UserAuthRow {
  return {
    ...toUserRow(row),
    passwordHash: row.password_hash
  };
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ value?: number }>('SELECT COUNT(*) AS value FROM users');
  return row?.value ?? 0;
}

export async function listUsers(): Promise<UserRow[]> {
  const db = await getDb();
  const rows = await db.all<UserDbRow[]>(
    `SELECT username, password_hash, role, created_by, updated_by, created_at, updated_at
     FROM users
     ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END ASC, created_at ASC, username ASC`
  );
  return rows.map(toUserRow);
}

export async function findUserByUsername(username: string): Promise<UserAuthRow | null> {
  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return null;
  }

  const db = await getDb();
  const row = await db.get<UserDbRow>(
    `SELECT username, password_hash, role, created_by, updated_by, created_at, updated_at
     FROM users
     WHERE username = ?`,
    normalizedUsername
  );
  return row ? toUserAuthRow(row) : null;
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
  role: UserRole;
  actorUsername?: string;
}): Promise<UserRow> {
  const normalizedUsername = input.username.trim();
  const actorUsername = input.actorUsername?.trim() || normalizedUsername;
  const now = Date.now();
  const db = await getDb();
  await db.run(
    `INSERT INTO users (username, password_hash, role, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    normalizedUsername,
    input.passwordHash,
    input.role,
    actorUsername,
    actorUsername,
    now,
    now
  );

  return {
    username: normalizedUsername,
    role: input.role,
    createdBy: actorUsername,
    updatedBy: actorUsername,
    createdAt: now,
    updatedAt: now
  };
}

export async function createInitialAdmin(input: { username: string; passwordHash: string }): Promise<UserRow | null> {
  const normalizedUsername = input.username.trim();
  const now = Date.now();
  const db = await getDb();
  await db.exec('BEGIN IMMEDIATE');

  try {
    const existing = await db.get<{ value?: number }>('SELECT COUNT(*) AS value FROM users');
    if ((existing?.value ?? 0) > 0) {
      await db.exec('ROLLBACK');
      return null;
    }

    await db.run(
      `INSERT INTO users (username, password_hash, role, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
      normalizedUsername,
      input.passwordHash,
      normalizedUsername,
      normalizedUsername,
      now,
      now
    );

    await db.exec('COMMIT');
    return {
      username: normalizedUsername,
      role: 'admin',
      createdBy: normalizedUsername,
      updatedBy: normalizedUsername,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
