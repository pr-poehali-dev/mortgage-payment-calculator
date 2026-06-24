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

// Проценты за период [prevDate, curDate) по ACT/ACT
function calcInterestForPeriod(balance: number, annualRatePct: number, prevDate: Date, curDate: Date): number {
  const rate = annualRatePct / 100;
  let interest = 0;
  let segStart = new Date(prevDate);
  while (segStart < curDate) {
    const y = segStart.getFullYear();
    const nextYearStart = new Date(Date.UTC(y + 1, 0, 1));
    const segEnd = curDate < nextYearStart ? curDate : nextYearStart;
    const days = daysBetween(segStart, segEnd);
    interest += balance * rate / daysInYear(segStart) * days;
    segStart = segEnd;
  }
  return interest;
}

// Периодическая ставка для конкретного периода (по фактическим дням)
function periodRate(annualRatePct: number, prevDate: Date, curDate: Date): number {
  const rate = annualRatePct / 100;
  let r = 0;
  let segStart = new Date(prevDate);
  while (segStart < curDate) {
    const y = segStart.getFullYear();
    const nextYearStart = new Date(Date.UTC(y + 1, 0, 1));
    const segEnd = curDate < nextYearStart ? curDate : nextYearStart;
    const days = daysBetween(segStart, segEnd);
    r += rate / daysInYear(segStart) * days;
    segStart = segEnd;
  }
  return r;
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
  const monthlyRate = rate / 100 / 12; // стандартная месячная ставка

  // Заранее вычисляем все даты начисления (UTC)
  const accrualDates: Date[] = [];
  for (let m = 1; m <= months; m++) {
    const d = addMonths(base, m - 1);
    accrualDates.push(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  }

  // Начало первого периода = дата оформления
  let prevUTC = new Date(
    Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  );

  for (let m = 1; m <= months; m++) {
    const accrualDate = addMonths(base, m - 1);
    const accrualUTC = accrualDates[m - 1];

    const days = daysBetween(prevUTC, accrualUTC);

    // Проценты за фактический период (ACT/ACT)
    const interest = calcInterestForPeriod(balance, rate, prevUTC, accrualUTC);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      principal = 0;
      payment = interest;
    } else if (m === months) {
      principal = balance;
      payment = principal + interest;
    } else {
      // Считаем аннуитет с учётом фактической ставки ТЕКУЩЕГО периода.
      //
      // Логика: PV = A/(1+r0) + A/((1+r0)(1+r1)) + ... + A/((1+r0)(1+r1)^(n-1))
      //   где r0 = периодическая ставка текущего (возможно нестандартного) периода
      //       r1 = стандартная месячная ставка для всех последующих периодов
      //       n  = оставшееся кол-во платежей включая текущий
      //
      // PV = A * (1/(1+r0)) * (1 + sum_{k=1}^{n-1} 1/(1+r1)^k)
      //    = A * (1/(1+r0)) * (1 + (1 - (1+r1)^{-(n-1)}) / r1)
      //
      // => A = PV / [ (1/(1+r0)) * (1 + (1-(1+r1)^{-(n-1)})/r1) ]

      const normalPaymentsDone = Math.max(0, m - interestOnlyMonths); // сколько обычных сделано
      const n = (months - interestOnlyMonths) - normalPaymentsDone + 1; // оставшихся включая текущий

      const r0 = periodRate(rate, prevUTC, accrualUTC); // фактическая ставка этого периода
      const r1 = monthlyRate;                           // стандартная для следующих

      let currentAnnuity: number;
      if (n === 1) {
        currentAnnuity = balance * (1 + r0);
      } else if (r1 === 0) {
        currentAnnuity = balance / n;
      } else {
        const tail = (1 - Math.pow(1 + r1, -(n - 1))) / r1; // аннуитетный множитель хвоста
        const pv = (1 / (1 + r0)) * (1 + tail);
        currentAnnuity = balance / pv;
      }

      principal = currentAnnuity - interest;
      // Если период нестандартно длинный и проценты превысили аннуитет —
      // гасим минимум 1 руб. тела, чтобы долг всегда двигался вперёд
      if (principal < 1) principal = Math.min(1, balance);
      if (principal > balance) principal = balance;
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