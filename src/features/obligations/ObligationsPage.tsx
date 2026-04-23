import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SelectInput } from '../../components/ui/Form';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { ItemRecord, Loan, Subscription } from '../../domain/models';
import {
  getDerivedItemStatus,
  getDerivedLoanStatus,
  getLoanRemaining,
  getSubscriptionMonthlyCost,
} from '../../lib/calculations';
import { formatFullDate, formatShortDate, isDateDueSoon, isDateOverdue } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { useFinanceStore } from '../../state/useFinanceStore';
import { useUiStore } from '../../state/useUiStore';
import { ItemForm } from './ItemForm';
import { LoanForm, LoanPaymentForm } from './LoanForm';
import { SubscriptionForm } from './SubscriptionForm';

type ObligationMode = 'loans' | 'items' | 'subscriptions';

export function ObligationsPage() {
  const [mode, setMode] = useState<ObligationMode>('loans');
  return (
    <div className="space-y-5">
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Loans', value: 'loans' },
          { label: 'Items', value: 'items' },
          { label: 'Bills', value: 'subscriptions' },
        ]}
      />
      {mode === 'loans' ? <LoansPanel /> : null}
      {mode === 'items' ? <ItemsPanel /> : null}
      {mode === 'subscriptions' ? <SubscriptionsPanel /> : null}
    </div>
  );
}

