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
  firstPaymentDate?: Date; // если задана, даты платежей отсчитываются от неё
}

export interface ScheduleRow {
  index: number;
  date: Date;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
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
// Фиксированные праздники (ДД-ММ)
const FIXED_HOLIDAYS = new Set([
  '01-01', '02-01', '03-01', '04-01', '05-01', '06-01', '07-01', '08-01', // Новогодние + Рождество
  '23-02', // День защитника
  '08-03', // Женский день
  '01-05', // Праздник труда
  '09-05', // День победы
  '12-06', // День России
  '04-11', // День народного единства
]);

// Переносы для конкретных годов (ГГГГ-ДД-ММ) — добавляем актуальные
const TRANSFERS: Record<string, boolean> = {
  // 2024
  '2024-29-12': true,
  // 2025
  '2025-31-01': true,
  '2025-10-01': false, // рабочая суббота -> убираем праздник если нужно
  // 2026
  '2026-09-01': true,
};

function isHoliday(d: Date): boolean {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const key = `${yyyy}-${dd}-${mm}`;
  const dayKey = `${dd}-${mm}`;
  // Явный перенос
  if (key in TRANSFERS) return TRANSFERS[key];
  // Выходные (сб, вс)
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  // Фиксированный праздник
  return FIXED_HOLIDAYS.has(dayKey);
}

// Сдвинуть дату на ближайший рабочий день вперёд
export function nextWorkDay(d: Date): Date {
  const result = new Date(d);
  while (isHoliday(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { loan, rate, months, monthly, startDate, firstPaymentDate } = input;
  const i = rate / 100 / 12;
  let balance = loan;
  const rows: ScheduleRow[] = [];

  // Базовая дата для отсчёта платежей: если задана firstPaymentDate,
  // то используем её как первый платёж, последующие — через addMonths от неё.
  // Иначе отсчитываем от startDate + m месяцев.
  const base = firstPaymentDate ?? null;

  for (let m = 1; m <= months; m++) {
    const interest = balance * i;
    let principal = monthly - interest;
    if (m === months || principal > balance) principal = balance;
    balance = Math.max(balance - principal, 0);

    let rawDate: Date;
    if (base) {
      // Первый платёж = firstPaymentDate, второй = firstPaymentDate + 1 мес, и т.д.
      rawDate = addMonths(base, m - 1);
    } else {
      rawDate = addMonths(startDate, m);
    }
    const payDate = nextWorkDay(rawDate);

    rows.push({
      index: m,
      date: payDate,
      payment: principal + interest,
      interest,
      principal,
      balance,
    });
  }
  return rows;
}