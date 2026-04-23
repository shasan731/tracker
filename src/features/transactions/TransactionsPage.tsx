import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '../../components/ui/Form';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { EXPENSE_CATEGORIES } from '../../domain/constants';
import { CURRENT_USER_ID, type Expense, type ExpenseCategory, type SharedExpense } from '../../domain/models';
import { getExpenseTotals, getSharedBalances } from '../../lib/calculations';
import { formatFullDate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { useFinanceStore } from '../../state/useFinanceStore';
import { useUiStore } from '../../state/useUiStore';
import { ExpenseForm } from './ExpenseForm';
import { SharedExpenseForm } from './SharedExpenseForm';
import { SharedGroupForm } from './SharedGroupForm';

type TransactionMode = 'daily' | 'shared';

export function TransactionsPage() {
  const [mode, setMode] = useState<TransactionMode>('daily');

  return (
    <div className="space-y-5">
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Daily', value: 'daily' },
          { label: 'Shared', value: 'shared' },
        ]}
      />
      {mode === 'daily' ? <DailyExpensesPanel /> : <SharedExpensesPanel />}
    </div>
  );
}

function DailyExpensesPanel() {
  const { expenses, preferences, deleteExpense, duplicateExpense } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const [editing, setEditing] = useState<Expense | undefined>();
  const [category, setCategory] = useState<ExpenseCategory | 'All'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const totals = getExpenseTotals(expenses);

  const filtered = useMemo(
    () =>
      expenses.filter((expense) => {
        const categoryMatch = category === 'All' || expense.category === category;
        const startMatch = !startDate || expense.date >= startDate;
        const endMatch = !endDate || expense.date <= endDate;
        return categoryMatch && startMatch && endMatch;
      }),
    [category, endDate, expenses, startDate],
  );

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <p className="text-xs font-bold text-slate-500">Today</p>
          <p className="mt-1 text-lg font-black">{formatMoney(totals.today, preferences.currency)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-bold text-slate-500">This month</p>
          <p className="mt-1 text-lg font-black">{formatMoney(totals.month, preferences.currency)}</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <TextInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </Field>
        </div>
        <Field label="Category">
          <SelectInput value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory | 'All')}>
            <option value="All">All categories</option>
            {EXPENSE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectInput>
        </Field>
      </Card>

      <SectionHeader
        title="Expenses"
        action={
          <Button variant="secondary" className="min-h-9 px-3" icon={<Plus size={16} />} onClick={() => openAddFlow('expense')}>
            Add
          </Button>
        }
      />

      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((expense) => (
            <Card key={expense.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-slate-950 dark:text-slate-50">{expense.note || expense.category}</p>
                    <Badge tone="info">{expense.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatFullDate(expense.date)} · {expense.paymentMethod}
                  </p>
                </div>
                <p className="shrink-0 font-black">{formatMoney(expense.amount, preferences.currency)}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Copy size={16} />} onClick={() => void duplicateExpense(expense.id)}>
                  Duplicate
                </Button>
                <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Pencil size={16} />} onClick={() => setEditing(expense)}>
                  Edit
                </Button>
                <Button variant="ghost" className="min-h-9 px-3 text-rose-600" icon={<Trash2 size={16} />} onClick={() => void deleteExpense(expense.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No expenses found" body="Add daily expenses or loosen the current filters." />
        )}
      </div>

      <BottomSheet open={Boolean(editing)} title="Edit Expense" onClose={() => setEditing(undefined)}>
        {editing ? <ExpenseForm expense={editing} onDone={() => setEditing(undefined)} /> : null}
      </BottomSheet>
    </section>
  );
}

