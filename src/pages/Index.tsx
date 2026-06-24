import { useState, useMemo } from 'react';
import Icon from '@/components/ui/icon';

type DownMode = 'percent' | 'amount';
type TermMode = 'years' | 'months';

const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

const Index = () => {
  const [price, setPrice] = useState(8000000);
  const [downMode, setDownMode] = useState<DownMode>('percent');
  const [downPercent, setDownPercent] = useState(20);
  const [downAmount, setDownAmount] = useState(1600000);
  const [rate, setRate] = useState(18);
  const [termMode, setTermMode] = useState<TermMode>('years');
  const [years, setYears] = useState(20);
  const [months, setMonths] = useState(240);

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
    return { down, loan, monthly, total, overpay, downRatio: price ? down / price : 0 };
  }, [price, downMode, downPercent, downAmount, rate, termMode, years, months]);

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
                onChange={(v) => setDownMode(v as DownMode)}
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
                : `= ${(result.downRatio * 100).toFixed(1)} % от стоимости`}
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
                icon="TrendingUp"
                label="Переплата"
                value={`${fmt(result.overpay)} ₽`}
                accent
              />
              <div className="h-px bg-border" />
              <Stat icon="Coins" label="Всего выплат" value={`${fmt(result.total)} ₽`} />
            </div>
          </div>
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
}) => (
  <div className="flex items-center rounded-xl border border-input bg-secondary/40 px-4 transition-colors focus-within:border-accent">
    <input
      type="number"
      value={Number.isNaN(value) ? '' : value}
      step={step}
      onChange={(e) => {
        let v = parseFloat(e.target.value);
        if (max !== undefined && v > max) v = max;
        onChange(Number.isNaN(v) ? 0 : v);
      }}
      className="w-full bg-transparent py-3.5 font-mono text-lg font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    {suffix && <span className="ml-2 font-mono text-sm text-muted-foreground">{suffix}</span>}
  </div>
);

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
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
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

export default Index;
