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
  const startDate = useMemo(() => new Date(), []);

  const updateVariant = (id: number, patch: Partial<VariantState>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const addVariant = () => {
    if (variants.length >= 3) return;
    const base = variants[variants.length - 1];
    setVariants((vs) => [
      ...vs,
      makeVariant({
        name: `Вариант ${vs.length + 1}`,
        price: base.price,
        downMode: base.downMode,
        downPercent: base.downPercent,
        downAmount: base.downAmount,
        rate: base.rate,
        termMode: base.termMode,
        years: base.years,
        months: base.months,
      }),
    ]);
  };

  const removeVariant = (id: number) => {
    if (variants.length <= 1) return;
    setVariants((vs) => vs.filter((v) => v.id !== id));
  };

  const enterCompare = () => {
    if (variants.length === 1) addVariant();
    setCompareMode(true);
  };

  const exitCompare = () => {
    setCompareMode(false);
    setVariants((vs) => [vs[0]]);
  };

  const results = variants.map((v) => calcResult(v));
  const bestMonthly = Math.min(...results.map((r) => r.monthly).filter((m) => m > 0));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={`mx-auto px-5 py-12 sm:py-20 ${compareMode ? 'max-w-7xl' : 'max-w-5xl'}`}>
        <header className="mb-10 animate-fade-in">
          <div className="mb-4 flex items-center gap-2 text-accent">
            <Icon name="Home" size={18} />
            <span className="font-mono text-xs uppercase tracking-[0.2em]">Ипотека</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                Ежемесячный платёж
              </h1>
              <p className="mt-3 max-w-md text-muted-foreground">
                Аннуитетный расчёт по ипотеке за секунды. Меняйте параметры — результат обновляется сразу.
              </p>
            </div>
            {!compareMode ? (
              <button
                onClick={enterCompare}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium transition-all hover:border-accent hover:bg-secondary/60"
              >
                <Icon name="Columns2" size={16} className="text-accent" />
                Сравнить варианты
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {variants.length < 3 && (
                  <button
                    onClick={addVariant}
                    className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-5 py-3 text-sm font-medium transition-all hover:border-accent hover:bg-secondary/60"
                  >
                    <Icon name="Plus" size={16} className="text-accent" />
                    Добавить вариант
                  </button>
                )}
                <button
                  onClick={exitCompare}
                  className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 px-5 py-3 text-sm font-medium transition-all hover:border-destructive hover:text-destructive"
                >
                  <Icon name="X" size={16} />
                  Выйти из сравнения
                </button>
              </div>
            )}
          </div>
        </header>

        <div className={`grid gap-6 ${compareMode ? `grid-cols-1 md:grid-cols-${variants.length}` : 'grid-cols-1'}`}>
          {variants.map((v, idx) => (
            <MortgageCard
              key={v.id}
              variant={v}
              result={results[idx]}
              startDate={startDate}
              compareMode={compareMode}
              isBest={compareMode && results[idx].monthly === bestMonthly && results[idx].monthly > 0}
              canRemove={compareMode && variants.length > 2}
              onRemove={() => removeVariant(v.id)}
              onChange={(patch) => updateVariant(v.id, patch)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const MortgageCard = ({
  variant: v,
  result,
  startDate,
  compareMode,
  isBest,
  canRemove,
  onRemove,
  onChange,
}: {
  variant: VariantState;
  result: ReturnType<typeof calcResult>;
  startDate: Date;
  compareMode: boolean;
  isBest: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<VariantState>) => void;
}) => {
  const firstPayment = addMonths(startDate, 1);

  const mortgageInput: MortgageInput = {
    price: v.price,
    down: result.down,
    loan: result.loan,
    rate: v.rate,
    months: result.n,
    monthly: result.monthly,
    total: result.total,
    overpay: result.overpay,
    startDate,
  };

  const schedule = useMemo(
    () => (result.loan > 0 && result.n > 0 ? buildSchedule(mortgageInput) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.loan, result.n, result.monthly, v.rate, startDate],
  );

  const canExport = schedule.length > 0;
  const guard = (fn: () => void) => () => {
    if (!canExport) return toast.error('Заполните параметры кредита');
    fn();
  };

  const reportText = [
    `Расчёт ипотеки — ${v.name}`,
    `Стоимость недвижимости: ${fmt(v.price)} ₽`,
    `Первоначальный взнос: ${fmt(result.down)} ₽ (${result.downRatio.toFixed(1)}%)`,
    `Срок: ${Math.floor(result.n / 12)} лет (${result.n} мес.)`,
    `Процентная ставка: ${v.rate}% годовых`,
    `Ежемесячный платёж: ${fmt(result.monthly)} ₽`,
  ].join('\n');

  const copyReport = () => {
    const fallback = (text: string) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); toast.success('Отчёт скопирован'); }
      catch { toast.error('Не удалось скопировать'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(reportText).then(() => toast.success('Отчёт скопирован'), () => fallback(reportText));
    } else {
      fallback(reportText);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header карточки в режиме сравнения */}
      {compareMode && (
        <div className={`flex items-center justify-between rounded-2xl px-5 py-3 ${isBest ? 'bg-accent/10 border border-accent/30' : 'bg-secondary/40 border border-border'}`}>
          <div className="flex items-center gap-2">
            {isBest && <Icon name="Trophy" size={15} className="text-accent" />}
            <span className={`font-mono text-sm font-semibold ${isBest ? 'text-accent' : 'text-foreground'}`}>
              {v.name}
            </span>
            {isBest && <span className="font-mono text-xs text-accent/70">· лучший платёж</span>}
          </div>
          {canRemove && (
            <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
              <Icon name="X" size={15} />
            </button>
          )}
        </div>
      )}

      <div className={`grid gap-6 ${compareMode ? 'grid-cols-1' : 'lg:grid-cols-[1.1fr_0.9fr]'}`}>
        {/* Form */}
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 animate-fade-in">
          <NumInput label="Стоимость недвижимости" suffix="₽" value={v.price} onChange={(val) => onChange({ price: val })} />

          <div className="my-7 h-px bg-border" />

          <div className="flex items-stretch gap-2">
            {v.downMode === 'percent' ? (
              <NumInput label="Первоначальный взнос" value={v.downPercent} onChange={(val) => onChange({ downPercent: val })} suffix="%" max={100} />
            ) : (
              <NumInput label="Первоначальный взнос" value={v.downAmount} onChange={(val) => onChange({ downAmount: val })} suffix="₽" />
            )}
            <Toggle
              options={[{ id: 'percent', label: '%' }, { id: 'amount', label: 'руб.' }]}
              value={v.downMode}
              vertical
              onChange={(val) => {
                const mode = val as DownMode;
                if (mode === 'percent' && v.price > 0) {
                  onChange({ downMode: mode, downPercent: Math.round((v.downAmount / v.price) * 10000) / 100 });
                } else if (mode === 'amount' && v.price > 0) {
                  onChange({ downMode: mode, downAmount: Math.round((v.price * v.downPercent) / 100) });
                } else {
                  onChange({ downMode: mode });
                }
              }}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {v.downMode === 'percent'
              ? `= ${fmt((v.price * v.downPercent) / 100)} ₽`
              : `= ${result.downRatio.toFixed(2)} % от стоимости`}
          </p>

          <div className="my-7 h-px bg-border" />

          <NumInput label="Процентная ставка" suffix="% годовых" value={v.rate} onChange={(val) => onChange({ rate: val })} step={0.1} />

          <div className="my-7 h-px bg-border" />

          <div className="flex items-stretch gap-2">
            {v.termMode === 'years' ? (
              <NumInput label="Срок кредита" value={v.years} onChange={(val) => onChange({ years: val })} suffix="лет" max={50} />
            ) : (
              <NumInput label="Срок кредита" value={v.months} onChange={(val) => onChange({ months: val })} suffix="мес." max={600} />
            )}
            <Toggle
              options={[{ id: 'years', label: 'лет' }, { id: 'months', label: 'мес.' }]}
              value={v.termMode}
              vertical
              onChange={(val) => {
                const mode = val as TermMode;
                if (mode === 'months') {
                  onChange({ termMode: mode, months: Math.round(v.years * 12) });
                } else {
                  onChange({ termMode: mode, years: Math.round((v.months / 12) * 100) / 100 });
                }
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
          <div className={`rounded-3xl p-8 text-primary-foreground animate-fade-in ${isBest ? 'bg-accent' : 'bg-primary'}`}>
            <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
              Платёж в месяц
            </span>
            <div className="mt-3 font-mono text-4xl font-semibold sm:text-5xl">
              {fmt(result.monthly)}
              <span className="ml-2 text-xl opacity-50">₽</span>
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
              <button
                onClick={copyReport}
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon name="Copy" size={13} />
                Скопировать
              </button>
            </div>
            <pre className="px-4 py-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap select-all">
              {reportText}
            </pre>
          </div>

          {!compareMode && (
            <>
              <div className="flex flex-wrap gap-3">
                <ExportBtn icon="Sheet" label="Excel" onClick={guard(() => exportExcel(mortgageInput, schedule))} />
                <ExportBtn icon="FileText" label="PDF" onClick={guard(() => exportPDF(mortgageInput, schedule))} />
                <ExportBtn icon="FileType" label="Word" onClick={guard(() => exportWord(mortgageInput, schedule))} />
              </div>
              {canExport && (
                <div className="mt-2">
                  <Schedule rows={schedule} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-3 flex items-baseline justify-between">
      <span className="text-sm font-medium">{label}</span>
      {suffix && <span className="font-mono text-xs text-muted-foreground">{suffix}</span>}
    </div>
    {children}
  </div>
);

const fmtInput = (n: number) => {
  if (Number.isNaN(n) || n === 0) return '';
  const hasDecimals = n % 1 !== 0;
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(n);
};

const NumInput = ({
  value,
  onChange,
  label,
  suffix,
  step = 1,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  suffix?: string;
  step?: number;
  max?: number;
}) => {
  const isDecimal = step < 1;
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const hasValue = value !== 0;
  const floated = focused || hasValue;
  const displayValue = focused ? raw : fmtInput(value);

  return (
    <div className="relative w-full rounded-xl border border-input bg-secondary/40 transition-colors focus-within:border-accent">
      {label && (
        <label
          className={`pointer-events-none absolute left-4 transition-all duration-200 font-mono ${
            floated
              ? 'top-2 text-[10px] text-muted-foreground/70'
              : 'top-1/2 -translate-y-1/2 text-base text-muted-foreground/50'
          }`}
        >
          {label}
        </label>
      )}
      <div className="flex items-center px-4">
        <input
          type="text"
          inputMode={isDecimal ? 'decimal' : 'numeric'}
          value={displayValue}
          onFocus={() => {
            setFocused(true);
            setRaw(value === 0 ? '' : String(value));
          }}
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

const Toggle = ({
  options,
  value,
  onChange,
  vertical = false,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  vertical?: boolean;
}) => (
  <div className={`flex shrink-0 rounded-xl border border-border bg-secondary/60 p-0.5 ${vertical ? 'flex-col' : 'flex-row'}`}>
    {options.map((o) => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`rounded-lg px-3 font-mono text-xs font-semibold transition-all ${vertical ? 'py-2' : 'py-1.5'} ${
          value === o.id
            ? 'bg-accent text-accent-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Stat = ({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          accent ? 'bg-accent/10 text-accent' : 'bg-secondary text-muted-foreground'
        }`}
      >
        <Icon name={icon} size={18} />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <span className={`font-mono text-base font-semibold ${accent ? 'text-accent' : ''}`}>
      {value}
    </span>
  </div>
);

const DateCard = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-secondary/30 p-3">
    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
      <Icon name={icon} size={14} />
      <span className="text-xs">{label}</span>
    </div>
    <span className="font-mono text-sm font-medium">{value}</span>
  </div>
);

const ExportBtn = ({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-sm font-medium transition-all hover:border-accent hover:bg-secondary/60 sm:flex-none sm:px-8"
  >
    <Icon name={icon} size={16} className="text-accent" />
    Скачать в {label}
  </button>
);

 
const _Field = Field;

export default Index;