function SharedExpensesPanel() {
  const {
    contacts,
    preferences,
    sharedGroups,
    sharedExpenses,
    toggleSharedExpenseSettled,
    deleteSharedExpense,
    deleteSharedGroup,
  } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const [editing, setEditing] = useState<SharedExpense | undefined>();
  const [editingGroupId, setEditingGroupId] = useState<string | undefined>();
  const balances = getSharedBalances(sharedExpenses);

  function displayName(id: string) {
    if (id === CURRENT_USER_ID) return 'Me';
    return contacts.find((contact) => contact.id === id)?.name ?? 'Unknown';
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Groups"
        action={
          <Button variant="secondary" className="min-h-9 px-3" icon={<Plus size={16} />} onClick={() => openAddFlow('sharedGroup')}>
            Group
          </Button>
        }
      />
      <div className="space-y-2">
        {sharedGroups.length ? (
          sharedGroups.map((group) => {
            const groupExpenses = sharedExpenses.filter((expense) => expense.groupId === group.id);
            const total = groupExpenses.reduce((sum, expense) => sum + expense.amount, 0);
            return (
              <Card key={group.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950 dark:text-slate-50">{group.name}</p>
                    <p className="text-xs text-slate-500">
                      {group.participantIds.length + 1} people · {formatMoney(total, preferences.currency)}
                    </p>
                  </div>
                  <Badge tone={groupExpenses.some((expense) => !expense.settled) ? 'warn' : 'good'}>
                    {groupExpenses.filter((expense) => !expense.settled).length} open
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" className="min-h-9 flex-1 px-2" onClick={() => setEditingGroupId(group.id)}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="min-h-9 px-3 text-rose-600" onClick={() => void deleteSharedGroup(group.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No shared groups" body="Create groups for lunch, rent, trips, or team snacks." />
        )}
      </div>

      <SectionHeader
        title="Shared Expenses"
        action={
          <Button variant="secondary" className="min-h-9 px-3" icon={<Plus size={16} />} onClick={() => openAddFlow('sharedExpense')}>
            Add
          </Button>
        }
      />

      <Card>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Settlement snapshot</p>
        <div className="mt-3 space-y-2">
          {[...balances.entries()].length ? (
            [...balances.entries()].map(([contactId, balance]) => (
              <div key={contactId} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                <span className="font-semibold">{displayName(contactId)}</span>
                <span className={balance >= 0 ? 'font-black text-emerald-700' : 'font-black text-rose-600'}>
                  {balance >= 0 ? 'owes me ' : 'I owe '}
                  {formatMoney(Math.abs(balance), preferences.currency)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No unsettled shared balances.</p>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        {sharedExpenses.length ? (
          sharedExpenses.map((expense) => (
            <Card key={expense.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{expense.note}</p>
                  <p className="text-xs text-slate-500">
                    {sharedGroups.find((group) => group.id === expense.groupId)?.name ?? 'Group'} · paid by {displayName(expense.payerId)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black">{formatMoney(expense.amount, preferences.currency)}</p>
                  <Badge tone={expense.settled ? 'good' : 'warn'}>{expense.settled ? 'Settled' : 'Open'}</Badge>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" className="min-h-9 flex-1 px-2" onClick={() => void toggleSharedExpenseSettled(expense.id)}>
                  {expense.settled ? 'Reopen' : 'Settle'}
                </Button>
                <Button variant="ghost" className="min-h-9 flex-1 px-2" onClick={() => setEditing(expense)}>
                  Edit
                </Button>
                <Button variant="ghost" className="min-h-9 px-3 text-rose-600" onClick={() => void deleteSharedExpense(expense.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No shared expenses" body="Add a split to see balances per participant." />
        )}
      </div>

      <BottomSheet open={Boolean(editing)} title="Edit Shared Expense" onClose={() => setEditing(undefined)}>
        {editing ? <SharedExpenseForm sharedExpense={editing} onDone={() => setEditing(undefined)} /> : null}
      </BottomSheet>
      <BottomSheet open={Boolean(editingGroupId)} title="Edit Shared Group" onClose={() => setEditingGroupId(undefined)}>
        {editingGroupId ? (
          <SharedGroupForm group={sharedGroups.find((group) => group.id === editingGroupId)} onDone={() => setEditingGroupId(undefined)} />
        ) : null}
      </BottomSheet>
    </section>
  );
}
