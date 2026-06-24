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
  date: Date;
  accrualDate: Date;
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

export const addMonths = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

function daysBetween(a: Date, b: Date): number {
  const msA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const msB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((msB - msA) / 86_400_000);
}

function daysInYear(d: Date): number {
  const y = d.getFullYear();
  return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
}

// Проценты за период [prevDate, curDate) по ACT/ACT — с разбивкой по годам
function calcInterest(balance: number, annualRatePct: number, prevDate: Date, curDate: Date): number {
  const rate = annualRatePct / 100;
  let interest = 0;
  let segStart = new Date(prevDate);

  while (segStart < curDate) {
    const y = segStart.getFullYear();
    const nextYearStart = new Date(Date.UTC(y + 1, 0, 1));
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

  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Аннуитетный платёж фиксируется один раз по формуле rate/12.
  // Проценты внутри каждого платежа — по фактическим дням (ACT/ACT).
  // Основной долг = фиксированный_платёж − проценты_за_период.
  // Если первый период длиннее месяца и проценты > аннуитета —
  // платёж в этот месяц увеличивается до суммы процентов (тело = 0),
  // далее аннуитет остаётся прежним.
  const monthlyRate = rate / 100 / 12;
  const calcAnnuity = (bal: number, n: number): number => {
    if (n <= 0 || bal <= 0) return 0;
    if (monthlyRate === 0) return bal / n;
    return (bal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  };

  const effectiveMonths = months - interestOnlyMonths;
  const fixedPayment = calcAnnuity(loan, effectiveMonths);

  // Начало первого периода = дата оформления (UTC-полночь)
  let prevUTC = new Date(
    Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  );

  for (let m = 1; m <= months; m++) {
    const accrualDate = addMonths(base, m - 1);
    const accrualUTC = new Date(
      Date.UTC(accrualDate.getFullYear(), accrualDate.getMonth(), accrualDate.getDate())
    );

    const days = daysBetween(prevUTC, accrualUTC);

    // Проценты за фактический период (ACT/ACT, с разбивкой по годам)
    const interest = calcInterest(balance, rate, prevUTC, accrualUTC);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      principal = 0;
      payment = interest;
    } else {
      if (m === months) {
        // Последний платёж — гасим всё что осталось
        principal = balance;
        payment = principal + interest;
      } else {
        // Стандартный платёж = фиксированный аннуитет
        // principal = платёж - проценты
        // Если проценты >= аннуитета (нестандартно длинный период) — principal = 0
        principal = Math.max(0, fixedPayment - interest);
        if (principal > balance) principal = balance;
        payment = principal + interest;
      }
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
