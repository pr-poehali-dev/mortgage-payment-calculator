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

// ── Даты ──────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const msA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const msB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((msB - msA) / 86_400_000);
}

function daysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
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
  if (`${yyyy}-${dd}-${mm}` in TRANSFERS) return TRANSFERS[`${yyyy}-${dd}-${mm}`];
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return FIXED_HOLIDAYS.has(`${dd}-${mm}`);
}

export function nextWorkDay(d: Date): Date {
  const r = new Date(d);
  while (isHoliday(r)) r.setDate(r.getDate() + 1);
  return r;
}

// ── Проценты по ACT/ACT ───────────────────────────────────────
// Формула банков РФ: проценты = остаток × ставка_год / дней_в_году × дней_в_периоде
// Если период пересекает год — считаем по частям с разным базисом
function interestForPeriod(balance: number, annualRatePct: number, from: Date, to: Date): number {
  const rate = annualRatePct / 100;
  let result = 0;
  let cur = new Date(from);

  while (cur < to) {
    const yearEnd = new Date(Date.UTC(cur.getFullYear() + 1, 0, 1)); // 1 янв следующего года
    const segEnd = to < yearEnd ? to : yearEnd;
    const days = daysBetween(cur, segEnd);
    result += balance * rate / daysInYear(cur.getFullYear()) * days;
    cur = segEnd;
  }

  return result;
}

// ── Аннуитетный платёж ────────────────────────────────────────
// Стандартная формула: A = P × i × (1+i)^n / ((1+i)^n − 1), где i = rate/12
export function calcMonthlyPayment(loan: number, annualRatePct: number, months: number): number {
  if (loan <= 0 || months <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return loan / months;
  return (loan * i * Math.pow(1 + i, months)) / (Math.pow(1 + i, months) - 1);
}

// ── Построение графика ────────────────────────────────────────
export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { loan, rate, months, startDate, firstPaymentDate, interestOnlyMonths = 0 } = input;

  const rows: ScheduleRow[] = [];
  let balance = loan;

  // Дата первого начисления процентов
  const base = firstPaymentDate ?? addMonths(startDate, 1);

  // Аннуитетный платёж фиксируется ОДИН РАЗ на весь срок (за исключением льготного периода).
  // Считается от суммы кредита и эффективного срока (без льготных месяцев).
  const effectiveMonths = months - interestOnlyMonths;
  const fixedAnnuity = calcMonthlyPayment(loan, rate, effectiveMonths);

  // Точка отсчёта первого периода = дата оформления
  let periodStart = new Date(Date.UTC(
    startDate.getFullYear(), startDate.getMonth(), startDate.getDate()
  ));

  for (let m = 1; m <= months; m++) {
    // Дата начисления = фиксированное число месяца (из firstPaymentDate)
    const rawAccrual = addMonths(base, m - 1);
    const accrualDate = new Date(Date.UTC(
      rawAccrual.getFullYear(), rawAccrual.getMonth(), rawAccrual.getDate()
    ));

    // Фактических дней в периоде
    const days = daysBetween(periodStart, accrualDate);

    // Проценты по ACT/ACT — от periodStart до accrualDate
    const interest = interestForPeriod(balance, rate, periodStart, accrualDate);

    const isInterestOnly = m <= interestOnlyMonths;
    let principal: number;
    let payment: number;

    if (isInterestOnly) {
      // Льготный период: платим только начисленные проценты
      principal = 0;
      payment = interest;
    } else if (m === months) {
      // Последний платёж: гасим весь остаток + проценты
      principal = balance;
      payment = balance + interest;
    } else {
      // Стандартный аннуитетный платёж.
      // Проценты посчитаны по дням (ACT/ACT), тело = аннуитет − проценты.
      // Первый платёж может отличаться если период нестандартной длины —
      // это норма, так делают все банки (Сбер, ВТБ и др.).
      payment = fixedAnnuity;
      principal = payment - interest;

      // Если вдруг проценты за нестандартный период превысили аннуитет
      // (крайне редкий случай: очень длинный первый период + очень высокая ставка),
      // первый платёж = только проценты + 1 коп. тела, остальные — по обычному аннуитету
      if (principal <= 0) {
        principal = 0;
        payment = interest;
      }

      if (principal > balance) {
        principal = balance;
        payment = principal + interest;
      }
    }

    balance = Math.max(balance - principal, 0);

    // Дата списания = ближайший рабочий день (с учётом праздников РФ)
    const payDate = nextWorkDay(new Date(rawAccrual));

    rows.push({
      index: m,
      date: payDate,
      accrualDate: new Date(rawAccrual),
      payment,
      interest,
      principal,
      balance,
      interestOnly: isInterestOnly,
      days,
    });

    // Следующий период начинается с текущей даты начисления
    periodStart = accrualDate;
  }

  return rows;
}
