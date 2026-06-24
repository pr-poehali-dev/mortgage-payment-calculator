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
  firstPaymentDate?: Date;     // дата ежемесячного списания (=число месяца)
  interestOnlyMonths?: number; // кол-во первых платежей только проценты
}

export interface ScheduleRow {
  index: number;
  date: Date;        // фактическая дата списания (с учётом выходных/праздников)
  accrualDate: Date; // дата начисления (фиксированное число месяца)
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  interestOnly: boolean;
  days: number;      // фактическое количество дней начисления
}

export const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

export const fmt2 = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

export const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
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
  const annualRate = rate / 100;
  let balance = loan;
  const rows: ScheduleRow[] = [];

  // База для дат начисления: если задана firstPaymentDate — первое начисление в её день,
  // иначе startDate + 1 мес.
  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Рассчитываем аннуитетный платёж для обычного (не льготного) периода.
  // После льготного периода аннуитет считается по оставшемуся долгу и остаточному сроку.
  const calcMonthly = (bal: number, n: number) => {
    if (n <= 0 || bal <= 0) return 0;
    const r = annualRate / 12;
    if (r === 0) return bal / n;
    return (bal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };

  // Аннуитет на весь срок после льготного периода (фиксируется в начале)
  const effectiveMonths = months - interestOnlyMonths;
  const fixedAnnuity = calcMonthly(loan, effectiveMonths);

  // Предыдущая дата начисления — для расчёта фактических дней
  // Первый период: от startDate до первого accrualDate
  let prevAccrualDate: Date = new Date(startDate);
  prevAccrualDate.setHours(0, 0, 0, 0);

  for (let m = 1; m <= months; m++) {
    // Дата начисления этого платежа (фиксированное число месяца)
    const accrualDate = addMonths(base, m - 1);
    const days = daysBetween(prevAccrualDate, accrualDate);

    // Проценты за фактическое количество дней
    // Формула: баланс * годовая_ставка / 365 * дней
    const interest = balance * annualRate / 365 * days;

    const isInterestOnly = m <= interestOnlyMonths;

    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      principal = 0;
      payment = interest;
    } else {
      // После льготного периода — аннуитет, но проценты уже посчитаны по дням
      // Основной долг = фиксированный_аннуитет - проценты_за_месяц
      // Используем аннуитет, зафиксированный на начало обычного периода
      const annuity = interestOnlyMonths > 0 ? fixedAnnuity : calcMonthly(loan, effectiveMonths);
      principal = annuity - interest;
      if (m === months || principal > balance) principal = balance;
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

    prevAccrualDate = new Date(accrualDate);
  }
  return rows;
}
