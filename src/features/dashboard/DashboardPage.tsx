import { useNavigate } from 'react-router-dom';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, ChevronRight, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, SectionHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  getExpenseTotals,
  getLast7DayTrend,
  getMonthlyCategoryTotals,
  getObligationStats,
  getUpcomingObligations,
} from '../../lib/calculations';
import { formatShortDate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { useFinanceStore } from '../../state/useFinanceStore';
import { useUiStore } from '../../state/useUiStore';

const colors = ['#0f766e', '#f59e0b', '#4f46e5', '#e11d48', '#0891b2', '#7c3aed', '#16a34a', '#64748b'];

type ObligationMode = 'loans' | 'items' | 'subscriptions';

export function DashboardPage() {
  const { preferences, contacts, expenses, loans, loanPayments, sharedExpenses, items, subscriptions, activities } = useFinanceStore();
  const openAddFlow = useUiStore((state) => state.openAddFlow);
  const navigate = useNavigate();
  const totals = getExpenseTotals(expenses);
  const stats = getObligationStats(contacts, loans, loanPayments, sharedExpenses, items, subscriptions);
  const categories = getMonthlyCategoryTotals(expenses);
  const trend = getLast7DayTrend(expenses);
  const upcoming = getUpcomingObligations(loans, loanPayments, items, subscriptions).slice(0, 6);

  function goToObligations(mode: ObligationMode) {
    navigate('/obligations', { state: { mode } });
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <SummaryCard label="Today" value={formatMoney(totals.today, preferences.currency)} icon={<TrendingDown size={18} />} tone="teal" />
        <SummaryCard label="This month" value={formatMoney(totals.month, preferences.currency)} icon={<TrendingUp size={18} />} tone="indigo" onClick={() => navigate('/transactions')} />
        <SummaryCard label="People owe me" value={formatMoney(stats.peopleOweMe, preferences.currency)} icon={<ChevronRight size={18} />} tone="emerald" onClick={() => navigate('/people')} />
        <SummaryCard label="I owe others" value={formatMoney(stats.iOweOthers, preferences.currency)} icon={<AlertTriangle size={18} />} tone="amber" onClick={() => navigate('/people')} />
      </section>

      <Button variant="secondary" className="w-full" icon={<Plus size={16} />} onClick={() => openAddFlow('expense')}>
        Log today's expense
      </Button>

      <Card className="bg-slate-950 text-white dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-300">Subscriptions</p>
            <p className="mt-1 text-2xl font-black">{formatMoney(stats.subscriptionMonthlyTotal, preferences.currency)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {stats.activeSubscriptions} active, {formatMoney(stats.subscriptionYearlyEstimate, preferences.currency)} yearly estimate
            </p>
          </div>
          <Badge tone={stats.overdueItems ? 'danger' : 'good'}>{stats.overdueItems} overdue items</Badge>
        </div>
      </Card>

      <section>
        <SectionHeader title="Spending This Month" />
        {categories.length ? (
          <Card className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={3}>
                  {categories.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value), preferences.currency)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-[-12px] grid grid-cols-2 gap-2">
              {categories.slice(0, 4).map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState title="No monthly spending yet" body="Add an expense to see category totals." />
        )}
      </section>

      <section>
        <SectionHeader title="Last 7 Days" />
        <Card className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip formatter={(value) => formatMoney(Number(value), preferences.currency)} />
              <Line type="monotone" dataKey="amount" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section>
        <SectionHeader title="Upcoming" />
        <div className="space-y-2">
          {upcoming.length ? (
            upcoming.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className="w-full text-left"
                onClick={() => goToObligations(item.type === 'loan' ? 'loans' : item.type === 'item' ? 'items' : 'subscriptions')}
              >
                <Card className="flex items-center justify-between gap-3 p-3 active:bg-slate-50 dark:active:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                      <CalendarClock size={18} />
                    </span>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-50">{item.title}</p>
                      <p className="text-xs text-slate-500">{formatShortDate(item.dueDate)}</p>
                    </div>
                  </div>
                  <Badge tone={item.overdue ? 'danger' : 'warn'}>{item.overdue ? 'Overdue' : 'Due soon'}</Badge>
                </Card>
              </button>
            ))
          ) : (
            <EmptyState title="No due items" body="Upcoming reminders will appear here when dates get close." />
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Recent Activity" />
        <div className="space-y-2">
          {activities.slice(0, 6).map((activity) => (
            <Card key={activity.id} className="p-3">
              <p className="font-bold text-slate-900 dark:text-slate-50">{activity.title}</p>
              <p className="text-sm text-slate-500">{activity.detail}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'teal' | 'indigo' | 'emerald' | 'amber';
  onClick?: () => void;
}) {
  const toneClass = {
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200',
  }[tone];
  const inner = (
    <>
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-full ${toneClass}`}>{icon}</div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">{value}</p>
      {onClick ? <p className="mt-1 text-xs font-semibold text-slate-400">Tap to view →</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="w-full text-left" onClick={onClick}>
        <Card className="p-3 active:bg-slate-50 dark:active:bg-slate-900">{inner}</Card>
      </button>
    );
  }
  return <Card className="p-3">{inner}</Card>;
}
