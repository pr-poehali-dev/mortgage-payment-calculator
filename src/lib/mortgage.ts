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
  firstPaymentDate?: Date;   // дата ежемесячного списания (5-е число месяца и т.п.)
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
  const { loan, rate, months, monthly, startDate, firstPaymentDate, interestOnlyMonths = 0 } = input;
  const i = rate / 100 / 12;
  let balance = loan;
  const rows: ScheduleRow[] = [];

  // Базовая дата начисления: если задана firstPaymentDate — используем её день месяца.
  // Проценты начисляются к фиксированному числу (день firstPaymentDate).
  // Дата списания = nextWorkDay от даты начисления.
  // Если firstPaymentDate не задана — отсчёт от startDate + m месяцев.
  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Пересчитываем аннуитет с учётом interestOnlyMonths:
  // Первые interestOnlyMonths месяцев — только проценты, остаток не уменьшается.
  // Затем оставшийся долг гасится за (months - interestOnlyMonths) месяцев по аннуитету.
  const effectiveMonths = months - interestOnlyMonths;
  const calcMonthly = (bal: number, n: number) => {
    if (n <= 0 || bal <= 0) return 0;
    const r = rate / 100 / 12;
    if (r === 0) return bal / n;
    return (bal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };

  // Аннуитетный платёж рассчитывается от исходной суммы на эффективный срок
  const annuityPayment = interestOnlyMonths > 0
    ? calcMonthly(loan, effectiveMonths)
    : monthly;

  for (let m = 1; m <= months; m++) {
    const interest = balance * i;
    const isInterestOnly = m <= interestOnlyMonths;

    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      // Только проценты — тело долга не гасится
      principal = 0;
      payment = interest;
    } else {
      // Аннуитет от оставшегося баланса
      const remainingMonths = months - m + 1 - interestOnlyMonths;
      const mp = remainingMonths <= 0
        ? balance + interest
        : annuityPayment;
      principal = mp - interest;
      if (m === months || principal > balance) principal = balance;
      payment = principal + interest;
    }

    balance = Math.max(balance - principal, 0);

    // Дата начисления — фиксированное число (день base), m-й месяц
    const accrualDate = addMonths(base, m - 1);
    // Дата списания — ближайший рабочий день от даты начисления
    const payDate = nextWorkDay(accrualDate);

    rows.push({
      index: m,
      date: payDate,
      accrualDate,
      payment,
      interest,
      principal,
      balance,
      interestOnly: isInterestOnly,
    });
  }
  return rows;
}