function LoansPanel() {
  const { contacts, loans, loanPayments, preferences, deleteLoan, deleteLoanPayment } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const [filter, setFilter] = useState<'all' | 'active' | 'settled' | 'overdue'>('active');
  const [editing, setEditing] = useState<Loan | undefined>();
  const [repaying, setRepaying] = useState<Loan | undefined>();
  const filtered = useMemo(
    () =>
      loans.filter((loan) => {
        const status = getDerivedLoanStatus(loan, loanPayments);
        return filter === 'all' || status === filter;
      }),
    [filter, loanPayments, loans],
  );

  return (
    <section className="space-y-4">
      <Toolbar title="Loans / Money Owed" onAdd={() => openAddFlow('loan')} />
      <SelectInput value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
        <option value="active">Active</option>
        <option value="overdue">Overdue</option>
        <option value="settled">Settled</option>
        <option value="all">All</option>
      </SelectInput>
      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((loan) => {
            const person = contacts.find((contact) => contact.id === loan.personId);
            const remaining = getLoanRemaining(loan, loanPayments);
            const status = getDerivedLoanStatus(loan, loanPayments);
            const payments = loanPayments.filter((payment) => payment.loanId === loan.id);
            return (
              <Card key={loan.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{person?.name ?? 'Unknown person'}</p>
                    <p className="text-xs text-slate-500">
                      {loan.direction === 'lent' ? 'I lent' : 'I borrowed'} · due {formatShortDate(loan.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">{formatMoney(remaining, preferences.currency)}</p>
                    <Badge tone={status === 'overdue' ? 'danger' : status === 'settled' ? 'good' : 'warn'}>{status}</Badge>
                  </div>
                </div>
                {payments.length ? (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="mb-2 text-xs font-bold text-slate-500">Repayments</p>
                    {payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between py-1 text-sm">
                        <span>{formatFullDate(payment.date)}</span>
                        <button type="button" onClick={() => void deleteLoanPayment(payment.id)} className="font-bold text-rose-600">
                          {formatMoney(payment.amount, preferences.currency)}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<RotateCcw size={16} />} onClick={() => setRepaying(loan)}>
                    Repay
                  </Button>
                  <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Pencil size={16} />} onClick={() => setEditing(loan)}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="min-h-9 px-3 text-rose-600" icon={<Trash2 size={16} />} onClick={() => void deleteLoan(loan.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No loans here" body="Add money lent or borrowed, then track partial repayments." />
        )}
      </div>
      <BottomSheet open={Boolean(editing)} title="Edit Loan" onClose={() => setEditing(undefined)}>
        {editing ? <LoanForm loan={editing} onDone={() => setEditing(undefined)} /> : null}
      </BottomSheet>
      <BottomSheet open={Boolean(repaying)} title="Record Repayment" onClose={() => setRepaying(undefined)}>
        {repaying ? <LoanPaymentForm loan={repaying} onDone={() => setRepaying(undefined)} /> : null}
      </BottomSheet>
    </section>
  );
}

function ItemsPanel() {
  const { contacts, items, deleteItem, markItemReturned } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const [filter, setFilter] = useState<'active' | 'returned' | 'overdue' | 'all'>('active');
  const [editing, setEditing] = useState<ItemRecord | undefined>();
  const filtered = items.filter((item) => {
    const status = getDerivedItemStatus(item);
    return filter === 'all' || status === filter;
  });

  return (
    <section className="space-y-4">
      <Toolbar title="Borrowed / Lent Items" onAdd={() => openAddFlow('item')} />
      <SelectInput value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
        <option value="active">Active</option>
        <option value="overdue">Overdue</option>
        <option value="returned">Returned</option>
        <option value="all">All</option>
      </SelectInput>
      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((item) => {
            const person = contacts.find((contact) => contact.id === item.personId);
            const status = getDerivedItemStatus(item);
            return (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{item.itemName}</p>
                    <p className="text-xs text-slate-500">
                      {item.direction === 'lent' ? 'Lent to' : 'Borrowed from'} {person?.name ?? 'Unknown'} · due {formatShortDate(item.dueDate)}
                    </p>
                  </div>
                  <Badge tone={status === 'overdue' ? 'danger' : status === 'returned' ? 'good' : 'warn'}>{status}</Badge>
                </div>
                {item.note ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.note}</p> : null}
                <div className="mt-3 flex gap-2">
                  {item.status === 'active' ? (
                    <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Check size={16} />} onClick={() => void markItemReturned(item.id)}>
                      Returned
                    </Button>
                  ) : null}
                  <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Pencil size={16} />} onClick={() => setEditing(item)}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="min-h-9 px-3 text-rose-600" icon={<Trash2 size={16} />} onClick={() => void deleteItem(item.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No item records" body="Track chargers, books, devices, tools, and documents." />
        )}
      </div>
      <BottomSheet open={Boolean(editing)} title="Edit Item" onClose={() => setEditing(undefined)}>
        {editing ? <ItemForm item={editing} onDone={() => setEditing(undefined)} /> : null}
      </BottomSheet>
    </section>
  );
}

function SubscriptionsPanel() {
  const { subscriptions, preferences, deleteSubscription } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const [filter, setFilter] = useState<'active' | 'due' | 'cancelled' | 'all'>('active');
  const [editing, setEditing] = useState<Subscription | undefined>();
  const monthlyTotal = subscriptions.reduce((sum, subscription) => sum + getSubscriptionMonthlyCost(subscription), 0);
  const filtered = subscriptions.filter((subscription) => {
    if (filter === 'all') return true;
    if (filter === 'due') return isDateDueSoon(subscription.nextDueDate, 14) || isDateOverdue(subscription.nextDueDate);
    if (filter === 'cancelled') return subscription.status === 'cancelled';
    return subscription.status === 'active';
  });

  return (
    <section className="space-y-4">
      <Toolbar title="Subscriptions / Bills" onAdd={() => openAddFlow('subscription')} />
      <Card className="p-3">
        <p className="text-xs font-bold text-slate-500">Recurring monthly total</p>
        <p className="mt-1 text-2xl font-black">{formatMoney(monthlyTotal, preferences.currency)}</p>
        <p className="text-xs text-slate-500">Yearly estimate {formatMoney(monthlyTotal * 12, preferences.currency)}</p>
      </Card>
      <SelectInput value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
        <option value="active">Active</option>
        <option value="due">Due soon</option>
        <option value="cancelled">Cancelled</option>
        <option value="all">All</option>
      </SelectInput>
      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((subscription) => {
            const dueState = isDateOverdue(subscription.nextDueDate) ? 'overdue' : isDateDueSoon(subscription.nextDueDate, 7) ? 'due soon' : subscription.status;
            return (
              <Card key={subscription.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{subscription.name}</p>
                    <p className="text-xs text-slate-500">
                      {subscription.cycle} · next {formatShortDate(subscription.nextDueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">{formatMoney(subscription.amount, preferences.currency)}</p>
                    <Badge tone={dueState === 'overdue' ? 'danger' : dueState === 'due soon' ? 'warn' : subscription.status === 'active' ? 'good' : 'neutral'}>
                      {dueState}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" className="min-h-9 flex-1 px-2" icon={<Pencil size={16} />} onClick={() => setEditing(subscription)}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="min-h-9 px-3 text-rose-600" icon={<Trash2 size={16} />} onClick={() => void deleteSubscription(subscription.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState title="No subscriptions" body="Add recurring payments to forecast your monthly obligations." />
        )}
      </div>
      <BottomSheet open={Boolean(editing)} title="Edit Subscription" onClose={() => setEditing(undefined)}>
        {editing ? <SubscriptionForm subscription={editing} onDone={() => setEditing(undefined)} /> : null}
      </BottomSheet>
    </section>
  );
}

function Toolbar({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <SectionHeader
      title={title}
      action={
        <Button variant="secondary" className="min-h-9 px-3" icon={<Plus size={16} />} onClick={onAdd}>
          Add
        </Button>
      }
    />
  );
}
