import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from './db.js';

const CURRENT_USER_ID = 'me';

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function equalShares(amount: number, participantIds: string[]) {
  const base = Math.round((amount / participantIds.length) * 100) / 100;
  const shares = participantIds.map((contactId) => ({ contactId, amount: base }));
  const total = shares.reduce((sum, share) => sum + share.amount, 0);
  shares[shares.length - 1].amount = Math.round((shares[shares.length - 1].amount + amount - total) * 100) / 100;
  return shares;
}

async function seedWithClient(client: PoolClient, accountId: string) {
  await client.query(
    `insert into preferences (id, account_id, currency, reminder_days_before, notifications_enabled, theme, seeded_at, updated_at)
     values ($1, $2, 'BDT', 2, false, 'light', now(), now())
     on conflict (account_id) do update
     set seeded_at = now(), updated_at = now()`,
    [`preferences_${accountId}`, accountId],
  );

  const contacts = {
    shuvo: makeId('contact'),
    nadia: makeId('contact'),
    rafi: makeId('contact'),
    landlord: makeId('contact'),
  };

  await Promise.all([
    client.query(
      `insert into contacts (id, account_id, name, phone, notes, created_at, updated_at)
       values ($1,$2,'Shuvo Ahmed','+8801711000001','Friend from university.',now(),now())`,
      [contacts.shuvo, accountId],
    ),
    client.query(
      `insert into contacts (id, account_id, name, phone, notes, created_at, updated_at)
       values ($1,$2,'Nadia Akter','+8801811000002','Office lunch and item sharing.',now(),now())`,
      [contacts.nadia, accountId],
    ),
    client.query(
      `insert into contacts (id, account_id, name, phone, notes, created_at, updated_at)
       values ($1,$2,'Rafi Hasan','+8801911000003','Borrowed money last week.',now(),now())`,
      [contacts.rafi, accountId],
    ),
    client.query(
      `insert into contacts (id, account_id, name, phone, notes, created_at, updated_at)
       values ($1,$2,'Mahmud Uncle',null,'Flat owner and rent contact.',now(),now())`,
      [contacts.landlord, accountId],
    ),
  ]);

  const expenses = [
    [120, 'Food', 'Breakfast and tea', dateOffset(0), 'Cash', ['meal']],
    [180, 'Transport', 'CNG ride', dateOffset(0), 'Cash', ['commute']],
    [820, 'Shopping', 'Groceries', dateOffset(-1), 'Card', ['home']],
    [299, 'Recharge', 'Mobile recharge', dateOffset(-2), 'bKash', ['phone']],
    [450, 'Medicine', 'Pharmacy', dateOffset(-3), 'Cash', ['health']],
    [1200, 'Bills', 'Internet bill', dateOffset(-4), 'Bank', ['monthly']],
    [550, 'Entertainment', 'Movie night', dateOffset(-5), 'Card', ['weekend']],
    [90, 'Food', 'Tea and snacks', dateOffset(-6), 'Cash', ['snacks']],
  ] as const;

  for (const [amount, category, note, date, paymentMethod, tags] of expenses) {
    await client.query(
      `insert into expenses (id, account_id, amount, category, note, date, payment_method, tags, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
      [makeId('expense'), accountId, amount, category, note, date, paymentMethod, JSON.stringify(tags)],
    );
  }

  const officeGroup = makeId('group');
  const tripGroup = makeId('group');
  await Promise.all([
    client.query(
      `insert into shared_groups (id, account_id, name, description, participant_ids, created_at, updated_at)
       values ($1,$2,'Office Lunch','Lunch split with teammates.',$3,now(),now())`,
      [officeGroup, accountId, JSON.stringify([contacts.shuvo, contacts.nadia, contacts.rafi])],
    ),
    client.query(
      `insert into shared_groups (id, account_id, name, description, participant_ids, created_at, updated_at)
       values ($1,$2,'Cox''s Bazar Trip','Weekend travel planning.',$3,now(),now())`,
      [tripGroup, accountId, JSON.stringify([contacts.shuvo, contacts.nadia])],
    ),
  ]);

  const officeParticipants = [CURRENT_USER_ID, contacts.shuvo, contacts.nadia, contacts.rafi];
  const tripParticipants = [CURRENT_USER_ID, contacts.shuvo, contacts.nadia];
  await Promise.all([
    client.query(
      `insert into shared_expenses
       (id, account_id, group_id, amount, note, date, payer_id, participant_ids, split_type, shares, settled, created_at, updated_at)
       values ($1,$2,$3,960,'Team lunch', $4, $5, $6, 'equal', $7, false, now(), now())`,
      [
        makeId('shared'),
        accountId,
        officeGroup,
        dateOffset(-1),
        CURRENT_USER_ID,
        JSON.stringify(officeParticipants),
        JSON.stringify(equalShares(960, officeParticipants)),
      ],
    ),
    client.query(
      `insert into shared_expenses
       (id, account_id, group_id, amount, note, date, payer_id, participant_ids, split_type, shares, settled, created_at, updated_at)
       values ($1,$2,$3,1500,'Advance transport booking', $4, $5, $6, 'equal', $7, false, now(), now())`,
      [
        makeId('shared'),
        accountId,
        tripGroup,
        dateOffset(-2),
        contacts.nadia,
        JSON.stringify(tripParticipants),
        JSON.stringify(equalShares(1500, tripParticipants)),
      ],
    ),
  ]);

  const rafiLoan = makeId('loan');
  const shuvoLoan = makeId('loan');
  await client.query(
    `insert into loans (id, account_id, person_id, direction, amount, date, due_date, notes, status, created_at, updated_at)
     values ($1,$2,$3,'lent',3000,$4,$5,'Helped with emergency cash.','active',now(),now())`,
    [rafiLoan, accountId, contacts.rafi, dateOffset(-7), dateOffset(5)],
  );
  await client.query(
    `insert into loans (id, account_id, person_id, direction, amount, date, due_date, notes, status, created_at, updated_at)
     values ($1,$2,$3,'borrowed',1200,$4,$5,'Borrowed for groceries.','active',now(),now())`,
    [shuvoLoan, accountId, contacts.shuvo, dateOffset(-10), dateOffset(-2)],
  );
  await client.query(
    `insert into loan_payments (id, account_id, loan_id, amount, date, note, created_at)
     values ($1,$2,$3,1000,$4,'Partial repayment from Rafi.',now())`,
    [makeId('payment'), accountId, rafiLoan, dateOffset(-1)],
  );

  const powerBankItem = makeId('item');
  const bookItem = makeId('item');
  await Promise.all([
    client.query(
      `insert into item_records (id, account_id, item_name, person_id, direction, date, due_date, note, status, returned_date, created_at, updated_at)
       values ($1,$2,'Power bank',$3,'lent',$4,$5,'Nadia borrowed it for travel.','active',null,now(),now())`,
      [powerBankItem, accountId, contacts.nadia, dateOffset(-6), dateOffset(-1)],
    ),
    client.query(
      `insert into item_records (id, account_id, item_name, person_id, direction, date, due_date, note, status, returned_date, created_at, updated_at)
       values ($1,$2,'Clean Code book',$3,'borrowed',$4,$5,'Return after finishing chapter 6.','active',null,now(),now())`,
      [bookItem, accountId, contacts.shuvo, dateOffset(-3), dateOffset(7)],
    ),
  ]);

  const subscriptions = [
    [makeId('subscription'), 'Netflix', 999, 'monthly', 'Entertainment', dateOffset(3), true, 'Family plan.', 'active'],
    [makeId('subscription'), 'Home Internet', 1200, 'monthly', 'Bills', dateOffset(1), true, 'ISP bill.', 'active'],
    [makeId('subscription'), 'Domain Renewal', 1800, 'yearly', 'Software', dateOffset(20), true, 'Personal project domain.', 'active'],
  ] as const;

  for (const [id, name, amount, cycle, category, nextDueDate, autoRenew, notes, status] of subscriptions) {
    await client.query(
      `insert into subscriptions (id, account_id, name, amount, cycle, category, next_due_date, auto_renew, notes, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`,
      [id, accountId, name, amount, cycle, category, nextDueDate, autoRenew, notes, status],
    );
  }

  await Promise.all([
    client.query(
      `insert into reminders (id, account_id, source_type, source_id, title, due_at, status, created_at, updated_at)
       values ($1,$2,'loan',$3,'Rafi loan due',$4,'scheduled',now(),now())`,
      [makeId('reminder'), accountId, rafiLoan, dateOffset(5)],
    ),
    client.query(
      `insert into reminders (id, account_id, source_type, source_id, title, due_at, status, created_at, updated_at)
       values ($1,$2,'item',$3,'Power bank overdue',$4,'scheduled',now(),now())`,
      [makeId('reminder'), accountId, powerBankItem, dateOffset(-1)],
    ),
    client.query(
      `insert into reminders (id, account_id, source_type, source_id, title, due_at, status, created_at, updated_at)
       values ($1,$2,'subscription',$3,'Home Internet bill',$4,'scheduled',now(),now())`,
      [makeId('reminder'), accountId, subscriptions[1][0], dateOffset(1)],
    ),
    client.query(
      `insert into reminders (id, account_id, source_type, source_id, title, due_at, status, created_at, updated_at)
       values ($1,$2,'subscription',$3,'Netflix renews',$4,'scheduled',now(),now())`,
      [makeId('reminder'), accountId, subscriptions[0][0], dateOffset(3)],
    ),
  ]);

  const activities = [
    ['expense', 'demo_expenses', 'Demo expenses added', 'A week of sample spending is ready.', 3718, null],
    ['loan', rafiLoan, 'Money lent', 'Rafi owes part of a loan.', 3000, contacts.rafi],
    ['loan', shuvoLoan, 'Money borrowed', 'You owe Shuvo a small balance.', 1200, contacts.shuvo],
    ['sharedGroup', officeGroup, 'Shared group created', 'Office Lunch is ready for bill splitting.', null, null],
    ['subscription', subscriptions[1][0], 'Subscription reminder', 'Home Internet is due soon.', 1200, null],
  ] as const;

  for (const [entityType, entityId, title, detail, amount, personId] of activities) {
    await client.query(
      `insert into activity_logs (id, account_id, entity_type, entity_id, person_id, title, detail, amount, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [makeId('activity'), accountId, entityType, entityId, personId, title, detail, amount],
    );
  }
}

export async function seedDemoData(accountId: string, client?: PoolClient) {
  if (client) {
    await seedWithClient(client, accountId);
    return;
  }

  await transaction((transactionClient) => seedWithClient(transactionClient, accountId));
}
