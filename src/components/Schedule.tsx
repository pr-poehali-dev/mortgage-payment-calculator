import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { ScheduleRow, fmt, fmtDate } from '@/lib/mortgage';

const Schedule = ({ rows }: { rows: ScheduleRow[] }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 12);

  const totalPayment = rows.reduce((s, r) => s + r.payment, 0);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card animate-fade-in">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <Icon name="CalendarDays" size={18} />
          </div>
          <div>
            <h2 className="font-semibold">График погашения</h2>
            <p className="font-mono text-xs text-muted-foreground">{rows.length} платежей</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">№ платежа</th>
              <th className="px-3 py-3 font-medium">Дата платежа</th>
              <th className="px-3 py-3 font-medium text-[9px]">Дней</th>
              <th className="px-3 py-3 text-right font-medium">Сумма осн. долга</th>
              <th className="px-3 py-3 text-right font-medium">Сумма нач. %</th>
              <th className="px-3 py-3 text-right font-medium">Общая сумма платежа</th>
              <th className="px-4 py-3 text-right font-medium">Остаток долга</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {visible.map((r) => (
              <tr
                key={r.index}
                className={`border-b border-border/50 transition-colors hover:bg-secondary/40 ${r.interestOnly ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
              >
                <td className="px-4 py-2 text-muted-foreground">
                  <span>{r.index}</span>
                  {r.interestOnly && (
                    <span className="ml-1 font-mono text-[9px] text-amber-600 dark:text-amber-400 font-semibold">%</span>
                  )}
                </td>
                <td className="px-3 py-2">{fmtDate(r.date)}</td>
                <td className="px-3 py-2 text-muted-foreground/60 text-xs">{r.days}</td>
                <td className="px-3 py-2 text-right">{r.principal > 0 ? fmt(r.principal) : '—'}</td>
                <td className="px-3 py-2 text-right text-accent">{fmt(r.interest)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(r.payment)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/30 font-mono font-semibold text-sm">
              <td className="px-4 py-2.5 text-muted-foreground" colSpan={3}>Итого</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalPrincipal)}</td>
              <td className="px-3 py-2.5 text-right text-accent">{fmt(totalInterest)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalPayment)}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length > 12 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 border-t border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
        >
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} />
          {expanded ? 'Свернуть' : `Показать все ${rows.length} платежей`}
        </button>
      )}
    </div>
  );
};

export default Schedule;