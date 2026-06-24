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

// Заголовки столбцов графика в нужном порядке
const HEADERS_RU = [
  '№ платежа',
  'Дата начисления',
  'Дата списания',
  'Сумма основного долга',
  'Сумма начисленных процентов',
  'Общая сумма платежа',
  'Остаток долга',
];

function fmtDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function makeFileName(variantName: string, ext: string) {
  const safe = variantName.replace(/[^\wа-яёА-ЯЁ -]/g, '').trim().replace(/\s+/g, '_');
  return `Ипотека_${safe}_${fmtDateTime(new Date())}.${ext}`;
}

const summaryRows = (input: MortgageInput): [string, string][] => [
  ['Дата оформления', fmtDate(input.startDate)],
  ['Дата первого платежа', fmtDate(new Date(input.startDate.getFullYear(), input.startDate.getMonth() + 1, input.startDate.getDate()))],
  ['Стоимость недвижимости', `${fmt(input.price)} ₽`],
  ['Первоначальный взнос', `${fmt(input.down)} ₽`],
  ['Сумма кредита', `${fmt(input.loan)} ₽`],
  ['Процентная ставка', `${input.rate}% годовых`],
  ['Срок', `${input.months} мес. (${(input.months / 12).toFixed(1)} лет)`],
  ['Ежемесячный платёж', `${fmt(input.monthly)} ₽`],
  ['Начисленные проценты', `${fmt(input.overpay)} ₽`],
  ['Долг + проценты (всего)', `${fmt(input.total)} ₽`],
];

// Порядок: № | Дата начисления | Дата списания | Осн. долг | Проценты | Платёж | Остаток
const toRow = (r: ScheduleRow) => [
  r.index,
  fmtDate(r.accrualDate),
  fmtDate(r.date),
  Math.round(r.principal),
  Math.round(r.interest),
  Math.round(r.payment),
  Math.round(r.balance),
];

export function exportExcel(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([['Параметр', 'Значение'], ...summaryRows(input)]);
  ws1['!cols'] = [{ wch: 28 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Сводка');

  const ws2 = XLSX.utils.aoa_to_sheet([HEADERS_RU, ...schedule.map(toRow)]);
  ws2['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'График платежей');

  XLSX.writeFile(wb, makeFileName(variantName, 'xlsx'));
}

// Кэш base64 шрифта с кириллицей (загружается один раз)
let _fontBase64: string | null = null;

async function loadCyrillicFont(): Promise<string | null> {
  if (_fontBase64) return _fontBase64;
  try {
    // Roboto Regular — поддерживает кириллицу, загружаем через Google Fonts CSS API
    // Получаем реальный URL ttf-файла
    const cssResp = await fetch('https://fonts.googleapis.com/css2?family=Roboto&subset=cyrillic', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const css = await cssResp.text();
    const match = css.match(/src:\s*url\(([^)]+\.ttf)\)/);
    const ttfUrl = match?.[1];
    if (!ttfUrl) return null;
    const fontResp = await fetch(ttfUrl);
    const buffer = await fontResp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    _fontBase64 = base64;
    return base64;
  } catch {
    return null;
  }
}

export async function exportPDF(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const doc = new jsPDF({ orientation: 'landscape' });

  // Пытаемся загрузить кириллический шрифт
  const fontB64 = await loadCyrillicFont();
  let fontName = 'helvetica';
  if (fontB64) {
    doc.addFileToVFS('Roboto-Regular.ttf', fontB64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    fontName = 'Roboto';
  }

  doc.setFont(fontName);
  doc.setFontSize(13);
  doc.text(`Ипотека — ${variantName}`, 14, 15);

  const tableStyles = { font: fontName, fontSize: 9 };
  const tableStyles7 = { font: fontName, fontSize: 7 };

  autoTable(doc, {
    startY: 20,
    head: [['Параметр', 'Значение']],
    body: summaryRows(input),
    theme: 'grid',
    headStyles: { fillColor: [36, 36, 36], font: fontName },
    styles: tableStyles,
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 80 } },
  });

  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  autoTable(doc, {
    startY: afterSummary + 6,
    head: [HEADERS_RU],
    body: schedule.map(toRow),
    theme: 'striped',
    headStyles: { fillColor: [14, 165, 233], font: fontName },
    styles: tableStyles7,
  });

  doc.save(makeFileName(variantName, 'pdf'));
}

export async function exportWord(input: MortgageInput, schedule: ScheduleRow[], variantName = 'Вариант 1') {
  const cell = (text: string, bold = false, align: typeof AlignmentType.LEFT = AlignmentType.LEFT) =>
    new TableCell({
      children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size: 18 })] })],
    });

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: summaryRows(input).map((r) => new TableRow({ children: [cell(r[0], true), cell(r[1])] })),
  });

  const scheduleTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: HEADERS_RU.map((h) => cell(h, true, AlignmentType.CENTER)) }),
      ...schedule.map((r) =>
        new TableRow({
          children: [
            cell(String(r.index), false, AlignmentType.CENTER),
            cell(fmtDate(r.accrualDate)),
            cell(fmtDate(r.date)),
            cell(fmt2(r.principal), false, AlignmentType.RIGHT),
            cell(fmt2(r.interest), false, AlignmentType.RIGHT),
            cell(fmt2(r.payment), false, AlignmentType.RIGHT),
            cell(fmt2(r.balance), false, AlignmentType.RIGHT),
          ],
        }),
      ),
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