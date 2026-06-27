import sqlite3 from 'sqlite3';
import type { Database } from 'sqlite';
import { getDb } from '../core/dbConnection.js';
import { listAccountGroups, upsertAccountGroupsFromBackup } from '../core/accountGroupRepository.js';
import { listAccountsForBackup, upsertAccountsFromBackup } from '../core/accountRepository.js';
import type { AccountBackupPayload } from '../core/dbTypes.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertValidBackupPayload(input: unknown): asserts input is AccountBackupPayload {
  if (!isPlainObject(input)) {
    throw new Error('备份文件格式不正确');
  }

  if (input.type !== 'bbwg-account-backup') {
    throw new Error('备份文件类型不支持');
  }

  if (input.schemaVersion !== 1) {
    throw new Error('备份文件版本不支持');
  }

  if (!Array.isArray(input.accountGroups) || !Array.isArray(input.accounts)) {
    throw new Error('备份文件缺少账号或分组数据');
  }
}

export class AccountBackupService {
  async exportBackup(): Promise<AccountBackupPayload> {
    const [accountGroups, accounts] = await Promise.all([listAccountGroups(), listAccountsForBackup()]);

    return {
      type: 'bbwg-account-backup',
      schemaVersion: 1,
      exportedAt: Date.now(),
      accountGroups,
      accounts
    };
  }

  async importBackup(input: unknown): Promise<{
    groupsInserted: number;
    groupsUpdated: number;
    groupsSkipped: number;
    accountsInserted: number;
    accountsUpdated: number;
    accountsSkipped: number;
  }> {
    assertValidBackupPayload(input);

    const db = (await getDb()) as Database<sqlite3.Database, sqlite3.Statement>;
    await db.exec('BEGIN');
    try {
      const groupResult = await upsertAccountGroupsFromBackup(input.accountGroups, db);
      const accountResult = await upsertAccountsFromBackup(input.accounts, db);

      await db.exec('COMMIT');
      return {
        groupsInserted: groupResult.inserted,
        groupsUpdated: groupResult.updated,
        groupsSkipped: groupResult.skipped,
        accountsInserted: accountResult.inserted,
        accountsUpdated: accountResult.updated,
        accountsSkipped: accountResult.skipped
      };
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
}
