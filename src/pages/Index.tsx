import { useState, useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import Schedule from '@/components/Schedule';
import { buildSchedule, fmt, fmtDate, addMonths, MortgageInput } from '@/lib/mortgage';
import { exportExcel, exportPDF, exportWord } from '@/lib/export';

type DownMode = 'percent' | 'amount';
type TermMode = 'years' | 'months';

interface VariantState {
  id: number;
  name: string;
  price: number;
  downMode: DownMode;
  downPercent: number;
  downAmount: number;
  rate: number;
  termMode: TermMode;
  years: number;
  months: number;
}

let nextId = 1;
const makeVariant = (overrides?: Partial<VariantState>): VariantState => ({
  id: nextId++,
  name: `Вариант ${nextId - 1}`,
  price: 8000000,
  downMode: 'percent',
  downPercent: 20,
  downAmount: 1600000,
  rate: 18,
  termMode: 'years',
  years: 20,
  months: 240,
  ...overrides,
});

function calcResult(v: VariantState) {
  const down = v.downMode === 'percent' ? (v.price * v.downPercent) / 100 : v.downAmount;
  const loan = Math.max(v.price - down, 0);
  const n = v.termMode === 'years' ? v.years * 12 : v.months;
  const i = v.rate / 100 / 12;
  let monthly = 0;
  if (loan > 0 && n > 0) {
    monthly = i === 0 ? loan / n : (loan * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  }
  const total = monthly * n;
  const overpay = total - loan;
  return { down, loan, monthly, total, overpay, n, downRatio: v.price ? (down / v.price) * 100 : 0 };
}

const Index = () => {
  const [compareMode, setCompareMode] = useState(false);
  const [variants, setVariants] = useState<VariantState[]>([makeVariant({ name: 'Вариант 1' })]);

  // Основная форма (первый вариант)
  const [price, setPrice] = useState(8000000);
  const [downMode, setDownMode] = useState<DownMode>('percent');
  const [downPercent, setDownPercent] = useState(20);
  const [downAmount, setDownAmount] = useState(1600000);
  const [rate, setRate] = useState(18);
  const [termMode, setTermMode] = useState<TermMode>('years');
  const [years, setYears] = useState(20);
  const [months, setMonths] = useState(240);

  const startDate = useMemo(() => new Date(), []);
  const firstPayment = addMonths(startDate, 1);

  const result = useMemo(() => {
    const down = downMode === 'percent' ? (price * downPercent) / 100 : downAmount;
    const loan = Math.max(price - down, 0);
    const n = termMode === 'years' ? years * 12 : months;
    const i = rate / 100 / 12;
    let monthly = 0;
    if (loan > 0 && n > 0) {
      monthly = i === 0 ? loan / n : (loan * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    }
    const total = monthly * n;
    const overpay = total - loan;
    return { down, loan, monthly, total, overpay, n, downRatio: price ? (down / price) * 100 : 0 };
  }, [price, downMode, downPercent, downAmount, rate, termMode, years, months]);

  const mortgageInput: MortgageInput = {
    price, down: result.down, loan: result.loan, rate,
    months: result.n, monthly: result.monthly, total: result.total,
    overpay: result.overpay, startDate,
  };

  const schedule = useMemo(
    () => (result.loan > 0 && result.n > 0 ? buildSchedule(mortgageInput) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.loan, result.n, result.monthly, rate, startDate],
  );

  const canExport = schedule.length > 0;
  const guard = (fn: () => void) => () => {
    if (!canExport) return toast.error('Заполните параметры кредита');
    fn();
  };

  const reportText = [
    'Расчёт ипотеки',
    `Стоимость недвижимости: ${fmt(price)} ₽`,
    `Первоначальный взнос: ${fmt(result.down)} ₽ (${result.downRatio.toFixed(1)}%)`,
    `Срок: ${Math.floor(result.n / 12)} лет (${result.n} мес.)`,
    `Процентная ставка: ${rate}% годовых`,
    `Ежемесячный платёж: ${fmt(result.monthly)} ₽`,
  ].join('\n');

  const copyReport = () => {
    const fallback = (text: string) => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); toast.success('Отчёт скопирован'); }
      catch { toast.error('Не удалось скопировать'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(reportText).then(() => toast.success('Отчёт скопирован'), () => fallback(reportText));
    } else { fallback(reportText); }
  };

  // Сравнение — синхронизируем первый вариант с основной формой
  const mainAsVariant: VariantState = useMemo(() => ({
    id: 0, name: 'Текущий',
    price, downMode, downPercent, downAmount, rate, termMode, years, months,
  }), [price, downMode, downPercent, downAmount, rate, termMode, years, months]);

  const compareVariants = [mainAsVariant, ...variants];
  const compareResults = compareVariants.map((v) => calcResult(v));
  const bestMonthly = Math.min(...compareResults.map((r) => r.monthly).filter((m) => m > 0));

  const updateVariant = (id: number, patch: Partial<VariantState>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const addVariant = () => {
    if (variants.length >= 2) return;
    setVariants((vs) => [
      ...vs,
      makeVariant({
        name: `Вариант ${vs.length + 1}`,
        price, downMode, downPercent, downAmount, rate, termMode, years, months,
      }),
    ]);
  };

  const removeVariant = (id: number) =>
    setVariants((vs) => vs.filter((v) => v.id !== id));

  const enterCompare = () => {
    setVariants([makeVariant({ name: 'Вариант 2', price, downMode, downPercent, downAmount, rate, termMode, years, months })]);
    setCompareMode(true);
  };

  const exitCompare = () => {
    setCompareMode(false);
    setVariants([]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
        <header className="mb-12 animate-fade-in">
          <div className="mb-4 flex items-center gap-2 text-accent">
            <Icon name="Home" size={18} />
            <span className="font-mono text-xs uppercase tracking-[0.2em]">Ипотека</span>
          </div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Ежемесячный платёж
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Аннуитетный расчёт по ипотеке за секунды. Меняйте параметры — результат обновляется сразу.
          </p>
        </header>

        {/* Основная форма */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 animate-fade-in">
            <NumInput label="Стоимость недвижимости" suffix="₽" value={price} onChange={setPrice} />
            <div className="my-7 h-px bg-border" />
            <div className="flex items-stretch gap-2">
              {downMode === 'percent' ? (
                <NumInput label="Первоначальный взнос" value={downPercent} onChange={setDownPercent} suffix="%" max={100} />
              ) : (
                <NumInput label="Первоначальный взнос" value={downAmount} onChange={setDownAmount} suffix="₽" />
              )}
              <Toggle
                options={[{ id: 'percent', label: '%' }, { id: 'amount', label: 'руб.' }]}
                value={downMode} vertical
                onChange={(v) => {
                  const mode = v as DownMode;
                  if (mode === 'percent' && price > 0) setDownPercent(Math.round((downAmount / price) * 10000) / 100);
                  else if (mode === 'amount' && price > 0) setDownAmount(Math.round((price * downPercent) / 100));
                  setDownMode(mode);
                }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {downMode === 'percent' ? `= ${fmt((price * downPercent) / 100)} ₽` : `= ${result.downRatio.toFixed(2)} % от стоимости`}
            </p>
            <div className="my-7 h-px bg-border" />
            <NumInput label="Процентная ставка" suffix="% годовых" value={rate} onChange={setRate} step={0.1} />
            <div className="my-7 h-px bg-border" />
            <div className="flex items-stretch gap-2">
              {termMode === 'years' ? (
                <NumInput label="Срок кредита" value={years} onChange={setYears} suffix="лет" max={50} />
              ) : (
                <NumInput label="Срок кредита" value={months} onChange={setMonths} suffix="мес." max={600} />
              )}
              <Toggle
                options={[{ id: 'years', label: 'лет' }, { id: 'months', label: 'мес.' }]}
                value={termMode} vertical
                onChange={(v) => {
                  const mode = v as TermMode;
                  if (mode === 'months') { setMonths(Math.round(years * 12)); }
                  else { setYears(Math.round((months / 12) * 100) / 100); }
                  setTermMode(mode);
                }}
              />
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <DateCard icon="FileSignature" label="Дата оформления" value={fmtDate(startDate)} />
              <DateCard icon="CalendarClock" label="Первый платёж" value={fmtDate(firstPayment)} />
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-primary p-8 text-primary-foreground animate-fade-in">
              <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">Платёж в месяц</span>
              <div className="mt-3 font-mono text-4xl font-semibold sm:text-5xl">
                {fmt(result.monthly)}<span className="ml-2 text-xl opacity-50">₽</span>
              </div>
            </div>
            <div className="grid gap-4 rounded-3xl border border-border bg-card p-6 animate-fade-in">
              <Stat icon="Banknote" label="Сумма кредита" value={`${fmt(result.loan)} ₽`} />
              <div className="h-px bg-border" />
              <Stat icon="Wallet" label="Первый взнос" value={`${fmt(result.down)} ₽`} />
              <div className="h-px bg-border" />
              <Stat icon="Percent" label="Начисленные проценты" value={`${fmt(result.overpay)} ₽`} accent />
              <div className="h-px bg-border" />
              <Stat icon="Receipt" label="Общая сумма выплат" value={`${fmt(result.total)} ₽`} />
            </div>
            <div className="rounded-3xl border border-border bg-card overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">Краткий отчёт</span>
                <button onClick={copyReport} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                  <Icon name="Copy" size={13} />Скопировать
                </button>
              </div>
              <pre className="px-4 py-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap select-all">{reportText}</pre>
            </div>
          </div>
        </div>

        {/* Кнопки экспорт + сравнение */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ExportBtn icon="Sheet" label="Excel" onClick={guard(() => exportExcel(mortgageInput, schedule))} />
          <ExportBtn icon="FileText" label="PDF" onClick={guard(() => exportPDF(mortgageInput, schedule))} />
          <ExportBtn icon="FileType" label="Word" onClick={guard(() => exportWord(mortgageInput, schedule))} />
          <div className="ml-auto">
            {!compareMode ? (
              <button onClick={enterCompare} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-sm font-medium transition-all hover:border-accent hover:bg-secondary/60">
                <Icon name="Columns2" size={16} className="text-accent" />
                Сравнить варианты
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {variants.length < 2 && (
                  <button onClick={addVariant} className="flex items-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-card px-5 py-4 text-sm font-medium text-accent transition-all hover:bg-accent/10">
                    <Icon name="Plus" size={16} />Добавить вариант
                  </button>
                )}
                <button onClick={exitCompare} className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 px-5 py-4 text-sm font-medium transition-all hover:border-destructive hover:text-destructive">
                  <Icon name="X" size={16} />Закрыть сравнение
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Таблица сравнения */}
        {compareMode && (
          <div className="mt-6 animate-fade-in">
            <CompareTable
              variants={compareVariants}
              results={compareResults}
              bestMonthly={bestMonthly}
              onUpdate={updateVariant}
              onRemove={removeVariant}
            />
          </div>
        )}

        {/* График платежей */}
        {canExport && (
          <div className="mt-6">
            <Schedule rows={schedule} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Таблица сравнения ─────────────────────────────────────── */

const COMPARE_ROWS: { label: string; key: string; format: (r: ReturnType<typeof calcResult>, v: VariantState) => string }[] = [
  { label: 'Ставка', key: 'rate', format: (_, v) => `${v.rate}%` },
  { label: 'Стоимость', key: 'price', format: (_, v) => `${fmt(v.price)} ₽` },
  { label: 'Первый взнос', key: 'down', format: (r) => `${fmt(r.down)} ₽` },
  { label: 'Срок', key: 'n', format: (r) => `${Math.floor(r.n / 12)} л. ${r.n % 12 ? `${r.n % 12} м.` : ''}`.trim() },
  { label: 'Сумма кредита', key: 'loan', format: (r) => `${fmt(r.loan)} ₽` },
  { label: 'Платёж/мес.', key: 'monthly', format: (r) => `${fmt(r.monthly)} ₽` },
  { label: 'Переплата', key: 'overpay', format: (r) => `${fmt(r.overpay)} ₽` },
  { label: 'Итого выплат', key: 'total', format: (r) => `${fmt(r.total)} ₽` },
];

const CompareTable = ({
  variants,
  results,
  bestMonthly,
  onUpdate,
  onRemove,
}: {
  variants: VariantState[];
  results: ReturnType<typeof calcResult>[];
  bestMonthly: number;
  onUpdate: (id: number, patch: Partial<VariantState>) => void;
  onRemove: (id: number) => void;
}) => {
  return (
    <div className="rounded-3xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Сравнение вариантов</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-4 text-left text-xs font-medium text-muted-foreground w-36" />
              {variants.map((v, idx) => {
                const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                const isMain = v.id === 0;
                return (
                  <th key={v.id} className="px-4 py-4 text-left min-w-[180px]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isBest && <Icon name="Trophy" size={13} className="text-accent shrink-0" />}
                        {isMain ? (
                          <span className="font-mono text-sm font-semibold text-foreground">Текущий</span>
                        ) : (
                          <VariantNameInput
                            value={v.name}
                            onChange={(name) => onUpdate(v.id, { name })}
                          />
                        )}
                      </div>
                      {!isMain && (
                        <button onClick={() => onRemove(v.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                          <Icon name="X" size={13} />
                        </button>
                      )}
                    </div>
                    {isBest && (
                      <span className="mt-1 block font-mono text-[10px] text-accent/70">лучший платёж</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, rowIdx) => (
              <tr key={row.key} className={rowIdx % 2 === 0 ? 'bg-secondary/20' : ''}>
                <td className="px-6 py-3.5 text-xs text-muted-foreground font-medium whitespace-nowrap">{row.label}</td>
                {variants.map((v, idx) => {
                  const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                  const isMonthlyRow = row.key === 'monthly';
                  const isMain = v.id === 0;
                  return (
                    <td key={v.id} className="px-4 py-3.5">
                      {!isMain && (row.key === 'rate' || row.key === 'n') ? (
                        <CompareInlineInput variant={v} field={row.key} onUpdate={onUpdate} />
                      ) : (
                        <span className={`font-mono text-sm font-semibold ${isMonthlyRow && isBest ? 'text-accent' : ''}`}>
                          {row.format(results[idx], v)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const VariantNameInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => { onChange(raw || value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onChange(raw || value); setEditing(false); } }}
        className="w-28 bg-transparent font-mono text-sm font-semibold outline-none border-b border-accent"
      />
    );
  }
  return (
    <button onClick={() => { setRaw(value); setEditing(true); }} className="font-mono text-sm font-semibold text-foreground hover:text-accent transition-colors text-left">
      {value}
    </button>
  );
};

const CompareInlineInput = ({
  variant: v,
  field,
  onUpdate,
}: {
  variant: VariantState;
  field: string;
  onUpdate: (id: number, patch: Partial<VariantState>) => void;
}) => {
  const isRate = field === 'rate';
  const currentValue = isRate ? v.rate : (v.termMode === 'years' ? v.years : v.months);
  const suffix = isRate ? '%' : (v.termMode === 'years' ? 'л.' : 'м.');
  const [raw, setRaw] = useState('');
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode={isRate ? 'decimal' : 'numeric'}
        value={focused ? raw : String(currentValue)}
        onFocus={() => { setFocused(true); setRaw(String(currentValue)); }}
        onBlur={() => {
          setFocused(false);
          const cleaned = raw.replace(',', '.');
          const val = parseFloat(cleaned);
          if (!Number.isNaN(val)) {
            if (isRate) onUpdate(v.id, { rate: val });
            else if (v.termMode === 'years') onUpdate(v.id, { years: val, months: Math.round(val * 12) });
            else onUpdate(v.id, { months: val, years: Math.round((val / 12) * 100) / 100 });
          }
        }}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d,.]/g, ''))}
        className="w-16 bg-secondary/60 rounded-lg px-2 py-1 font-mono text-sm font-semibold outline-none border border-transparent focus:border-accent"
      />
      <span className="font-mono text-xs text-muted-foreground">{suffix}</span>
      {!isRate && (
        <Toggle
          options={[{ id: 'years', label: 'л' }, { id: 'months', label: 'м' }]}
          value={v.termMode}
          onChange={(val) => {
            const mode = val as TermMode;
            if (mode === 'months') onUpdate(v.id, { termMode: mode, months: Math.round(v.years * 12) });
            else onUpdate(v.id, { termMode: mode, years: Math.round((v.months / 12) * 100) / 100 });
          }}
        />
      )}
    </div>
  );
};

/* ── Вспомогательные компоненты ────────────────────────────── */

const fmtInput = (n: number) => {
  if (Number.isNaN(n) || n === 0) return '';
  const hasDecimals = n % 1 !== 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: hasDecimals ? 2 : 0, minimumFractionDigits: 0 }).format(n);
};

const NumInput = ({ value, onChange, label, suffix, step = 1, max }: {
  value: number; onChange: (n: number) => void;
  label?: string; suffix?: string; step?: number; max?: number;
}) => {
  const isDecimal = step < 1;
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');
  const floated = focused || value !== 0;
  const displayValue = focused ? raw : fmtInput(value);
  return (
    <div className="relative w-full rounded-xl border border-input bg-secondary/40 transition-colors focus-within:border-accent">
      {label && (
        <label className={`pointer-events-none absolute left-4 transition-all duration-200 font-mono ${floated ? 'top-2 text-[10px] text-muted-foreground/70' : 'top-1/2 -translate-y-1/2 text-base text-muted-foreground/50'}`}>
          {label}
        </label>
      )}
      <div className="flex items-center px-4">
        <input
          type="text" inputMode={isDecimal ? 'decimal' : 'numeric'} value={displayValue}
          onFocus={() => { setFocused(true); setRaw(value === 0 ? '' : String(value)); }}
          onBlur={() => {
            setFocused(false);
            const cleaned = raw.replace(/\s/g, '').replace(',', '.');
            let v = parseFloat(cleaned);
            if (max !== undefined && v > max) v = max;
            onChange(Number.isNaN(v) ? 0 : v);
          }}
          onChange={(e) => {
            const val = e.target.value.replace(/[^\d,.\s]/g, '');
            setRaw(val);
            const cleaned = val.replace(/\s/g, '').replace(',', '.');
            let v = parseFloat(cleaned);
            if (max !== undefined && v > max) v = max;
            if (!Number.isNaN(v)) onChange(v);
          }}
          className={`w-full bg-transparent font-mono text-lg font-medium outline-none ${label ? 'pb-2.5 pt-6' : 'py-3.5'}`}
        />
        {suffix && <span className="ml-2 font-mono text-sm text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
};

const Toggle = ({ options, value, onChange, vertical = false }: {
  options: { id: string; label: string }[]; value: string;
  onChange: (v: string) => void; vertical?: boolean;
}) => (
  <div className={`flex shrink-0 rounded-xl border border-border bg-secondary/60 p-0.5 ${vertical ? 'flex-col' : 'flex-row'}`}>
    {options.map((o) => (
      <button key={o.id} onClick={() => onChange(o.id)}
        className={`rounded-lg px-3 font-mono text-xs font-semibold transition-all ${vertical ? 'py-2' : 'py-1.5'} ${value === o.id ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const Stat = ({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-accent/10 text-accent' : 'bg-secondary text-muted-foreground'}`}>
        <Icon name={icon} size={18} />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <span className={`font-mono text-base font-semibold ${accent ? 'text-accent' : ''}`}>{value}</span>
  </div>
);

const DateCard = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-secondary/30 p-3">
    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
      <Icon name={icon} size={14} /><span className="text-xs">{label}</span>
    </div>
    <span className="font-mono text-sm font-medium">{value}</span>
  </div>
);

const ExportBtn = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-sm font-medium transition-all hover:border-accent hover:bg-secondary/60 sm:flex-none sm:px-8">
    <Icon name={icon} size={16} className="text-accent" />
    Скачать в {label}
  </button>
);

export default Index;
