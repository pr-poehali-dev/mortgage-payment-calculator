import { useState, useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import Schedule from '@/components/Schedule';
import { buildSchedule, fmt, fmtDate, addMonths, MortgageInput } from '@/lib/mortgage';
import { exportExcel, exportPDF, exportWord } from '@/lib/export';

type DownMode = 'percent' | 'amount';
type TermMode = 'years' | 'months';

const Index = () => {
  const [price, setPrice] = useState(8000000);
  const [downMode, setDownMode] = useState<DownMode>('percent');
  const [downPercent, setDownPercent] = useState(20);
  const [downAmount, setDownAmount] = useState(1600000);
  const [rate, setRate] = useState(18);
  const [termMode, setTermMode] = useState<TermMode>('years');
  const [years, setYears] = useState(20);
  const [months, setMonths] = useState(240);

  const startDate = useMemo(() => new Date(), []);

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
    return {
      down,
      loan,
      monthly,
      total,
      overpay,
      n,
      downRatio: price ? (down / price) * 100 : 0,
    };
  }, [price, downMode, downPercent, downAmount, rate, termMode, years, months]);

  const firstPayment = addMonths(startDate, 1);

  const mortgageInput: MortgageInput = {
    price,
    down: result.down,
    loan: result.loan,
    rate,
    months: result.n,
    monthly: result.monthly,
    total: result.total,
    overpay: result.overpay,
    startDate,
  };

  const schedule = useMemo(
    () => (result.loan > 0 && result.n > 0 ? buildSchedule(mortgageInput) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.loan, result.n, result.monthly, rate, startDate],
  );

  const reportText = [
    'Расчёт ипотеки',
    `Стоимость недвижимости: ${fmt(price)} ₽`,
    `Первоначальный взнос: ${fmt(result.down)} ₽ (${result.downRatio.toFixed(1)}%)`,
    `Срок: ${Math.floor(result.n / 12)} лет (${result.n} мес.)`,
    `Процентная ставка: ${rate}% годовых`,
    `Ежемесячный платёж: ${fmt(result.monthly)} ₽`,
  ].join('\n');

  const copyReport = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText).then(
          () => toast.success('Отчёт скопирован'),
          () => fallbackCopy(reportText),
        );
      } else {
        fallbackCopy(reportText);
      }
    } catch {
      fallbackCopy(reportText);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      toast.success('Отчёт скопирован');
    } catch {
      toast.error('Не удалось скопировать');
    }
    document.body.removeChild(ta);
  };

  const canExport = schedule.length > 0;
  const guard = (fn: () => void) => () => {
    if (!canExport) return toast.error('Заполните параметры кредита');
    fn();
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

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Form */}
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 animate-fade-in">
            <Field label="Стоимость недвижимости" suffix="₽">
              <NumInput value={price} onChange={setPrice} />
            </Field>

            <div className="my-7 h-px bg-border" />

            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Первоначальный взнос</span>
              <Toggle
                options={[
                  { id: 'percent', label: '%' },
                  { id: 'amount', label: '₽' },
                ]}
                value={downMode}
                onChange={(v) => {
                  const mode = v as DownMode;
                  if (mode === 'percent' && price > 0) {
                    const pct = Math.round((downAmount / price) * 10000) / 100;
                    setDownPercent(pct);
                  } else if (mode === 'amount' && price > 0) {
                    setDownAmount(Math.round((price * downPercent) / 100));
                  }
                  setDownMode(mode);
                }}
              />
            </div>
            {downMode === 'percent' ? (
              <NumInput value={downPercent} onChange={setDownPercent} suffix="%" max={100} />
            ) : (
              <NumInput value={downAmount} onChange={setDownAmount} suffix="₽" />
            )}
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {downMode === 'percent'
                ? `= ${fmt((price * downPercent) / 100)} ₽`
                : `= ${result.downRatio.toFixed(2)} % от стоимости`}
            </p>

            <div className="my-7 h-px bg-border" />

            <Field label="Процентная ставка" suffix="% годовых">
              <NumInput value={rate} onChange={setRate} step={0.1} />
            </Field>

            <div className="my-7 h-px bg-border" />

            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Срок кредита</span>
              <Toggle
                options={[
                  { id: 'years', label: 'Лет' },
                  { id: 'months', label: 'Мес.' },
                ]}
                value={termMode}
                onChange={(v) => setTermMode(v as TermMode)}
              />
            </div>
            {termMode === 'years' ? (
              <NumInput value={years} onChange={setYears} suffix="лет" max={50} />
            ) : (
              <NumInput value={months} onChange={setMonths} suffix="мес." max={600} />
            )}

            <div className="mt-7 grid grid-cols-2 gap-3">
              <DateCard icon="FileSignature" label="Дата оформления" value={fmtDate(startDate)} />
              <DateCard icon="CalendarClock" label="Первый платёж" value={fmtDate(firstPayment)} />
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-primary p-8 text-primary-foreground animate-fade-in">
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
              <Stat
                icon="Percent"
                label="Начисленные проценты"
                value={`${fmt(result.overpay)} ₽`}
                accent
              />
              <div className="h-px bg-border" />
              <Stat
                icon="TrendingUp"
                label="Общая переплата"
                value={`${fmt(result.overpay)} ₽`}
                accent
              />
              <div className="h-px bg-border" />
              <Stat icon="Coins" label="Долг + проценты" value={`${fmt(result.total)} ₽`} />
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
          </div>
        </div>

        {/* Export */}
        <div className="mt-6 flex flex-wrap gap-3">
          <ExportBtn icon="Sheet" label="Excel" onClick={guard(() => exportExcel(mortgageInput, schedule))} />
          <ExportBtn icon="FileText" label="PDF" onClick={guard(() => exportPDF(mortgageInput, schedule))} />
          <ExportBtn
            icon="FileType"
            label="Word"
            onClick={guard(() => {
              exportWord(mortgageInput, schedule);
            })}
          />
        </div>

        {/* Schedule */}
        {canExport && (
          <div className="mt-6">
            <Schedule rows={schedule} />
          </div>
        )}
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

const fmtInput = (n: number, isDecimal: boolean) => {
  if (Number.isNaN(n) || n === 0) return '';
  if (isDecimal) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));
};

const NumInput = ({
  value,
  onChange,
  suffix,
  step = 1,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
  max?: number;
}) => {
  const isDecimal = step < 1;
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const displayValue = focused
    ? raw
    : fmtInput(value, isDecimal);

  return (
    <div className="flex items-center rounded-xl border border-input bg-secondary/40 px-4 transition-colors focus-within:border-accent">
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
        className="w-full bg-transparent py-3.5 font-mono text-lg font-medium outline-none"
      />
      {suffix && <span className="ml-2 font-mono text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
};

const Toggle = ({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex rounded-lg bg-secondary p-0.5">
    {options.map((o) => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition-all ${
          value === o.id
            ? 'bg-card text-foreground shadow-sm'
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

export default Index;