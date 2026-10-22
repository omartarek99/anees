import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { MonthlyUser, ReportRow, ReportTotals, RoleFilter } from './reportData.js';

// Builds the admin usage report as a branded, LOCKED .xlsx: every sheet is protected so cells can't
// be edited, deleted, inserted or reformatted (Excel asks for a password to unprotect; filters,
// sorting and selecting/copying stay available so the data is still usable). Sheet protection is
// a guard against accidental or casual edits -- not encryption: anyone can still copy the values
// into a new file.

export type ReportLang = 'ar' | 'en';

const TEXT = {
  ar: {
    brand: 'أنيس',
    title: 'تقرير الاستخدام',
    generated: 'تاريخ الإصدار',
    scope: 'النطاق',
    scopeAll: 'الطلاب والمعلمون',
    scopeStudent: 'الطلاب فقط',
    scopeTeacher: 'المعلمون فقط',
    gradeWord: 'الصف',
    protectedNote: 'هذا التقرير محمي ولا يمكن تعديله.',
    sheetSummary: 'الملخص',
    sheetUsers: 'المستخدمون',
    sheetMonthly: 'الوقت الشهري',
    indicator: 'المؤشر',
    value: 'القيمة',
    kStudents: 'عدد الطلاب',
    kTeachers: 'عدد المعلمين',
    kWatch: 'إجمالي وقت المشاهدة',
    kWsDone: 'أوراق العمل المنجزة',
    kWsPrinted: 'أوراق العمل المطبوعة (المعلمون)',
    kVideos: 'الفيديوهات المرفوعة (المعلمون)',
    kQuizzes: 'الاختبارات المحلولة',
    kViews: 'مشاهدات الصفحات (آخر 30 يومًا)',
    colNo: '#',
    colName: 'الاسم',
    colUsername: 'اسم المستخدم',
    colRole: 'الدور',
    colGradeSubject: 'الصف / المادة',
    colSchool: 'المدرسة',
    colWatch: 'وقت المشاهدة',
    colReels: 'الدروس المشاهدة',
    colWatchPts: 'نقاط المشاهدة',
    colWsDone: 'أوراق العمل المنجزة',
    colWsPrinted: 'أوراق العمل المطبوعة',
    colVideos: 'الفيديوهات المرفوعة',
    colUploaded: 'مدة الفيديوهات المرفوعة',
    colPoints: 'النقاط الإجمالية',
    colJoined: 'تاريخ الانضمام',
    colTotal: 'الإجمالي',
    totals: 'الإجمالي',
    student: 'طالب',
    teacher: 'معلم',
    subjects: {
      math: 'الرياضيات',
      science: 'العلوم',
      islamic: 'التربية الإسلامية',
      english: 'اللغة الإنجليزية',
      arabic: 'اللغة العربية',
      ict: 'الحاسوب وتكنولوجيا المعلومات',
      social: 'الاجتماعيات',
    } as Record<string, string>,
    docTitle: 'أنيس — تقرير الاستخدام',
  },
  en: {
    brand: 'Anees',
    title: 'Usage report',
    generated: 'Generated',
    scope: 'Scope',
    scopeAll: 'Students and teachers',
    scopeStudent: 'Students only',
    scopeTeacher: 'Teachers only',
    gradeWord: 'Grade',
    protectedNote: 'This report is protected and cannot be edited.',
    sheetSummary: 'Summary',
    sheetUsers: 'Users',
    sheetMonthly: 'Monthly watch time',
    indicator: 'Indicator',
    value: 'Value',
    kStudents: 'Students',
    kTeachers: 'Teachers',
    kWatch: 'Total watch time',
    kWsDone: 'Worksheets completed',
    kWsPrinted: 'Worksheets printed (teachers)',
    kVideos: 'Videos uploaded (teachers)',
    kQuizzes: 'Quizzes solved',
    kViews: 'Page views (last 30 days)',
    colNo: '#',
    colName: 'Name',
    colUsername: 'Username',
    colRole: 'Role',
    colGradeSubject: 'Grade / Subject',
    colSchool: 'School',
    colWatch: 'Watch time',
    colReels: 'Lessons watched',
    colWatchPts: 'Watch points',
    colWsDone: 'Worksheets completed',
    colWsPrinted: 'Worksheets printed',
    colVideos: 'Videos uploaded',
    colUploaded: 'Uploaded video length',
    colPoints: 'Total points',
    colJoined: 'Joined',
    colTotal: 'Total',
    totals: 'Total',
    student: 'Student',
    teacher: 'Teacher',
    subjects: {
      math: 'Mathematics',
      science: 'Science',
      islamic: 'Islamic Education',
      english: 'English Language',
      arabic: 'Arabic Language',
      ict: 'Computer & IT',
      social: 'Social Studies',
    } as Record<string, string>,
    docTitle: 'Anees — Usage report',
  },
};

