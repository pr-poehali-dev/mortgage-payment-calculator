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

export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { loan, rate, months, monthly, startDate } = input;
  const i = rate / 100 / 12;
  let balance = loan;
  const rows: ScheduleRow[] = [];

  for (let m = 1; m <= months; m++) {
    const interest = balance * i;
    let principal = monthly - interest;
    if (m === months || principal > balance) principal = balance;
    balance = Math.max(balance - principal, 0);
    rows.push({
      index: m,
      date: addMonths(startDate, m),
      payment: principal + interest,
      interest,
      principal,
      balance,
    });
  }
  return rows;
}
