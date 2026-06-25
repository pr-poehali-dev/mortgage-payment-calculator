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
  firstPaymentDate?: Date;
  interestOnlyMonths?: number;
}

export interface ScheduleRow {
  index: number;
  date: Date;        // дата списания (рабочий день)
  accrualDate: Date; // дата начисления (фиксированное число)
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  interestOnly: boolean;
  days: number;
}

export const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

export const fmt2 = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

// Прибавить n месяцев (работает в локальном времени)
export const addMonths = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

// ── Работаем ТОЛЬКО с тройками (год, месяц, день) ─────────────
// Это исключает любое влияние часовых поясов

type YMD = { y: number; m: number; d: number };

function toYMD(date: Date): YMD {
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

function ymdToMs(ymd: YMD): number {
  return Date.UTC(ymd.y, ymd.m, ymd.d);
}

function addMonthsYMD(ymd: YMD, n: number): YMD {
  const d = new Date(Date.UTC(ymd.y, ymd.m + n, ymd.d));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

function daysBetweenYMD(a: YMD, b: YMD): number {
  return Math.round((ymdToMs(b) - ymdToMs(a)) / 86_400_000);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

// Проценты ACT/ACT от YMD a до YMD b
function calcInterestYMD(balance: number, annualRatePct: number, a: YMD, b: YMD): number {
  const rate = annualRatePct / 100;
  let interest = 0;
  let cur = { ...a };

  while (ymdToMs(cur) < ymdToMs(b)) {
    const nextJan1: YMD = { y: cur.y + 1, m: 0, d: 1 };
    const segEnd = ymdToMs(b) <= ymdToMs(nextJan1) ? b : nextJan1;
    const days = daysBetweenYMD(cur, segEnd);
    interest += balance * rate * days / daysInYear(cur.y);
    cur = { ...segEnd };
  }

  return interest;
}

// ── Праздники РФ ──────────────────────────────────────────────
const FIXED_HOLIDAYS = new Set([
  '01-01', '02-01', '03-01', '04-01', '05-01', '06-01', '07-01', '08-01',
  '23-02', '08-03', '01-05', '09-05', '12-06', '04-11',
]);

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
  const full = `${yyyy}-${dd}-${mm}`;
  if (full in TRANSFERS) return TRANSFERS[full];
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return FIXED_HOLIDAYS.has(`${dd}-${mm}`);
}

export function nextWorkDay(d: Date): Date {
  const r = new Date(d);
  while (isHoliday(r)) r.setDate(r.getDate() + 1);
  return r;
}

// ── Аннуитет ─────────────────────────────────────────────────
export function calcMonthlyPayment(loan: number, annualRatePct: number, n: number): number {
  if (loan <= 0 || n <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return loan / n;
  return (loan * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

// ── График платежей ───────────────────────────────────────────
export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { loan, rate, months, startDate, firstPaymentDate, interestOnlyMonths = 0 } = input;

  const rows: ScheduleRow[] = [];
  let balance = loan;

  // Все даты — только (год, месяц, число), без времени и часовых поясов
  const startYMD = toYMD(startDate);
  const baseYMD = firstPaymentDate ? toYMD(firstPaymentDate) : addMonthsYMD(startYMD, 1);

  // Аннуитет — один раз на весь срок
  const effectiveMonths = months - interestOnlyMonths;
  const fixedAnnuity = calcMonthlyPayment(loan, rate, effectiveMonths);

  // Начало первого периода = дата оформления
  let periodYMD: YMD = { ...startYMD };

  for (let m = 1; m <= months; m++) {
    // Дата начисления = baseYMD сдвинутая на (m-1) месяцев
    const accrualYMD = addMonthsYMD(baseYMD, m - 1);

    const days = daysBetweenYMD(periodYMD, accrualYMD);
    const interest = calcInterestYMD(balance, rate, periodYMD, accrualYMD);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      principal = 0;
      payment = interest;
    } else if (m === months) {
      // Последний платёж — весь остаток + проценты (нестандартная сумма)
      principal = balance;
      payment = principal + interest;
    } else {
      // Фиксированный аннуитет, тело = аннуитет − проценты
      principal = fixedAnnuity - interest;
      if (principal < 0) {
        // Крайний случай: очень длинный первый период при высокой ставке
        // Платим только проценты, тело в следующем
        principal = 0;
        payment = interest;
      } else {
        if (principal > balance) principal = balance;
        payment = principal + interest;
      }
    }

    balance = Math.max(balance - principal, 0);

    // Дата для отображения: строим из YMD чтобы не было сдвига часового пояса
    const accrualDateLocal = new Date(accrualYMD.y, accrualYMD.m, accrualYMD.d);
    const payDate = nextWorkDay(new Date(accrualYMD.y, accrualYMD.m, accrualYMD.d));

    rows.push({
      index: m,
      date: payDate,
      accrualDate: accrualDateLocal,
      payment,
      interest,
      principal,
      balance,
      interestOnly: isInterestOnly,
      days,
    });

    periodYMD = { ...accrualYMD };
  }

  return rows;
}
