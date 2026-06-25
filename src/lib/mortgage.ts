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

// Прибавить n месяцев к дате (локальное время)
export const addMonths = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

// ── Утилиты ───────────────────────────────────────────────────

// Дата → UTC-полночь (убирает влияние часового пояса)
function toUTC(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

// ── Праздники РФ ──────────────────────────────────────────────
const FIXED_HOLIDAYS = new Set([
  '01-01', '02-01', '03-01', '04-01', '05-01', '06-01', '07-01', '08-01',
  '23-02', '08-03', '01-05', '09-05', '12-06', '04-11',
]);

// Явные переносы: 'ГГГГ-ДД-ММ' → true=выходной, false=рабочий
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

// ── Проценты ACT/ACT ─────────────────────────────────────────
// Если период пересекает 1 января — делим на части по годам
// Обе даты должны быть UTC-полночь
function calcInterest(balance: number, annualRatePct: number, from: Date, to: Date): number {
  const rate = annualRatePct / 100;
  let interest = 0;
  let cur = new Date(from);

  while (cur < to) {
    const curYear = cur.getFullYear();
    const nextJan1 = new Date(Date.UTC(curYear + 1, 0, 1));
    const segEnd = to < nextJan1 ? to : nextJan1;
    const days = daysBetween(cur, segEnd);
    interest += balance * rate * days / daysInYear(curYear);
    cur = segEnd;
  }

  return interest;
}

// ── Аннуитет ─────────────────────────────────────────────────
// A = P × i × (1+i)^n / ((1+i)^n − 1),  i = rate/12
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

  // База для дат начисления — число месяца из firstPaymentDate (или startDate+1мес)
  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Аннуитет фиксируется ОДИН РАЗ от суммы кредита и эффективного срока
  const effectiveMonths = months - interestOnlyMonths;
  const fixedAnnuity = calcMonthlyPayment(loan, rate, effectiveMonths);

  // Начало первого периода = дата оформления (UTC)
  let periodStart = toUTC(startDate);

  for (let m = 1; m <= months; m++) {
    // Дата начисления m-го платежа (UTC)
    const accrualDate = toUTC(addMonths(base, m - 1));

    const days = daysBetween(periodStart, accrualDate);

    // Проценты за период по ACT/ACT
    const interest = calcInterest(balance, rate, periodStart, accrualDate);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      // Льготный период — только проценты
      principal = 0;
      payment = interest;

    } else if (m === months) {
      // Последний платёж — гасим весь остаток (нестандартная сумма)
      // Все предыдущие платежи одинаковы (fixedAnnuity), накопленное
      // отклонение из-за дней "выравнивается" здесь
      principal = balance;
      payment = principal + interest;

    } else {
      // Стандартный платёж = фиксированный аннуитет
      // principal = аннуитет − проценты за период
      principal = fixedAnnuity - interest;

      if (principal < 0) {
        // Проценты превысили аннуитет (длинный нестандартный период).
        // Платим только проценты, тело не трогаем — баланс не меняется.
        // Это может случиться только для самого первого периода если он
        // значительно длиннее месяца.
        principal = 0;
        payment = interest;
      } else {
        if (principal > balance) principal = balance;
        payment = principal + interest;
      }
    }

    balance = Math.max(balance - principal, 0);

    // Дата списания = ближайший рабочий день от даты начисления
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

    periodStart = accrualDate;
  }

  return rows;
}