const COLOR = {
  brand: 'FF8A1538',
  brandDark: 'FF5C0D20',
  gold: 'FFC9A24B',
  cream: 'FFFBF3E9',
  band: 'FFF6EEE4',
  line: 'FFD9CFC4',
  ink: 'FF2B2B2B',
  muted: 'FF6B6B6B',
  white: 'FFFFFFFF',
};

const thin = { style: 'thin' as const, color: { argb: COLOR.line } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const TIME_FORMAT = '[h]:mm:ss';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function styleTitleBlock(ws: ExcelJS.Worksheet, lastCol: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: 'Calibri', size: 20, bold: true, color: { argb: COLOR.white } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  ws.mergeCells(2, 1, 2, lastCol);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: 'Calibri', size: 10.5, italic: true, color: { argb: COLOR.muted } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cream } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Gold rule under the title block.
  for (let c = 1; c <= lastCol; c++) ws.getCell(3, c).border = { top: { style: 'medium', color: { argb: COLOR.gold } } };
  ws.getRow(3).height = 6;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, lastCol: number) {
  const row = ws.getRow(rowNumber);
  row.height = 34;
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brandDark } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
  }
}

function styleBodyRow(row: ExcelJS.Row, index: number, lastCol: number, textCols: Set<number>, textAlign: 'left' | 'right') {
  row.height = 21;
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 11, color: { argb: COLOR.ink } };
    cell.border = BORDER;
    cell.alignment = { vertical: 'middle', horizontal: textCols.has(c) ? textAlign : 'center' };
    if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
  }
}

function styleTotalsRow(row: ExcelJS.Row, lastCol: number) {
  row.height = 26;
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: COLOR.brandDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cream } };
    cell.border = { top: { style: 'medium', color: { argb: COLOR.brand } }, bottom: { style: 'medium', color: { argb: COLOR.brand } }, left: thin, right: thin };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

function pageSetup(ws: ExcelJS.Worksheet, headerRow: number) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: '&L&8Anees&C&8Page &P of &N&R&8&D' };
}

export type ReportInput = {
  lang: ReportLang;
  role: RoleFilter;
  grade: number | null;
  rows: ReportRow[];
  totals: ReportTotals;
  months: string[];
  monthlyUsers: MonthlyUser[];
  quizzesSolved: number;
  pageViews30d: number;
};

