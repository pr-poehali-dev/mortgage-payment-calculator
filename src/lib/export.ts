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

const HEADERS = ['№', 'Дата', 'Платёж', 'Проценты', 'Основной долг', 'Остаток долга'];

const summaryRows = (input: MortgageInput) => [
  ['Дата оформления', fmtDate(input.startDate)],
  ['Дата первого платежа', fmtDate(new Date(input.startDate.getFullYear(), input.startDate.getMonth() + 1, input.startDate.getDate()))],
  ['Стоимость недвижимости', `${fmt(input.price)} ₽`],
  ['Первоначальный взнос', `${fmt(input.down)} ₽`],
  ['Сумма кредита', `${fmt(input.loan)} ₽`],
  ['Процентная ставка', `${input.rate} % годовых`],
  ['Срок', `${input.months} мес. (${(input.months / 12).toFixed(1)} лет)`],
  ['Ежемесячный платёж', `${fmt(input.monthly)} ₽`],
  ['Начисленные проценты', `${fmt(input.overpay)} ₽`],
  ['Долг + проценты (всего)', `${fmt(input.total)} ₽`],
];

export function exportExcel(input: MortgageInput, schedule: ScheduleRow[]) {
  const wb = XLSX.utils.book_new();

  const summaryData = [['Параметр', 'Значение'], ...summaryRows(input)];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 28 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Сводка');

  const tableData = [
    HEADERS,
    ...schedule.map((r) => [
      r.index,
      fmtDate(r.date),
      Math.round(r.payment),
      Math.round(r.interest),
      Math.round(r.principal),
      Math.round(r.balance),
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(tableData);
  ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'График платежей');

  XLSX.writeFile(wb, 'ипотека-график.xlsx');
}

export function exportPDF(input: MortgageInput, schedule: ScheduleRow[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Mortgage / Ипотека', 14, 18);

  autoTable(doc, {
    startY: 24,
    head: [['Parameter', 'Value']],
    body: summaryRows(input).map((r) => [toAscii(r[0]), toAscii(r[1])]),
    theme: 'grid',
    headStyles: { fillColor: [36, 36, 36] },
    styles: { fontSize: 9 },
  });

  autoTable(doc, {
    head: [['#', 'Date', 'Payment', 'Interest', 'Principal', 'Balance']],
    body: schedule.map((r) => [
      r.index,
      fmtDate(r.date),
      fmt(r.payment),
      fmt(r.interest),
      fmt(r.principal),
      fmt(r.balance),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [232, 116, 30] },
    styles: { fontSize: 7 },
  });

  doc.save('ипотека-график.pdf');
}

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', '₽': 'RUB', '№': 'No',
};

function toAscii(s: string) {
  let out = '';
  for (const ch of s) {
    if (ch.charCodeAt(0) < 128) {
      out += ch;
      continue;
    }
    const lower = ch.toLowerCase();
    const mapped = MAP[lower] ?? ch;
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

export async function exportWord(input: MortgageInput, schedule: ScheduleRow[]) {
  const cell = (text: string, bold = false, align: typeof AlignmentType.LEFT = AlignmentType.LEFT) =>
    new TableCell({
      children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size: 18 })] })],
    });

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: summaryRows(input).map(
      (r) => new TableRow({ children: [cell(r[0], true), cell(r[1])] }),
    ),
  });

  const scheduleTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: HEADERS.map((h) => cell(h, true, AlignmentType.CENTER)) }),
      ...schedule.map(
        (r) =>
          new TableRow({
            children: [
              cell(String(r.index), false, AlignmentType.CENTER),
              cell(fmtDate(r.date)),
              cell(fmt2(r.payment), false, AlignmentType.RIGHT),
              cell(fmt2(r.interest), false, AlignmentType.RIGHT),
              cell(fmt2(r.principal), false, AlignmentType.RIGHT),
              cell(fmt2(r.balance), false, AlignmentType.RIGHT),
            ],
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Ипотека — расчёт', heading: HeadingLevel.HEADING_1 }),
          summaryTable,
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'График платежей', heading: HeadingLevel.HEADING_2 }),
          scheduleTable,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'ипотека-график.docx');
}