import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createPasswordSalt, hashPassword, requireSuperadmin, type ServerAccount } from './_lib/auth.js';
import { pool, transaction } from './_lib/db.js';
import { fail, handleError, ok, readAction, setNoStore } from './_lib/http.js';

const accountActionSchema = z.object({
  accountId: z.string().min(1),
});

const holdAccountSchema = accountActionSchema.extend({
  reason: z.string().trim().max(240).optional(),
});

const resetPasswordSchema = accountActionSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.'),
});

async function accountCounts(accountId: string) {
  const [contacts, expenses, sharedGroups, sharedExpenses, loans, items, subscriptions] = await Promise.all([
    pool.query('select count(*)::int as count from contacts where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from expenses where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from shared_groups where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from shared_expenses where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from loans where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from item_records where account_id=$1', [accountId]),
    pool.query('select count(*)::int as count from subscriptions where account_id=$1', [accountId]),
  ]);
  return {
    contacts: contacts.rows[0].count,
    expenses: expenses.rows[0].count,
    sharedGroups: sharedGroups.rows[0].count,
    sharedExpenses: sharedExpenses.rows[0].count,
    loans: loans.rows[0].count,
    items: items.rows[0].count,
    subscriptions: subscriptions.rows[0].count,
  };
}

async function overview() {
  const [accounts, settings, stats] = await Promise.all([
    pool.query('select id, name, email, role, status, hold_reason, created_at, updated_at from accounts order by created_at asc'),
    pool.query(`select * from platform_settings where id='global'`),
    pool.query(`
      select
        count(*)::int as total_accounts,
        count(*) filter (where role = 'user')::int as total_users,
        count(*) filter (where role = 'superadmin')::int as superadmins,
        count(*) filter (where role = 'user' and status = 'active')::int as active_users,
        count(*) filter (where role = 'user' and status = 'held')::int as held_users
      from accounts
    `),
  ]);
  return {
    settings: {
      id: 'global',
      accountCreationEnabled: Boolean(settings.rows[0]?.account_creation_enabled ?? true),
      updatedAt: new Date(settings.rows[0]?.updated_at ?? Date.now()).toISOString(),
      updatedBy: settings.rows[0]?.updated_by || undefined,
    },
    stats: {
      totalAccounts: Number(stats.rows[0]?.total_accounts ?? 0),
      totalUsers: Number(stats.rows[0]?.total_users ?? 0),
      superadmins: Number(stats.rows[0]?.superadmins ?? 0),
      activeUsers: Number(stats.rows[0]?.active_users ?? 0),
      heldUsers: Number(stats.rows[0]?.held_users ?? 0),
    },
    accounts: await Promise.all(
      accounts.rows.map(async (row) => ({
        account: {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          status: row.status,
          holdReason: row.hold_reason || undefined,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        },
        counts: await accountCounts(row.id),
      })),
    ),
  };
}

async function clearOwnedData(accountId: string) {
  await transaction(async (client) => {
    await client.query('delete from preferences where account_id=$1', [accountId]);
    await client.query('delete from contacts where account_id=$1', [accountId]);
    await client.query('delete from shared_groups where account_id=$1', [accountId]);
    await client.query('delete from expenses where account_id=$1', [accountId]);
    await client.query('delete from loans where account_id=$1', [accountId]);
    await client.query('delete from item_records where account_id=$1', [accountId]);
    await client.query('delete from subscriptions where account_id=$1', [accountId]);
    await client.query('delete from reminders where account_id=$1', [accountId]);
    await client.query('delete from activity_logs where account_id=$1', [accountId]);
  });
}

async function deleteAccountAndData(accountId: string) {
  await transaction(async (client) => {
    await client.query('delete from accounts where id=$1', [accountId]);
  });
}

async function readTargetAccount(accountId: string) {
  const result = await pool.query('select id, email, role from accounts where id=$1', [accountId]);
  return result.rows[0] as { id: string; email: string; role: 'user' | 'superadmin' } | undefined;
}

async function requireMutableTarget(actor: ServerAccount, accountId: string, selfError: string) {
  if (accountId === actor.id) {
    throw new Error(selfError);
  }

  const target = await readTargetAccount(accountId);
  if (!target) throw new Error('Account not found.');
  if (target.role !== 'user') throw new Error('Only regular user accounts can be managed here.');
  return target;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  setNoStore(response);

  try {
    const actor = await requireSuperadmin(request);
    const action = readAction(request);
    const payload = request.body?.payload ?? request.body ?? {};

    if (request.method === 'GET' && action === 'overview') {
      return ok(response, await overview());
    }

    if (request.method !== 'POST') return fail(response, 405, 'Method not allowed.');

    if (action === 'toggleRegistration') {
      await pool.query(
        `update platform_settings set account_creation_enabled=$1, updated_at=now(), updated_by=$2 where id='global'`,
        [Boolean(payload.enabled), actor.id],
      );
      return ok(response, await overview());
    }

    if (action === 'holdAccount') {
      const input = holdAccountSchema.parse(payload);
      await requireMutableTarget(actor, input.accountId, 'Superadmins cannot place their own account on hold.');
      await pool.query(`update accounts set status='held', hold_reason=$1, updated_at=now() where id=$2`, [
        input.reason || 'Placed on hold by superadmin.',
        input.accountId,
      ]);
      await pool.query('delete from sessions where account_id=$1', [input.accountId]);
      return ok(response, await overview());
    }

    if (action === 'releaseAccount') {
      const input = accountActionSchema.parse(payload);
      await requireMutableTarget(actor, input.accountId, 'Superadmins cannot release their own account.');
      await pool.query(`update accounts set status='active', hold_reason=null, updated_at=now() where id=$1`, [input.accountId]);
      return ok(response, await overview());
    }

    if (action === 'clearAccountData') {
      const input = accountActionSchema.parse(payload);
      await requireMutableTarget(actor, input.accountId, 'Superadmins cannot clear their own account data.');
      await clearOwnedData(input.accountId);
      return ok(response, await overview());
    }

    if (action === 'resetPassword') {
      const input = resetPasswordSchema.parse(payload);
      await requireMutableTarget(actor, input.accountId, 'Superadmins cannot reset their own password here.');

      const salt = createPasswordSalt();
      await pool.query(
        `update accounts
         set password_hash=$1, password_salt=$2, updated_at=now()
         where id=$3`,
        [hashPassword(input.password, salt), salt, input.accountId],
      );
      await pool.query('delete from sessions where account_id=$1', [input.accountId]);
      return ok(response, await overview());
    }

    if (action === 'deleteAccount') {
      const input = accountActionSchema.parse(payload);
      await requireMutableTarget(actor, input.accountId, 'Superadmins cannot permanently delete their own account.');
      await deleteAccountAndData(input.accountId);
      return ok(response, await overview());
    }

    return fail(response, 404, `Unknown admin action: ${action}`);
  } catch (error) {
    return handleError(response, error);
  }
}