export async function buildReportWorkbook(input: ReportInput): Promise<{ buffer: Buffer; filename: string }> {
  const T = TEXT[input.lang];
  const rtl = input.lang === 'ar';
  const textAlign: 'left' | 'right' = rtl ? 'right' : 'left';
  const now = new Date();
  const locale = rtl ? 'ar-QA' : 'en-GB';
  const generated = now.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
  const scope =
    (input.role === 'student' ? T.scopeStudent : input.role === 'teacher' ? T.scopeTeacher : T.scopeAll) +
    (input.grade !== null ? ` — ${T.gradeWord} ${input.grade}` : '');
  const subtitle = `${T.generated}: ${generated}   |   ${T.scope}: ${scope}   |   ${T.protectedNote}`;
  const roleLabel = (r: 'student' | 'teacher') => (r === 'teacher' ? T.teacher : T.student);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Anees';
  wb.lastModifiedBy = 'Anees';
  wb.company = 'Anees';
  wb.title = T.docTitle;
  wb.subject = T.title;
  wb.created = now;
  wb.modified = now;
  // Totals are formulas: have Excel recalculate them on open instead of trusting cached values.
  wb.calcProperties = { fullCalcOnLoad: true };

  const view = (extra: Partial<ExcelJS.WorksheetView> = {}): Partial<ExcelJS.WorksheetView>[] => [
    { rightToLeft: rtl, showGridLines: false, zoomScale: 100, ...extra },
  ];
  const tab = { argb: COLOR.brand };

  // Tab order: Summary, Users, Monthly. The Summary is created first but filled in after the Users sheet,
  // because its formulas point into it.
  const summary = wb.addWorksheet(T.sheetSummary, { properties: { tabColor: { argb: COLOR.gold } }, views: view() });
  const users = wb.addWorksheet(T.sheetUsers, { properties: { tabColor: tab }, views: view({ state: 'frozen', xSplit: 3, ySplit: 4 }) });
  const userCols = [
    { header: T.colNo, width: 6 },
    { header: T.colName, width: 26 },
    { header: T.colUsername, width: 20 },
    { header: T.colRole, width: 11 },
    { header: T.colGradeSubject, width: 22 },
    { header: T.colSchool, width: 26 },
    { header: T.colWatch, width: 15 },
    { header: T.colReels, width: 13 },
    { header: T.colWatchPts, width: 13 },
    { header: T.colWsDone, width: 15 },
    { header: T.colWsPrinted, width: 15 },
    { header: T.colVideos, width: 13 },
    { header: T.colUploaded, width: 17 },
    { header: T.colPoints, width: 13 },
    { header: T.colJoined, width: 14 },
  ];
  const UC = userCols.length;
  userCols.forEach((c, i) => (users.getColumn(i + 1).width = c.width));
  styleTitleBlock(users, UC, `${T.brand} — ${T.title}`, subtitle);
  userCols.forEach((c, i) => (users.getCell(4, i + 1).value = c.header));
  styleHeaderRow(users, 4, UC);

  const firstData = 5;
  input.rows.forEach((r, i) => {
    const row = users.getRow(firstData + i);
    const gradeSubject = r.role === 'teacher' ? (r.teacherSubject ? T.subjects[r.teacherSubject] ?? r.teacherSubject : '') : r.grade !== null ? `${T.gradeWord} ${r.grade}` : '';
    row.values = [
      i + 1,
      r.displayName,
      r.username,
      roleLabel(r.role),
      gradeSubject,
      r.schoolName ?? '',
      r.watchedSeconds / 86400,
      r.reelsWatched,
      r.watchPoints,
      r.worksheetsDone,
      r.worksheetsPrinted,
      r.videosUploaded,
      r.uploadedSeconds / 86400,
      r.points,
      new Date(r.joinedAt.replace(' ', 'T') + 'Z'),
    ];
    styleBodyRow(row, i, UC, new Set([2, 3, 5, 6]), textAlign);
    row.getCell(7).numFmt = TIME_FORMAT;
    row.getCell(13).numFmt = TIME_FORMAT;
    row.getCell(15).numFmt = 'yyyy-mm-dd';
    row.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLOR.muted } };
  });
  const lastData = firstData + Math.max(input.rows.length, 1) - 1;
  const totalRowNo = lastData + 1;
  const totalRow = users.getRow(totalRowNo);
  totalRow.getCell(2).value = T.totals;
  const sumCol = (col: number, result: number, fmt?: string) => {
    const L = colLetter(col);
    const cell = totalRow.getCell(col);
    cell.value = { formula: `SUM(${L}${firstData}:${L}${lastData})`, result };
    if (fmt) cell.numFmt = fmt;
  };
  sumCol(7, input.totals.watchedSeconds / 86400, TIME_FORMAT);
  sumCol(8, input.rows.reduce((s, r) => s + r.reelsWatched, 0));
  sumCol(9, input.rows.reduce((s, r) => s + r.watchPoints, 0));
  sumCol(10, input.totals.worksheetsDone);
  sumCol(11, input.totals.worksheetsPrinted);
  sumCol(12, input.totals.videosUploaded);
  sumCol(13, input.rows.reduce((s, r) => s + r.uploadedSeconds, 0) / 86400, TIME_FORMAT);
  sumCol(14, input.rows.reduce((s, r) => s + r.points, 0));
  styleTotalsRow(totalRow, UC);
  users.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastData, column: UC } };
  pageSetup(users, 4);

  // ------------------------------------------------------------------ Summary sheet
  summary.getColumn(1).width = 44;
  summary.getColumn(2).width = 22;
  styleTitleBlock(summary, 2, `${T.brand} — ${T.title}`, subtitle);
  summary.getCell(4, 1).value = T.indicator;
  summary.getCell(4, 2).value = T.value;
  styleHeaderRow(summary, 4, 2);
  const U = (col: number) => `'${T.sheetUsers}'!${colLetter(col)}${firstData}:${colLetter(col)}${lastData}`;
  const kpis: { label: string; value: ExcelJS.CellValue; fmt?: string }[] = [
    { label: T.kStudents, value: { formula: `COUNTIF(${U(4)},"${T.student}")`, result: input.totals.students } },
    { label: T.kTeachers, value: { formula: `COUNTIF(${U(4)},"${T.teacher}")`, result: input.totals.teachers } },
    { label: T.kWatch, value: { formula: `SUM(${U(7)})`, result: input.totals.watchedSeconds / 86400 }, fmt: TIME_FORMAT },
    { label: T.kWsDone, value: { formula: `SUM(${U(10)})`, result: input.totals.worksheetsDone } },
    { label: T.kWsPrinted, value: { formula: `SUM(${U(11)})`, result: input.totals.worksheetsPrinted } },
    { label: T.kVideos, value: { formula: `SUM(${U(12)})`, result: input.totals.videosUploaded } },
    { label: T.kQuizzes, value: input.quizzesSolved },
    { label: T.kViews, value: input.pageViews30d },
  ];
  kpis.forEach((k, i) => {
    const row = summary.getRow(5 + i);
    row.getCell(1).value = k.label;
    row.getCell(2).value = k.value;
    styleBodyRow(row, i, 2, new Set([1]), textAlign);
    row.height = 26;
    row.getCell(2).font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLOR.brandDark } };
    if (k.fmt) row.getCell(2).numFmt = k.fmt;
  });
  pageSetup(summary, 4);
  summary.pageSetup.orientation = 'portrait';

  // ------------------------------------------------------------------ Monthly sheet
  const monthly = wb.addWorksheet(T.sheetMonthly, { properties: { tabColor: tab }, views: view({ state: 'frozen', xSplit: 3, ySplit: 4 }) });
  const MC = 4 + input.months.length + 1;
  monthly.getColumn(1).width = 6;
  monthly.getColumn(2).width = 26;
  monthly.getColumn(3).width = 20;
  monthly.getColumn(4).width = 11;
  input.months.forEach((_, i) => (monthly.getColumn(5 + i).width = 13));
  monthly.getColumn(MC).width = 15;
  styleTitleBlock(monthly, MC, `${T.brand} — ${T.sheetMonthly}`, subtitle);
  [T.colNo, T.colName, T.colUsername, T.colRole, ...input.months, T.colTotal].forEach((h, i) => (monthly.getCell(4, i + 1).value = h));
  styleHeaderRow(monthly, 4, MC);
  input.monthlyUsers.forEach((u, i) => {
    const row = monthly.getRow(5 + i);
    row.values = [i + 1, u.displayName, u.username, roleLabel(u.role), ...u.monthly.map((s) => s / 86400)];
    const first = colLetter(5);
    const last = colLetter(4 + input.months.length);
    row.getCell(MC).value = { formula: `SUM(${first}${5 + i}:${last}${5 + i})`, result: u.monthly.reduce((a, b) => a + b, 0) / 86400 };
    styleBodyRow(row, i, MC, new Set([2, 3]), textAlign);
    for (let c = 5; c <= MC; c++) row.getCell(c).numFmt = TIME_FORMAT;
    row.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLOR.muted } };
    row.getCell(MC).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.brandDark } };
  });
  const mLast = 5 + Math.max(input.monthlyUsers.length, 1) - 1;
  const mTotals = monthly.getRow(mLast + 1);
  mTotals.getCell(2).value = T.totals;
  for (let c = 5; c <= MC; c++) {
    const L = colLetter(c);
    const monthIndex = c - 5;
    const sum = c === MC ? input.monthlyUsers.reduce((s, u) => s + u.monthly.reduce((a, b) => a + b, 0), 0) : input.monthlyUsers.reduce((s, u) => s + u.monthly[monthIndex], 0);
    mTotals.getCell(c).value = { formula: `SUM(${L}5:${L}${mLast})`, result: sum / 86400 };
    mTotals.getCell(c).numFmt = TIME_FORMAT;
  }
  styleTotalsRow(mTotals, MC);
  monthly.autoFilter = { from: { row: 4, column: 1 }, to: { row: mLast, column: MC } };
  pageSetup(monthly, 4);

  // ------------------------------------------------------------------ lock everything
  const password = process.env.REPORT_PROTECT_PASSWORD || crypto.randomBytes(18).toString('base64url');
  for (const ws of wb.worksheets) {
    await ws.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      autoFilter: true,
      sort: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      pivotTables: false,
    });
  }

  // Also lock the workbook STRUCTURE (no deleting, renaming, hiding or adding sheets). exceljs has no API
  // for it, so the <workbookProtection> element is added to workbook.xml directly (the schema puts it
  // after <workbookPr> and before <bookViews>/<sheets>). No password: the cell protection above is what
  // carries the password.
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
  const workbookXml = await zip.file('xl/workbook.xml')!.async('string');
  const anchor = workbookXml.includes('<bookViews') ? '<bookViews' : '<sheets>';
  if (!workbookXml.includes(anchor)) throw new Error('unexpected workbook.xml layout');
  zip.file('xl/workbook.xml', workbookXml.replace(anchor, () => `<workbookProtection lockStructure="1"/>${anchor}`));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const stamp = now.toISOString().slice(0, 10);
  return { buffer, filename: `Anees-Report-${stamp}.xlsx` };
}
