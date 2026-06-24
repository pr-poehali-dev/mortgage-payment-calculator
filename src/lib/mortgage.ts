export interface MortgageInput {
  price: number;
  down: number;
  loan: number;
  rate: number;
  months: number;
  monthly: number;
  total: number;
  overpay: number;
  startDate: Date;
  firstPaymentDate?: Date;     // дата ежемесячного платежа (фиксированное число)
  interestOnlyMonths?: number; // первые N платежей — только проценты
}

export interface ScheduleRow {
  index: number;
  date: Date;        // дата списания (ближайший рабочий день после/на дату начисления)
  accrualDate: Date; // дата начисления (фиксированное число месяца)
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  interestOnly: boolean;
  days: number;      // фактических дней в периоде
}

export const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

export const fmt2 = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

export const addMonths = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

// Кол-во дней между двумя датами (целое)
function daysBetween(a: Date, b: Date): number {
  const msA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const msB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((msB - msA) / 86_400_000);
}

// Количество дней в году для конкретной даты
function daysInYear(d: Date): number {
  const y = d.getFullYear();
  return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
}

// Проценты за период [prevDate, curDate).
// Если период пересекает границу нового года — считаем по сегментам,
// каждый в своём году с правильным базисом 365/366.
function calcInterest(balance: number, annualRatePct: number, prevDate: Date, curDate: Date): number {
  const rate = annualRatePct / 100;
  let interest = 0;
  let segStart = new Date(prevDate);

  while (segStart < curDate) {
    const y = segStart.getFullYear();
    // Первый день следующего года
    const nextYearStart = new Date(Date.UTC(y + 1, 0, 1));
    // Конец сегмента — либо конец года, либо curDate (что раньше)
    const segEnd = curDate < nextYearStart ? curDate : nextYearStart;
    const days = daysBetween(segStart, segEnd);
    const basis = daysInYear(segStart);
    interest += balance * rate / basis * days;
    segStart = segEnd;
  }

  return interest;
}

// ── Праздники РФ ──────────────────────────────────────────────
const FIXED_HOLIDAYS = new Set([
  '01-01', '02-01', '03-01', '04-01', '05-01', '06-01', '07-01', '08-01',
  '23-02', '08-03', '01-05', '09-05', '12-06', '04-11',
]);

// Переносы: 'ГГГГ-ДД-ММ' → true (выходной) / false (рабочий)
const TRANSFERS: Record<string, boolean> = {
  '2024-29-12': true,
  '2025-31-01': true,
  '2025-10-01': false,
  '2026-09-01': true,
};

function isHoliday(d: Date): boolean {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const key = `${yyyy}-${dd}-${mm}`;
  const dayKey = `${dd}-${mm}`;
  if (key in TRANSFERS) return TRANSFERS[key];
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return FIXED_HOLIDAYS.has(dayKey);
}

export function nextWorkDay(d: Date): Date {
  const result = new Date(d);
  while (isHoliday(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { loan, rate, months, startDate, firstPaymentDate, interestOnlyMonths = 0 } = input;
  let balance = loan;
  const rows: ScheduleRow[] = [];

  // База дат начисления
  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Аннуитетный платёж по классической формуле (ставка/12, для расчёта «эталонного» платежа)
  // Используется ТОЛЬКО для разбивки осн.долг/проценты внутри каждого платежа:
  // - проценты считаются по фактическим дням (ACT/ACT)
  // - основной долг = общий платёж - проценты
  // - общий платёж пересчитывается каждый раз от актуального остатка и оставшихся месяцев,
  //   чтобы долг был погашен ровно в срок
  const monthlyRate = rate / 100 / 12;
  const annuity = (bal: number, n: number): number => {
    if (n <= 0 || bal <= 0) return 0;
    if (monthlyRate === 0) return bal / n;
    return (bal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  };

  // Начало первого периода = дата оформления
  let prevUTC = new Date(
    Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  );

  for (let m = 1; m <= months; m++) {
    // Дата начисления m-го платежа
    const accrualDate = addMonths(base, m - 1);
    const accrualUTC = new Date(
      Date.UTC(accrualDate.getFullYear(), accrualDate.getMonth(), accrualDate.getDate())
    );

    const days = daysBetween(prevUTC, accrualUTC);

    // Проценты по фактическим дням (ACT/ACT, с разбивкой по годам)
    const interest = calcInterest(balance, rate, prevUTC, accrualUTC);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      // Льготный период — платим только проценты, тело не трогаем
      principal = 0;
      payment = interest;
    } else {
      // Обычный период: пересчитываем аннуитетный платёж от ТЕКУЩЕГО остатка
      // и ОСТАВШЕГОСЯ количества платежей — это гарантирует погашение в срок
      const remainingPayments = months - interestOnlyMonths - (m - 1 - interestOnlyMonths);
      const totalPayment = annuity(balance, remainingPayments);
      principal = totalPayment - interest;

      // Защиты от краевых случаев:
      if (principal < 0) principal = 0;                    // проценты > платёжа (не должно быть, но страховка)
      if (principal > balance) principal = balance;        // последний платёж
      if (m === months) principal = balance;               // последний — гасим всё

      payment = principal + interest;
    }

    balance = Math.max(balance - principal, 0);

    const payDate = nextWorkDay(new Date(accrualDate));

    rows.push({
      index: m,
      date: payDate,
      accrualDate: new Date(accrualDate),
      payment,
      interest,
      principal,
      balance,
      interestOnly: isInterestOnly,
      days,
    });

    prevUTC = accrualUTC;
  }

  return rows;
}