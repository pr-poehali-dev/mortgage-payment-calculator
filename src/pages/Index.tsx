import { useState, useMemo, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import Schedule from '@/components/Schedule';
import { buildSchedule, fmt, fmtDate, addMonths, nextWorkDay, MortgageInput } from '@/lib/mortgage';
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

// monthlyAfterGrace — платёж после льготного периода (осн. долг + проценты)
function makeReportText(name: string, v: VariantState, r: ReturnType<typeof calcResult>, monthlyAfterGrace?: number) {
  const monthly = monthlyAfterGrace ?? r.monthly;
  return [
    `Расчёт ипотеки — ${name}`,
    `Стоимость недвижимости: ${fmt(v.price)} ₽`,
    `Первоначальный взнос: ${fmt(r.down)} ₽ (${r.downRatio.toFixed(1)}%)`,
    `Срок: ${Math.floor(r.n / 12)} лет (${r.n} мес.)`,
    `Процентная ставка: ${v.rate}% годовых`,
    `Ежемесячный платёж: ${fmt(monthly)} ₽`,
  ].join('\n');
}

// Умный парсинг даты: "1.2.22", "01.02.2022", "1,2,2022", "01/02/22" и т.д.
function parseRuDate(s: string): Date | null {
  // Заменяем любые разделители на точку, убираем лишние пробелы
  const norm = s.trim().replace(/[,\s/]+/g, '.').replace(/-+/g, '.');
  const m = norm.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  // Двузначный год: 22 → 2022, 99 → 1999
  if (year < 100) year += year < 30 ? 2000 : 1900;
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
  if (isNaN(d.getTime())) return null;
  // Проверяем что день/месяц не съехали (например 32 января)
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

const SELECT_CLS = 'rounded-lg border border-accent/60 bg-accent/10 px-2 py-1 font-mono text-xs font-semibold text-accent outline-none cursor-pointer hover:bg-accent/20 transition-colors';

// Хелпер: переместить фокус на первый input внутри элемента
function focusInput(el: HTMLElement | null) {
  el?.querySelector<HTMLInputElement>('input')?.focus();
}

const Index = () => {
  const [compareMode, setCompareMode] = useState(false);
  const [variants, setVariants] = useState<VariantState[]>([]);

  // Refs для цепочки Enter→next
  const refPrice = useRef<HTMLDivElement>(null);
  const refDown = useRef<HTMLDivElement>(null);
  const refRate = useRef<HTMLDivElement>(null);
  const refTerm = useRef<HTMLDivElement>(null);
  const refInterestOnly = useRef<HTMLDivElement>(null);

  // Основная форма
  const [price, setPrice] = useState(8000000);
  const [downMode, setDownMode] = useState<DownMode>('percent');
  const [downPercent, setDownPercent] = useState(20);
  const [downAmount, setDownAmount] = useState(1600000);
  const [rate, setRate] = useState(18);
  const [termMode, setTermMode] = useState<TermMode>('years');
  const [years, setYears] = useState(20);
  const [months, setMonths] = useState(240);

  // Льготный период (только %)
  const [interestOnlyMonths, setInterestOnlyMonths] = useState(0);

  // Редактируемые даты
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  // Дата ежемесячного списания — по умолчанию startDate + 1 мес → ближ. раб. день
  const [firstPaymentDate, setFirstPaymentDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return nextWorkDay(addMonths(d, 1));
  });

  // Селекторы отчёта/графика/экспорта
  const [reportVariantId, setReportVariantId] = useState<number | 'all' | null>(null);
  const [scheduleVariantId, setScheduleVariantId] = useState<number | null>(null);
  const [exportVariantId, setExportVariantId] = useState<number | -1 | null>(null);

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
    overpay: result.overpay, startDate, firstPaymentDate,
    interestOnlyMonths,
  };

  const schedule = useMemo(
    () => (result.loan > 0 && result.n > 0 ? buildSchedule(mortgageInput) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.loan, result.n, result.monthly, rate, startDate, firstPaymentDate, interestOnlyMonths],
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

  // Ежемесячный платёж после льготного периода (первый платёж с телом долга)
  const monthlyAfterGrace = useMemo(() => {
    if (!schedule.length) return result.monthly;
    const firstFull = schedule.find((r) => !r.interestOnly);
    return firstFull ? firstFull.payment : result.monthly;
  }, [schedule, result.monthly]);

  const reportText = useMemo(() => {
    if (!compareMode || reportVariantId === null) return makeReportText('Вариант 1', mainVariant, result, monthlyAfterGrace);
    if (reportVariantId === 'all') return allVariants.map((v, i) => makeReportText(v.name, v, allResults[i])).join('\n\n---\n\n');
    const v = variants.find((x) => x.id === reportVariantId);
    if (!v) return makeReportText('Вариант 1', mainVariant, result, monthlyAfterGrace);
    return makeReportText(v.name, v, calcResult(v));
  }, [compareMode, reportVariantId, mainVariant, result, allVariants, allResults, variants, monthlyAfterGrace]);

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

  const scheduleData = useMemo(() => {
    if (scheduleVariantId == null) return { sch: schedule, name: 'Вариант 1' };
    const v = variants.find((x) => x.id === scheduleVariantId) ?? mainVariant;
    const r = calcResult(v);
    const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate, firstPaymentDate };
    return { sch: r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [], name: v.name };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleVariantId, variants, schedule]);

  const getExportData = (): { input: MortgageInput; sch: ReturnType<typeof buildSchedule>; name: string }[] => {
    if (!compareMode || exportVariantId === null) return [{ input: mortgageInput, sch: schedule, name: 'Вариант 1' }];
    if (exportVariantId === -1) {
      return allVariants.map((v, i) => {
        const r = allResults[i];
        const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate, firstPaymentDate };
        return { input: inp, sch: r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [], name: v.name };
      });
    }
    const v = allVariants.find((x) => x.id === exportVariantId) ?? mainVariant;
    const r = calcResult(v);
    const inp: MortgageInput = { price: v.price, down: r.down, loan: r.loan, rate: v.rate, months: r.n, monthly: r.monthly, total: r.total, overpay: r.overpay, startDate, firstPaymentDate };
    return [{ input: inp, sch: r.loan > 0 && r.n > 0 ? buildSchedule(inp) : [], name: v.name }];
  };

  const doExport = async (type: 'excel' | 'pdf' | 'word') => {
    if (!canExport) return toast.error('Заполните параметры кредита');
    for (const { input, sch, name } of getExportData()) {
      if (type === 'excel') exportExcel(input, sch, name);
      else if (type === 'pdf') await exportPDF(input, sch, name);
      else await exportWord(input, sch, name);
    }
  };

  const showSchedule = canExport || scheduleData.sch.length > 0;

  // Обновить дату первого платежа при смене даты оформления
  const handleStartDateChange = (d: Date) => {
    setStartDate(d);
    setFirstPaymentDate(nextWorkDay(addMonths(d, 1)));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center gap-2">
        <Icon name="Home" size={13} className="opacity-70 shrink-0" />
        <span className="text-xs font-medium tracking-wide opacity-90">Ипотечный калькулятор — аннуитетный</span>
      </div>

      <div className="mx-auto max-w-5xl px-3 pt-3 pb-8 sm:px-4">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Левая — поля ввода */}
          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-2.5">

            {/* Стоимость */}
            <div ref={refPrice}>
              <StepInput
                label="Стоимость"
                suffix="₽"
                value={price}
                onChange={setPrice}
                stepA={100000}
                labelA="100 тыс"
                onNext={() => focusInput(refDown.current)}
              />
            </div>
            <div className="h-px bg-border" />

            {/* Первоначальный взнос */}
            <div ref={refDown} className="flex items-center gap-1.5">
              {downMode === 'percent' ? (
                <StepInput
                  label="Первоначальный взнос"
                  suffix="%"
                  value={downPercent}
                  onChange={setDownPercent}
                  max={100}
                  stepA={1}
                  labelA="1%"
                  onNext={() => focusInput(refRate.current)}
                />
              ) : (
                <StepInput
                  label="Первоначальный взнос"
                  suffix="₽"
                  value={downAmount}
                  onChange={setDownAmount}
                  stepA={100000}
                  labelA="100 тыс"
                  onNext={() => focusInput(refRate.current)}
                />
              )}
              {/* Toggle выровнен по высоте поля h-14 */}
              <Toggle
                options={[{ id: 'percent', label: '%' }, { id: 'amount', label: '₽' }]}
                value={downMode} vertical h14
                onChange={(v) => {
                  const mode = v as DownMode;
                  if (mode === 'percent' && price > 0) setDownPercent(Math.round((downAmount / price) * 10000) / 100);
                  else if (mode === 'amount' && price > 0) setDownAmount(Math.round((price * downPercent) / 100));
                  setDownMode(mode);
                }}
              />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground pl-[52px]">
              {downMode === 'percent' ? `= ${fmt((price * downPercent) / 100)} ₽` : `= ${result.downRatio.toFixed(2)}% от стоимости`}
            </p>
            <div className="h-px bg-border" />

            {/* Ставка */}
            <div ref={refRate}>
              <StepInput
                label="Ставка"
                suffix="% год."
                value={rate}
                onChange={setRate}
                decimal
                stepA={1}
                labelA="1%"
                onNext={() => focusInput(refTerm.current)}
              />
            </div>
            <div className="h-px bg-border" />

            {/* Срок */}
            <div ref={refTerm} className="flex items-center gap-1.5">
              {termMode === 'years' ? (
                <StepInput
                  label="Срок"
                  suffix="лет"
                  value={years}
                  onChange={setYears}
                  max={50}
                  stepA={1}
                  labelA="1 год"
                  onNext={() => focusInput(refInterestOnly.current)}
                />
              ) : (
                <StepInput
                  label="Срок"
                  suffix="мес."
                  value={months}
                  onChange={setMonths}
                  max={600}
                  stepA={1}
                  labelA="1 мес"
                  onNext={() => focusInput(refInterestOnly.current)}
                />
              )}
              <Toggle
                options={[{ id: 'years', label: 'лет' }, { id: 'months', label: 'мес.' }]}
                value={termMode} vertical h14
                onChange={(v) => {
                  const mode = v as TermMode;
                  if (mode === 'months') setMonths(Math.round(years * 12));
                  else setYears(Math.round((months / 12) * 100) / 100);
                  setTermMode(mode);
                }}
              />
            </div>
            <div className="h-px bg-border" />

            {/* Период оплаты только % */}
            <div ref={refInterestOnly} className="flex items-center">
              <StepInput
                label="Период оплаты только %"
                suffix="мес."
                value={interestOnlyMonths}
                onChange={setInterestOnlyMonths}
                max={result.n}
                stepA={1}
                labelA="1 мес"
                compact
              />
            </div>
            <div className="h-px bg-border" />

            {/* Редактируемые даты */}
            <div className="grid grid-cols-2 gap-2">
              <DateEdit
                icon="FileSignature"
                label="Дата оформления"
                value={startDate}
                onChange={handleStartDateChange}
              />
              <DateEdit
                icon="CalendarClock"
                label="Дата списания"
                hint="Число месяца ежемесячного платежа"
                value={firstPaymentDate}
                onChange={setFirstPaymentDate}
              />
            </div>
          </div>

          {/* Правая — результаты */}
          <div className="flex flex-col gap-2.5">
            <div className="rounded-2xl bg-sky-500 px-4 py-3 text-white">
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">Вариант 1 · Платёж / мес.</span>
              <div className="mt-1 font-mono text-3xl font-bold sm:text-4xl">
                {fmt(result.monthly)}<span className="ml-1.5 text-base opacity-50">₽</span>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-900 dark:bg-sky-950/30">
              <MiniStat label="Сумма кредита" value={`${fmt(result.loan)} ₽`} />
              <MiniStat label="Первый взнос" value={`${fmt(result.down)} ₽`} />
              <MiniStat label="Начисл. проценты" value={`${fmt(result.overpay)} ₽`} accent />
              <MiniStat label="Итого выплат" value={`${fmt(result.total)} ₽`} last />
            </div>

            {/* Краткий отчёт */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider font-mono">Отчёт</span>
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
                <button onClick={copyReport} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                  <Icon name="Copy" size={11} />Копировать
                </button>
              </div>
              <pre className="px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap select-all">{reportText}</pre>
            </div>
          </div>
        </div>

        {/* Кнопки экспорт + сравнение */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ExportBtn label="Excel" onClick={() => doExport('excel')} />
          <ExportBtn label="PDF" onClick={() => doExport('pdf')} />
          <ExportBtn label="Word" onClick={() => doExport('word')} />

          {compareMode && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">скачать вариант:</span>
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
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!compareMode ? (
              <button onClick={enterCompare} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-md transition-all hover:opacity-90 active:scale-95">
                <Icon name="Columns2" size={15} />Сравнить варианты
              </button>
            ) : (
              <>
                {variants.length < 9 && (
                  <button onClick={addVariant} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-accent/50 bg-card px-3 py-2.5 text-sm font-medium text-accent shadow-sm transition-all hover:bg-accent/10 active:scale-95">
                    <Icon name="Plus" size={15} />Добавить
                  </button>
                )}
                <button onClick={exitCompare} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium shadow-sm transition-all hover:border-destructive hover:text-destructive active:scale-95">
                  <Icon name="X" size={15} />Закрыть
                </button>
              </>
            )}
          </div>
        </div>

        {/* Таблица сравнения */}
        {compareMode && (
          <div className="mt-3">
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
        {showSchedule && (
          <div className="mt-3">
            {compareMode && (
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">График:</span>
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
            <Schedule rows={scheduleData.sch.length > 0 ? scheduleData.sch : schedule} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Таблица сравнения ─────────────────────────────────────── */

const CompareTable = ({
  variants, results, bestMonthly, onUpdate, onRemove,
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
      <div className="border-b border-border px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Сравнение вариантов</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground w-24 shrink-0" />
              {variants.map((v, idx) => {
                const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                const isMain = v.id === 0;
                return (
                  <th key={v.id} className={`px-3 py-2 text-left min-w-[140px] ${isMain ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {isBest && <Icon name="Trophy" size={11} className="text-accent shrink-0" />}
                        {isMain
                          ? <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-400">Вариант 1</span>
                          : <VariantNameInput value={v.name} onChange={(name) => onUpdate(v.id, { name })} />}
                      </div>
                      {!isMain && (
                        <button onClick={() => onRemove(v.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                          <Icon name="X" size={11} />
                        </button>
                      )}
                    </div>
                    {isBest && <span className="mt-0.5 block font-mono text-[9px] text-accent/70">лучший платёж</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => (
              <tr key={row.key} className={rowIdx % 2 === 0 ? 'bg-secondary/20' : ''}>
                <td className="px-3 py-2 text-[10px] text-muted-foreground font-medium whitespace-nowrap">{row.label}</td>
                {variants.map((v, idx) => {
                  const isBest = results[idx].monthly === bestMonthly && results[idx].monthly > 0;
                  const isMain = v.id === 0;
                  const canEdit = !isMain && editableKeys.includes(row.key);
                  return (
                    <td key={v.id} className={`px-3 py-2 ${isMain ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''}`}>
                      {canEdit
                        ? <CompareCell variant={v} field={row.key} onUpdate={onUpdate} />
                        : <span className={`font-mono text-xs font-semibold ${row.key === 'monthly' && isBest ? 'text-accent' : ''}`}>
                            {fmtCell(row.key, results[idx], v)}
                          </span>
                      }
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

/* ── CompareCell: всегда пересчитывает из актуального v ─────── */
const CompareCell = ({
  variant: v,
  field,
  onUpdate,
}: {
  variant: VariantState;
  field: string;
  onUpdate: (id: number, patch: Partial<VariantState>) => void;
}) => {
  // Пересчитываем результат локально — решает баг с Toggle
  const r = calcResult(v);

  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const getCurrentRaw = () => {
    switch (field) {
      case 'rate': return String(v.rate);
      case 'price': return String(v.price);
      case 'down': return v.downMode === 'percent' ? String(v.downPercent) : String(v.downAmount);
      case 'n': return v.termMode === 'years' ? String(v.years) : String(v.months);
      default: return '';
    }
  };

  // Форматированное отображение — использует актуальный r
  const getFormatted = () => {
    switch (field) {
      case 'rate': return `${v.rate}%`;
      case 'price': return `${fmt(v.price)} ₽`;
      case 'down':
        if (v.downMode === 'percent') return `${v.downPercent}%`;
        return `${fmt(r.down)} ₽`;
      case 'n':
        if (v.termMode === 'years') return `${v.years} л.`;
        return `${v.months} м.`;
      default: return '';
    }
  };

  const commit = (rawStr: string) => {
    setEditing(false);
    const cleaned = rawStr.trim().replace(',', '.');
    const val = cleaned === '' ? 0 : parseFloat(cleaned);
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

  // Шаги кнопок +/- для ячейки сравнения
  const getStepA = () => {
    switch (field) {
      case 'price': return 100000;
      case 'down': return v.downMode === 'percent' ? 1 : 100000;
      case 'rate': return 1;
      case 'n': return 1;
      default: return 0;
    }
  };

  const applyStep = (delta: number) => {
    switch (field) {
      case 'rate': onUpdate(v.id, { rate: Math.max(0, v.rate + delta) }); break;
      case 'price': onUpdate(v.id, { price: Math.max(0, v.price + delta) }); break;
      case 'down':
        if (v.downMode === 'percent') onUpdate(v.id, { downPercent: Math.max(0, Math.min(100, v.downPercent + delta)) });
        else onUpdate(v.id, { downAmount: Math.max(0, v.downAmount + delta) });
        break;
      case 'n':
        if (v.termMode === 'years') onUpdate(v.id, { years: Math.max(1, v.years + delta), months: Math.round(Math.max(1, v.years + delta) * 12) });
        else onUpdate(v.id, { months: Math.max(1, v.months + delta), years: Math.round((Math.max(1, v.months + delta) / 12) * 100) / 100 });
        break;
    }
  };

  const step = getStepA();

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Кнопки -/+ */}
      <button onClick={() => applyStep(-step)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary font-bold text-xs text-foreground shadow-sm transition-all hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95">−</button>

      <div className="flex items-center rounded-lg border border-transparent bg-secondary/60 focus-within:border-accent overflow-hidden">
        {editing ? (
          <input
            autoFocus type="text" inputMode="decimal" value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d,.]/g, ''))}
            onBlur={() => commit(raw)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(raw); if (e.key === 'Escape') setEditing(false); }}
            className={`${field === 'price' ? 'w-28' : 'w-20'} bg-transparent px-2 py-0.5 font-mono text-xs font-semibold outline-none`}
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setRaw(getCurrentRaw()); }}
            className={`${field === 'price' ? 'w-28' : 'w-20'} px-2 py-0.5 text-left font-mono text-xs font-semibold text-foreground hover:text-accent transition-colors`}
          >
            {getFormatted()}
          </button>
        )}
      </div>

      <button onClick={() => applyStep(step)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary font-bold text-xs text-foreground shadow-sm transition-all hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95">+</button>

      {/* Toggle для взноса */}
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
      {/* Toggle для срока */}
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
        className="w-20 bg-transparent font-mono text-xs font-semibold outline-none border-b border-accent"
      />
    );
  }
  return (
    <button onClick={() => { setRaw(value); setEditing(true); }}
      className="font-mono text-xs font-semibold text-foreground hover:text-accent transition-colors text-left"
      title="Нажмите, чтобы переименовать">
      {value}
    </button>
  );
};

/* ── Вспомогательные компоненты ────────────────────────────── */

const fmtNum = (n: number) => {
  if (Number.isNaN(n) || n === 0) return '';
  const hasDecimals = n % 1 !== 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: hasDecimals ? 2 : 0 }).format(n);
};

// Кнопка шага +/− — единый визуальный стиль
const StepBtn = ({ label, title, onClick }: { label: string; title?: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    title={title}
    tabIndex={-1}
    className="flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-xl border border-border bg-secondary font-bold text-lg text-foreground shadow-sm transition-all hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95 active:shadow-none"
  >{label}</button>
);

// Floating-label поле + кнопки
const StepInput = ({
  value, onChange, label, suffix, max, decimal = false,
  stepA, labelA, stepB, labelB, hint, compact = false, onNext,
}: {
  value: number; onChange: (n: number) => void;
  label?: string; suffix?: string; max?: number; decimal?: boolean;
  stepA?: number; labelA?: string;
  stepB?: number; labelB?: string;
  hint?: string;
  compact?: boolean;
  onNext?: () => void; // вызывается при Enter или Tab
}) => {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const clamp = (v: number) => {
    let n = v;
    if (max !== undefined && n > max) n = max;
    if (n < 0) n = 0;
    return n;
  };

  const doStep = (delta: number) => onChange(clamp(parseFloat((value + delta).toFixed(4))));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === 'Tab') && onNext) {
      e.preventDefault();
      // Сначала применяем текущее значение
      const cleaned = raw.replace(/\s/g, '').replace(',', '.');
      const n = parseFloat(cleaned);
      onChange(clamp(Number.isNaN(n) ? 0 : n));
      onNext();
    }
  };

  const displayVal = focused ? raw : (value === 0 ? '' : fmtNum(value));
  const hasValue = value !== 0;
  const floated = focused || hasValue;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {stepA !== undefined && (
          <StepBtn label="−" title={labelA ? `−${labelA}` : undefined} onClick={() => doStep(-stepA)} />
        )}
        <div className="relative flex w-28 items-center rounded-xl border border-input bg-secondary/40 px-3 pt-5 pb-1.5 transition-colors focus-within:border-accent">
          {label && (
            <span className={`pointer-events-none absolute left-3 font-mono transition-all duration-150 ${floated ? 'top-1 text-[9px] text-accent' : 'top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground'}`}>
              {label}
            </span>
          )}
          <input
            type="text" inputMode={decimal ? 'decimal' : 'numeric'}
            tabIndex={0}
            value={displayVal}
            onFocus={() => { setFocused(true); setRaw(value === 0 ? '' : String(value)); }}
            onBlur={() => {
              setFocused(false);
              const cleaned = raw.replace(/\s/g, '').replace(',', '.');
              const n = parseFloat(cleaned);
              onChange(clamp(Number.isNaN(n) ? 0 : n));
            }}
            onChange={(e) => {
              const val = e.target.value.replace(/[^\d,.\s]/g, '');
              setRaw(val);
              const cleaned = val.replace(/\s/g, '').replace(',', '.');
              const n = parseFloat(cleaned);
              if (!Number.isNaN(n)) onChange(clamp(n));
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent font-mono text-sm font-semibold outline-none"
          />
          {suffix && <span className="shrink-0 font-mono text-xs text-muted-foreground ml-1">{suffix}</span>}
        </div>
        {stepA !== undefined && (
          <StepBtn label="+" title={labelA ? `+${labelA}` : undefined} onClick={() => doStep(stepA)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-1.5">
        {stepA !== undefined && (
          <StepBtn label="−" title={labelA ? `−${labelA}` : undefined} onClick={() => doStep(-stepA)} />
        )}
        {/* Floating-label поле высотой 56px — единообразное */}
        <div className="relative flex flex-1 items-center rounded-xl border border-input bg-secondary/40 px-3 pt-5 pb-1.5 h-14 transition-colors focus-within:border-accent">
          {label && (
            <span className={`pointer-events-none absolute left-3 font-mono transition-all duration-150 ${floated ? 'top-1.5 text-[10px] text-accent/80' : 'top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground'}`}>
              {label}
            </span>
          )}
          <input
            type="text" inputMode={decimal ? 'decimal' : 'numeric'}
            tabIndex={0}
            value={displayVal}
            onFocus={() => { setFocused(true); setRaw(value === 0 ? '' : String(value)); }}
            onBlur={() => {
              setFocused(false);
              const cleaned = raw.replace(/\s/g, '').replace(',', '.');
              const n = parseFloat(cleaned);
              onChange(clamp(Number.isNaN(n) ? 0 : n));
            }}
            onChange={(e) => {
              const val = e.target.value.replace(/[^\d,.\s]/g, '');
              setRaw(val);
              const cleaned = val.replace(/\s/g, '').replace(',', '.');
              const n = parseFloat(cleaned);
              if (!Number.isNaN(n)) onChange(clamp(n));
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent font-mono text-sm font-semibold outline-none"
          />
          {suffix && <span className="shrink-0 font-mono text-xs text-muted-foreground ml-1">{suffix}</span>}
        </div>
        {stepA !== undefined && (
          <StepBtn label="+" title={labelA ? `+${labelA}` : undefined} onClick={() => doStep(stepA)} />
        )}
      </div>
      {stepB !== undefined && (
        <div className="flex gap-1 pl-[52px] pr-[52px]">
          <button tabIndex={-1}
            onClick={() => doStep(-stepB)}
            className="flex-1 cursor-pointer rounded-lg border border-border bg-secondary/60 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground transition-all hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95"
          >−{labelB ?? stepB}</button>
          <button tabIndex={-1}
            onClick={() => doStep(stepB)}
            className="flex-1 cursor-pointer rounded-lg border border-border bg-secondary/60 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground transition-all hover:border-accent hover:bg-accent/10 hover:text-accent active:scale-95"
          >+{labelB ?? stepB}</button>
        </div>
      )}
      {hint && <p className="pl-[52px] font-mono text-[9px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
};

// Мини-календарь с вводом даты вручную
const DateEdit = ({
  icon, label, hint, value, onChange,
}: {
  icon: string; label: string; hint?: string; value: Date; onChange: (d: Date) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [calYear, setCalYear] = useState(value.getFullYear());
  const [calMonth, setCalMonth] = useState(value.getMonth());

  const display = fmtDate(value);

  const commit = (s: string) => {
    const parsed = parseRuDate(s.trim());
    if (parsed) { onChange(parsed); setOpen(false); }
  };

  const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Дни календаря для calYear/calMonth
  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    // Понедельник = 0
    let dow = firstDay.getDay() - 1; if (dow < 0) dow = 6;
    const days: (number | null)[] = Array(dow).fill(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calYear, calMonth]);

  const selectDay = (day: number) => {
    const d = new Date(calYear, calMonth, day);
    onChange(d);
    setOpen(false);
  };

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  return (
    <div className="relative">
      {/* Триггер */}
      <button
        onClick={() => { setOpen(o => !o); setRaw(display); setCalYear(value.getFullYear()); setCalMonth(value.getMonth()); }}
        className="rounded-xl border border-border bg-secondary/30 px-2.5 py-2 text-left w-full hover:border-accent transition-colors"
      >
        <div className="mb-0.5 flex items-center gap-1 text-muted-foreground">
          <Icon name={icon} size={11} /><span className="text-[10px]">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs font-medium">{display}</span>
          <Icon name="CalendarDays" size={10} className="text-muted-foreground/40" />
        </div>
        {hint && <p className="mt-0.5 font-mono text-[9px] text-muted-foreground/50 leading-tight">{hint}</p>}
      </button>

      {/* Выпадающий календарь */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-2xl border border-border bg-card shadow-xl p-3 animate-fade-in">
          {/* Ввод вручную */}
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-input bg-secondary/40 px-2 py-1 focus-within:border-accent">
            <Icon name="Pencil" size={11} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(raw); if (e.key === 'Escape') setOpen(false); }}
              placeholder="ДД.ММ.ГГГГ"
              className="w-full bg-transparent font-mono text-xs outline-none"
            />
            <button onClick={() => commit(raw)} className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-accent text-accent-foreground">ОК</button>
          </div>

          {/* Навигация месяц/год */}
          <div className="mb-2 flex items-center justify-between">
            <button onClick={prevMonth} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary transition-colors">
              <Icon name="ChevronLeft" size={14} />
            </button>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs font-semibold">{MONTHS_RU[calMonth]}</span>
              {/* Год — скролл колёсиком или кликом */}
              <div className="flex items-center gap-0.5">
                <button onClick={() => setCalYear(y => y - 1)} className="text-muted-foreground hover:text-foreground">
                  <Icon name="ChevronDown" size={11} />
                </button>
                <span className="font-mono text-xs font-semibold w-10 text-center">{calYear}</span>
                <button onClick={() => setCalYear(y => y + 1)} className="text-muted-foreground hover:text-foreground">
                  <Icon name="ChevronUp" size={11} />
                </button>
              </div>
            </div>
            <button onClick={nextMonth} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary transition-colors">
              <Icon name="ChevronRight" size={14} />
            </button>
          </div>

          {/* Дни недели */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map(d => (
              <div key={d} className={`text-center font-mono text-[9px] font-semibold pb-0.5 ${d === 'Сб' || d === 'Вс' ? 'text-accent/70' : 'text-muted-foreground'}`}>{d}</div>
            ))}
          </div>

          {/* Числа */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {calDays.map((day, i) => {
              if (day === null) return <div key={i} />;
              const isSelected = day === value.getDate() && calMonth === value.getMonth() && calYear === value.getFullYear();
              const dow = new Date(calYear, calMonth, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              return (
                <button
                  key={i}
                  onClick={() => selectDay(day)}
                  className={`flex h-7 w-full items-center justify-center rounded-lg font-mono text-xs transition-colors
                    ${isSelected ? 'bg-accent text-accent-foreground font-bold' : isWeekend ? 'text-accent/60 hover:bg-accent/10' : 'hover:bg-secondary'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Кнопка Сегодня + Закрыть */}
          <div className="mt-2 flex gap-1">
            <button
              onClick={() => { const t = new Date(); t.setHours(0,0,0,0); onChange(t); setOpen(false); }}
              className="flex-1 rounded-lg border border-border bg-secondary/50 py-1 font-mono text-[10px] font-medium text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
            >Сегодня</button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-destructive transition-colors">✕</button>
          </div>
        </div>
        </>
      )}
    </div>
  );
};

const Toggle = ({ options, value, onChange, vertical = false, h14 = false }: {
  options: { id: string; label: string }[]; value: string;
  onChange: (v: string) => void; vertical?: boolean; h14?: boolean;
}) => (
  <div className={`flex shrink-0 rounded-xl border border-border bg-secondary/60 p-0.5 ${vertical ? 'flex-col' : 'flex-row'} ${h14 ? 'h-14' : ''}`}>
    {options.map((o) => (
      <button key={o.id} onClick={() => onChange(o.id)} tabIndex={-1}
        className={`cursor-pointer select-none rounded-lg px-2.5 font-mono text-xs font-semibold transition-all flex-1 flex items-center justify-center ${!h14 && vertical ? 'py-2' : ''} ${!h14 && !vertical ? 'py-1.5' : ''} ${value === o.id ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const MiniStat = ({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) => (
  <div className={`flex items-center justify-between py-1 ${!last ? 'border-b border-sky-100 dark:border-sky-900' : ''}`}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`font-mono text-xs font-semibold ${accent ? 'text-accent' : ''}`}>{value}</span>
  </div>
);

const ExportBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick}
    className="flex cursor-pointer select-none items-center gap-1.5 rounded-xl border-2 border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary shadow-sm transition-all hover:border-primary hover:bg-primary/20 active:scale-95">
    <Icon name="Download" size={13} />{label}
  </button>
);

export default Index;