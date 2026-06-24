import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';
import { MortgageInput, ScheduleRow, fmt, fmt2, fmtDate } from './mortgage';

// Заголовки графика платежей (без даты начисления)
const HEADERS_RU = [
  '№ платежа',
  'Дата списания',
  'Осн. долг',
  'Проценты',
  'Платёж',
  'Остаток',
];

// Таблица транслитерации для PDF
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch', Ъ: '', Ы: 'Y', Ь: '',
  Э: 'E', Ю: 'Yu', Я: 'Ya',
};

const ru2lat = (s: string) => s.replace(/[а-яёА-ЯЁ]/g, (c) => TRANSLIT[c] ?? c);

function fmtDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function makeFileName(variantName: string, ext: string) {
  const safe = variantName.replace(/[^\wа-яёА-ЯЁ -]/g, '').trim().replace(/\s+/g, '_');
  return `Ипотека_${safe}_${fmtDateTime(new Date())}.${ext}`;
}

// Сводка: используем firstPaymentDate из input напрямую
const summaryRows = (input: MortgageInput): [string, string][] => {
  const rows: [string, string][] = [
    ['Дата оформления', fmtDate(input.startDate)],
  ];
  if (input.firstPaymentDate) {
    rows.push(['Дата начисления (число мес.)', fmtDate(input.firstPaymentDate)]);
    rows.push(['Дата первого списания', fmtDate(input.firstPaymentDate)]);
  }
  rows.push(
    ['Стоимость недвижимости', `${fmt(input.price)} руб.`],
    ['Первоначальный взнос', `${fmt(input.down)} руб.`],
    ['Сумма кредита', `${fmt(input.loan)} руб.`],
    ['Процентная ставка', `${input.rate}% годовых`],
    ['Срок', `${input.months} мес. (${(input.months / 12).toFixed(1)} лет)`],
    ['Ежемесячный платёж', `${fmt(input.monthly)} руб.`],
    ['Начисленные проценты', `${fmt(input.overpay)} руб.`],
    ['Долг + проценты (всего)', `${fmt(input.total)} руб.`],
  );
  if ((input.interestOnlyMonths ?? 0) > 0) {
    rows.push(['Льготный период (только %)', `${input.interestOnlyMonths} мес.`]);
  }
  return rows;
};

// Строка графика: только дата списания, без даты начисления
const toRow = (r: ScheduleRow) => [
  r.index,
  fmtDate(r.date),
  Math.round(r.principal),
  Math.round(r.interest),
  Math.round(r.payment),
  Math.round(r.balance),
];

// Итоговая строка для графика
const totalRow = (schedule: ScheduleRow[]) => [
  'Итого',
  '',
  Math.round(schedule.reduce((s, r) => s + r.principal, 0)),
  Math.round(schedule.reduce((s, r) => s + r.interest, 0)),
  Math.round(schedule.reduce((s, r) => s + r.payment, 0)),
  '',
];

// ── Excel ────────────────────────────────────────────────────
export function exportExcel(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const wb = XLSX.utils.book_new();

  // Лист Сводка
  const ws1 = XLSX.utils.aoa_to_sheet([['Параметр', 'Значение'], ...summaryRows(input)]);
  ws1['!cols'] = [{ wch: 32 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Сводка');

  // Лист График платежей
  const rows = schedule.map(toRow);
  const total = totalRow(schedule);
  const ws2 = XLSX.utils.aoa_to_sheet([HEADERS_RU, ...rows, total]);
  ws2['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];

  // Жирный шрифт итоговой строки
  const lastRowIdx = rows.length + 1; // 0-indexed: заголовок=0, данные 1..N, итого=N+1
  for (let c = 0; c < HEADERS_RU.length; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: lastRowIdx, c });
    if (ws2[cellAddr]) ws2[cellAddr].s = { font: { bold: true } };
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'График платежей');
  XLSX.writeFile(wb, makeFileName(variantName, 'xlsx'));
}

// ── PDF (транслитерация) ─────────────────────────────────────
export async function exportPDF(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFont('helvetica');
  doc.setFontSize(13);
  doc.text(`Ipoteka - ${ru2lat(variantName)}`, 14, 15);

  const summaryLat = summaryRows(input).map(([k, v]) => [ru2lat(k), ru2lat(v)]);

  autoTable(doc, {
    startY: 20,
    head: [['Parametr', 'Znachenie']],
    body: summaryLat,
    theme: 'grid',
    headStyles: { fillColor: [36, 36, 36] },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 90 } },
  });

  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  const scheduleBody = schedule.map(toRow);
  const total = totalRow(schedule);

  autoTable(doc, {
    startY: afterSummary + 6,
    head: [HEADERS_RU.map(ru2lat)],
    body: [...scheduleBody, total],
    theme: 'striped',
    headStyles: { fillColor: [14, 165, 233] },
    styles: { fontSize: 7 },
    // Последняя строка жирная
    didParseCell: (data) => {
      if (data.row.index === scheduleBody.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  doc.save(makeFileName(variantName, 'pdf'));
}

// ── Word ─────────────────────────────────────────────────────
export async function exportWord(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const cell = (text: string, bold = false, align: typeof AlignmentType.LEFT = AlignmentType.LEFT) =>
    new TableCell({
      children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size: 18 })] })],
    });

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: summaryRows(input).map((r) => new TableRow({ children: [cell(r[0], true), cell(r[1])] })),
  });

  // Строки данных
  const dataRows = schedule.map((r) =>
    new TableRow({
      children: [
        cell(String(r.index), false, AlignmentType.CENTER),
        cell(fmtDate(r.date)),
        cell(fmt2(r.principal), false, AlignmentType.RIGHT),
        cell(fmt2(r.interest), false, AlignmentType.RIGHT),
        cell(fmt2(r.payment), false, AlignmentType.RIGHT),
        cell(fmt2(r.balance), false, AlignmentType.RIGHT),
      ],
    }),
  );

  // Итоговая строка
  const totalPrincipal = schedule.reduce((s, r) => s + r.principal, 0);
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalPayment = schedule.reduce((s, r) => s + r.payment, 0);
  const totalWordRow = new TableRow({
    children: [
      cell('Итого', true, AlignmentType.CENTER),
      cell('', true),
      cell(fmt2(totalPrincipal), true, AlignmentType.RIGHT),
      cell(fmt2(totalInterest), true, AlignmentType.RIGHT),
      cell(fmt2(totalPayment), true, AlignmentType.RIGHT),
      cell('', true),
    ],
  });

  const scheduleTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: HEADERS_RU.map((h) => cell(h, true, AlignmentType.CENTER)) }),
      ...dataRows,
      totalWordRow,
    ],
  });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: `Ипотека — ${variantName}`, heading: HeadingLevel.HEADING_1 }),
        summaryTable,
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'График платежей', heading: HeadingLevel.HEADING_2 }),
        scheduleTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, makeFileName(variantName, 'docx'));
}
