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

let _nextId = 2;
const genId = () => _nextId++;

let _variantSeq = 2;
const nextVariantNum = () => _variantSeq++;

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

function makeReportText(name: string, v: VariantState, r: ReturnType<typeof calcResult>) {
  return [
    `Расчёт ипотеки — ${name}`,
    `Стоимость недвижимости: ${fmt(v.price)} ₽`,
    `Первоначальный взнос: ${fmt(r.down)} ₽ (${r.downRatio.toFixed(1)}%)`,
    `Срок: ${Math.floor(r.n / 12)} лет (${r.n} мес.)`,
    `Процентная ставка: ${v.rate}% годовых`,
    `Ежемесячный платёж: ${fmt(r.monthly)} ₽`,
  ].join('\n');
}

// Общий стиль для select-контролов
const SELECT_CLS = 'rounded-lg border border-accent/60 bg-accent/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-accent outline-none cursor-pointer hover:bg-accent/20 transition-colors';

const Index = () => {
  const [compareMode, setCompareMode] = useState(false);
  const [variants, setVariants] = useState<VariantState[]>([]);

  const [price, setPrice] = useState(8000000);
  const [downMode, setDownMode] = useState<DownMode>('percent');
  const [downPercent, setDownPercent] = useState(20);
  const [downAmount, setDownAmount] = useState(1600000);
  const [rate, setRate] = useState(18);
  const [termMode, setTermMode] = useState<TermMode>('years');
  const [years, setYears] = useState(20);
  const [months, setMonths] = useState(240);

  const [reportVariantId, setReportVariantId] = useState<number | 'all' | null>(null);
  const [scheduleVariantId, setScheduleVariantId] = useState<number | null>(null);
  // Выбранный вариант для экспорта (null = Вариант 1, -1 = все)
  const [exportVariantId, setExportVariantId] = useState<number | -1 | null>(null);

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

  const mainVariant: VariantState = useMemo(() => ({
    id: 0, name: 'Вариант 1',
    price, downMode, downPercent, downAmount, rate, termMode, years, months,
  }), [price, downMode, downPercent, downAmount, rate, termMode, years, months]);

  const allVariants = useMemo(() => [mainVariant, ...variants], [mainVariant, variants]);
  const allResults = useMemo(() => allVariants.map(calcResult), [allVariants]);
  const bestMonthly = useMemo(
    () => Math.min(...allResults.map((r) => r.monthly).filter((m) => m > 0)),
    [allResults],
  );

  const updateVariant = (id: number, patch: Partial<VariantState>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const addVariant = () => {
    if (variants.length >= 9) return;
    const num = nextVariantNum();
    setVariants((vs) => [...vs, {
      id: genId(), name: `Вариант ${num}`,
      price, downMode, downPercent, downAmount, rate, termMode, years, months,
    }]);
  };

  const removeVariant = (id: number) => {
    setVariants((vs) => vs.filter((v) => v.id !== id));
    if (reportVariantId === id) setReportVariantId(null);
    if (scheduleVariantId === id) setScheduleVariantId(null);
    if (exportVariantId === id) setExportVariantId(null);
  };

  const enterCompare = () => {
    const num = nextVariantNum();
    setVariants([{ id: genId(), name: `Вариант ${num}`, price, downMode, downPercent, downAmount, rate, termMode, years, months }]);
    setCompareMode(true);
  };

  const exitCompare = () => {
    setCompareMode(false);
    setVariants([]);
    setReportVariantId(null);
    setScheduleVariantId(null);
    setExportVariantId(null);
    _variantSeq = 2;
  };

  // Текст отчёта
  const reportText = useMemo(() => {
    if (!compareMode || reportVariantId === null) return makeReportText('Вариант 1', mainVariant, result);
    if (reportVariantId === 'all') return allVariants.map((v, i) => makeReportText(v.name, v, allResults[i])).join('\n\n---\n\n');
    const v = variants.find((x) => x.id === reportVariantId);
    if (!v) return makeReportText('Вариант 1', mainVariant, result);
    return makeReportText(v.name, v, calcResult(v));
  }, [compareMode, reportVariantId, mainVariant, result, allVariants, allResults, variants]);

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

  // График
  const scheduleVariant = scheduleVariantId == null
    ? { sch: schedule, name: 'Вариант 1' }
    : (() => {
        const v = variants.find((x) => x.id === scheduleVariantId) ?? mainVariant;
        const r = calcResult(v);
        const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate };
        return { sch: r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [], name: v.name };
      })();

  // Экспорт с выбором варианта
  const getExportData = (): { input: MortgageInput; sch: ReturnType<typeof buildSchedule> }[] => {
    if (!compareMode || exportVariantId === null) return [{ input: mortgageInput, sch: schedule }];
    if (exportVariantId === -1) {
      return allVariants.map((v, i) => {
        const r = allResults[i];
        const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate };
        const sch = r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [];
        return { input: inp, sch };
      });
    }
    const v = allVariants.find((x) => x.id === exportVariantId) ?? mainVariant;
    const r = calcResult(v);
    const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate };
    const sch = r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [];
    return [{ input: inp, sch }];
  };

  const guard = (fn: () => void) => () => {
    if (!canExport) return toast.error('Заполните параметры кредита');
    fn();
  };

  const doExport = (type: 'excel' | 'pdf' | 'word') => guard(() => {
    const data = getExportData();
    data.forEach(({ input, sch }) => {
      if (type === 'excel') exportExcel(input, sch);
      else if (type === 'pdf') exportPDF(input, sch);
      else exportWord(input, sch);
    });
  })();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Шапка-полоса */}
      <div className="bg-primary text-primary-foreground px-5 py-2.5 flex items-center gap-2">
        <Icon name="Home" size={14} className="opacity-70" />
        <span className="text-xs font-medium tracking-wide opacity-90">Ипотечный калькулятор — аннуитетный</span>
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-4 pb-10 sm:px-5">
        {/* Основная форма */}
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Левая колонка — параметры */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 animate-fade-in">
            <NumInput label="Стоимость недвижимости" suffix="₽" value={price} onChange={setPrice} />
            <div className="my-4 h-px bg-border" />
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
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              {downMode === 'percent' ? `= ${fmt((price * downPercent) / 100)} ₽` : `= ${result.downRatio.toFixed(2)} % от стоимости`}
            </p>
            <div className="my-4 h-px bg-border" />
            <NumInput label="Процентная ставка" suffix="% годовых" value={rate} onChange={setRate} step={0.1} />
            <div className="my-4 h-px bg-border" />
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
                  if (mode === 'months') setMonths(Math.round(years * 12));
                  else setYears(Math.round((months / 12) * 100) / 100);
                  setTermMode(mode);
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <DateCard icon="FileSignature" label="Оформление" value={fmtDate(startDate)} />
              <DateCard icon="CalendarClock" label="Первый платёж" value={fmtDate(firstPayment)} />
            </div>
          </div>

          {/* Правая колонка — результаты на голубом фоне */}
          <div className="flex flex-col gap-3">
            {/* Главный показатель */}
            <div className="rounded-2xl bg-sky-500 p-5 text-white animate-fade-in">
              <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-70">Вариант 1 · Платёж в месяц</span>
              <div className="mt-2 font-mono text-4xl font-bold sm:text-5xl">
                {fmt(result.monthly)}<span className="ml-2 text-lg opacity-50">₽</span>
              </div>
            </div>

            {/* Статистика */}
            <div className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 animate-fade-in dark:border-sky-900 dark:bg-sky-950/30">
              <Stat icon="Banknote" label="Сумма кредита" value={`${fmt(result.loan)} ₽`} />
              <div className="h-px bg-sky-200 dark:bg-sky-800" />
              <Stat icon="Wallet" label="Первый взнос" value={`${fmt(result.down)} ₽`} />
              <div className="h-px bg-sky-200 dark:bg-sky-800" />
              <Stat icon="Percent" label="Начисленные проценты" value={`${fmt(result.overpay)} ₽`} accent />
              <div className="h-px bg-sky-200 dark:bg-sky-800" />
              <Stat icon="Receipt" label="Итого выплат" value={`${fmt(result.total)} ₽`} />
            </div>

            {/* Краткий отчёт */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">Отчёт</span>
                  {compareMode && (
                    <select
                      value={reportVariantId === null ? '__main__' : reportVariantId === 'all' ? '__all__' : String(reportVariantId)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__main__') setReportVariantId(null);
                        else if (val === '__all__') setReportVariantId('all');
                        else setReportVariantId(Number(val));
                      }}
                      className={SELECT_CLS}
                    >
                      <option value="__main__">Вариант 1</option>
                      {variants.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                      <option value="__all__">Все варианты</option>
                    </select>
                  )}
                </div>
                <button onClick={copyReport} className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                  <Icon name="Copy" size={12} />Скопировать
                </button>
              </div>
              <pre className="px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap select-all">{reportText}</pre>
            </div>
          </div>
        </div>

        {/* Кнопки экспорт + сравнение */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ExportBtn label="Excel" onClick={() => doExport('excel')} />
          <ExportBtn label="PDF" onClick={() => doExport('pdf')} />
          <ExportBtn label="Word" onClick={() => doExport('word')} />

          {/* Выбор варианта для экспорта — только в режиме сравнения */}
          {compareMode && (
            <select
              value={exportVariantId === null ? '__main__' : exportVariantId === -1 ? '__all__' : String(exportVariantId)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__main__') setExportVariantId(null);
                else if (val === '__all__') setExportVariantId(-1);
                else setExportVariantId(Number(val));
              }}
              className={SELECT_CLS}
            >
              <option value="__main__">Вариант 1</option>
              {variants.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
              <option value="__all__">Все варианты</option>
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!compareMode ? (
              <button onClick={enterCompare} className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-md transition-all hover:opacity-90 active:scale-95">
                <Icon name="Columns2" size={16} />
                Сравнить варианты
              </button>
            ) : (
              <>
                {variants.length < 9 && (
                  <button onClick={addVariant} className="flex items-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-card px-4 py-3 text-sm font-medium text-accent transition-all hover:bg-accent/10">
                    <Icon name="Plus" size={16} />Добавить
                  </button>
                )}
                <button onClick={exitCompare} className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-sm font-medium transition-all hover:border-destructive hover:text-destructive">
                  <Icon name="X" size={16} />Закрыть
                </button>
              </>
            )}
          </div>
        </div>

        {/* Таблица сравнения */}
        {compareMode && (
          <div className="mt-4 animate-fade-in">
            <CompareTable
              variants={allVariants}
              results={allResults}
              bestMonthly={bestMonthly}
              onUpdate={updateVariant}
              onRemove={removeVariant}
            />
          </div>
        )}

        {/* График платежей */}
        {(canExport || scheduleVariant.sch.length > 0) && (
          <div className="mt-4">
            {compareMode && (
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">График:</span>
                <select
                  value={scheduleVariantId === null ? '__main__' : String(scheduleVariantId)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setScheduleVariantId(val === '__main__' ? null : Number(val));
                  }}
                  className={SELECT_CLS}
                >
                  <option value="__main__">Вариант 1</option>
                  {variants.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </select>
              </div>
            )}
            <Schedule rows={scheduleVariant.sch.length > 0 ? scheduleVariant.sch : schedule} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Таблица сравнения ─────────────────────────────────────── */

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
  const ROWS = [
    { label: 'Ставка', key: 'rate' },
    { label: 'Стоимость', key: 'price' },
    { label: 'Первый взнос', key: 'down' },
    { label: 'Срок', key: 'n' },
    { label: 'Сумма кредита', key: 'loan' },
    { label: 'Платёж/мес.', key: 'monthly' },
    { label: 'Переплата', key: 'overpay' },
    { label: 'Итого выплат', key: 'total' },
  ];

  const fmtCell = (key: string, r: ReturnType<typeof calcResult>, v: VariantState) => {
    switch (key) {
      case 'rate': return `${v.rate}%`;
      case 'price': return `${fmt(v.price)} ₽`;
      case 'down': return `${fmt(r.down)} ₽`;
      case 'n': return `${Math.floor(r.n / 12)} л.${r.n % 12 ? ` ${r.n % 12} м.` : ''}`;
      case 'loan': return `${fmt(r.loan)} ₽`;
      case 'monthly': return `${fmt(r.monthly)} ₽`;
      case 'overpay': return `${fmt(r.overpay)} ₽`;
      case 'total': return `${fmt(r.total)} ₽`;
      default: return '—';
    }
  };

  const editableKeys = ['rate', 'price', 'down', 'n'];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Сравнение вариантов</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-28 shrink-0" />
              {variants.map((v, idx) => {
                const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                const isMain = v.id === 0;
                return (
                  <th key={v.id} className={`px-3 py-3 text-left min-w-[150px] ${isMain ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {isBest && <Icon name="Trophy" size={12} className="text-accent shrink-0" />}
                        {isMain ? (
                          <span className="font-mono text-sm font-semibold text-sky-600 dark:text-sky-400">Вариант 1</span>
                        ) : (
                          <VariantNameInput value={v.name} onChange={(name) => onUpdate(v.id, { name })} />
                        )}
                      </div>
                      {!isMain && (
                        <button onClick={() => onRemove(v.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                          <Icon name="X" size={12} />
                        </button>
                      )}
                    </div>
                    {isBest && <span className="mt-0.5 block font-mono text-[10px] text-accent/70">лучший платёж</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => (
              <tr key={row.key} className={rowIdx % 2 === 0 ? 'bg-secondary/20' : ''}>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">{row.label}</td>
                {variants.map((v, idx) => {
                  const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                  const isMain = v.id === 0;
                  const canEdit = !isMain && editableKeys.includes(row.key);
                  return (
                    <td key={v.id} className={`px-3 py-2.5 ${isMain ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''}`}>
                      {canEdit ? (
                        <CompareCell variant={v} field={row.key} result={results[idx]} onUpdate={onUpdate} />
                      ) : (
                        <span className={`font-mono text-sm font-semibold ${row.key === 'monthly' && isBest ? 'text-accent' : ''}`}>
                          {fmtCell(row.key, results[idx], v)}
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

/* Редактируемая ячейка */
const CompareCell = ({
  variant: v,
  field,
  result,
  onUpdate,
}: {
  variant: VariantState;
  field: string;
  result: ReturnType<typeof calcResult>;
  onUpdate: (id: number, patch: Partial<VariantState>) => void;
}) => {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const getCurrentDisplay = () => {
    switch (field) {
      case 'rate': return String(v.rate);
      case 'price': return String(v.price);
      case 'down': return v.downMode === 'percent' ? String(v.downPercent) : String(v.downAmount);
      case 'n': return v.termMode === 'years' ? String(v.years) : String(v.months);
      default: return '';
    }
  };

  const getFormatted = () => {
    switch (field) {
      case 'rate': return `${v.rate}%`;
      case 'price': return `${fmt(v.price)} ₽`;
      case 'down': return `${fmt(result.down)} ₽`;
      case 'n': return `${Math.floor(result.n / 12)} л.${result.n % 12 ? ` ${result.n % 12} м.` : ''}`;
      default: return '';
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const val = parseFloat(raw.replace(',', '.'));
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'rate': onUpdate(v.id, { rate: val }); break;
      case 'price': onUpdate(v.id, { price: val }); break;
      case 'down':
        if (v.downMode === 'percent') onUpdate(v.id, { downPercent: Math.min(val, 100) });
        else onUpdate(v.id, { downAmount: val });
        break;
      case 'n':
        if (v.termMode === 'years') onUpdate(v.id, { years: val, months: Math.round(val * 12) });
        else onUpdate(v.id, { months: val, years: Math.round((val / 12) * 100) / 100 });
        break;
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded-lg border border-transparent bg-secondary/60 focus-within:border-accent overflow-hidden">
        {focused ? (
          <input autoFocus type="text" inputMode="decimal" value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d,.]/g, ''))}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
            className="w-20 bg-transparent px-2 py-1 font-mono text-sm font-semibold outline-none"
          />
        ) : (
          <button onClick={() => { setFocused(true); setRaw(getCurrentDisplay()); }}
            className="w-20 px-2 py-1 text-left font-mono text-sm font-semibold text-foreground hover:text-accent transition-colors">
            {getFormatted()}
          </button>
        )}
      </div>
      {field === 'down' && (
        <Toggle
          options={[{ id: 'percent', label: '%' }, { id: 'amount', label: '₽' }]}
          value={v.downMode}
          onChange={(val) => {
            const mode = val as DownMode;
            if (mode === 'percent' && v.price > 0) onUpdate(v.id, { downMode: mode, downPercent: Math.round((v.downAmount / v.price) * 10000) / 100 });
            else if (mode === 'amount' && v.price > 0) onUpdate(v.id, { downMode: mode, downAmount: Math.round((v.price * v.downPercent) / 100) });
            else onUpdate(v.id, { downMode: mode });
          }}
        />
      )}
      {field === 'n' && (
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

const VariantNameInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value);
  if (editing) {
    return (
      <input autoFocus value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => { onChange(raw || value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onChange(raw || value); setEditing(false); } }}
        className="w-24 bg-transparent font-mono text-sm font-semibold outline-none border-b border-accent"
      />
    );
  }
  return (
    <button onClick={() => { setRaw(value); setEditing(true); }}
      className="font-mono text-sm font-semibold text-foreground hover:text-accent transition-colors text-left"
      title="Нажмите, чтобы переименовать">
      {value}
    </button>
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
        <label className={`pointer-events-none absolute left-4 transition-all duration-200 font-mono ${floated ? 'top-2 text-[10px] text-muted-foreground/70' : 'top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50'}`}>
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
          className={`w-full bg-transparent font-mono text-base font-medium outline-none ${label ? 'pb-2 pt-5' : 'py-3'}`}
        />
        {suffix && <span className="ml-2 font-mono text-xs text-muted-foreground shrink-0">{suffix}</span>}
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
        className={`rounded-lg px-2.5 font-mono text-xs font-semibold transition-all ${vertical ? 'py-1.5' : 'py-1'} ${value === o.id ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const Stat = ({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-accent/10 text-accent' : 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400'}`}>
        <Icon name={icon} size={16} />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <span className={`font-mono text-sm font-semibold ${accent ? 'text-accent' : ''}`}>{value}</span>
  </div>
);

const DateCard = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-secondary/30 p-2.5">
    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
      <Icon name={icon} size={13} /><span className="text-xs">{label}</span>
    </div>
    <span className="font-mono text-sm font-medium">{value}</span>
  </div>
);

// Кнопка экспорта с иконкой Download
const ExportBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-xl border-2 border-primary/40 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-all hover:border-primary hover:bg-primary/20 active:scale-95"
  >
    <Icon name="Download" size={15} />
    {label}
  </button>
);

export default Index;