import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { MonthlyUser, PageViewRow, ReportRow } from './reportData.js';

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
    sheetStudents: 'الطلاب',
    sheetTeachers: 'المعلمون',
    sheetPages: 'أكثر الصفحات زيارة',
    sheetMonthly: 'الوقت الشهري',
    indicator: 'المؤشر',
    value: 'القيمة',
    kStudents: 'عدد الطلاب',
    kTeachers: 'عدد المعلمين',
    kStudentWatch: 'وقت مشاهدة الطلاب',
    kTeacherWatch: 'وقت مشاهدة المعلمين',
    kStudentWs: 'أوراق العمل المنجزة (الطلاب)',
    kTeacherWs: 'أوراق العمل المنجزة (المعلمون)',
    kWsPrinted: 'أوراق العمل المطبوعة (المعلمون)',
    kVideos: 'الفيديوهات المرفوعة (المعلمون)',
    kQuizzes: 'الاختبارات المحلولة',
    kViews: 'مشاهدات الصفحات (آخر 30 يومًا)',
    colNo: '#',
    colName: 'الاسم',
    colUsername: 'اسم المستخدم',
    colRole: 'الدور',
    colGrade: 'الصف',
    colSubject: 'المادة',
    colPage: 'الصفحة',
    colPath: 'المسار',
    colViews30: 'الزيارات (آخر 30 يومًا)',
    colShare: 'النسبة',
    colViewsTotal: 'إجمالي الزيارات',
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
    pages: {
      '/': 'الصفحة الرئيسية',
      '/login': 'تسجيل الدخول',
      '/signup': 'إنشاء حساب',
      '/verify-email': 'تفعيل البريد الإلكتروني',
      '/privacy': 'سياسة الخصوصية',
      '/terms': 'الشروط والأحكام',
      '/cookies': 'سياسة ملفات الكوكيز',
      '/reels': 'الدروس (الفيديوهات)',
      '/map': 'خريطة المغامرة',
      '/craft': 'عالم الكرافت',
      '/worksheets': 'أوراق العمل',
      '/leaderboard': 'لوحة المتصدرين',
      '/friends': 'الأصدقاء',
      '/profile': 'الملف الشخصي',
      '/profile/:username': 'ملف مستخدم آخر',
      '/teacher/reels': 'فيديوهات المعلم',
      '/admin/users': 'الإدارة: المستخدمون',
      '/admin/videos': 'الإدارة: الفيديوهات',
      '/admin/reports': 'الإدارة: التقارير',
      '/admin/certificates': 'الإدارة: الشهادات',
      '/404': 'صفحة غير موجودة',
    } as Record<string, string>,
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
    sheetStudents: 'Students',
    sheetTeachers: 'Teachers',
    sheetPages: 'Most-visited pages',
    sheetMonthly: 'Monthly watch time',
    indicator: 'Indicator',
    value: 'Value',
    kStudents: 'Students',
    kTeachers: 'Teachers',
    kStudentWatch: 'Student watch time',
    kTeacherWatch: 'Teacher watch time',
    kStudentWs: 'Worksheets completed (students)',
    kTeacherWs: 'Worksheets completed (teachers)',
    kWsPrinted: 'Worksheets printed (teachers)',
    kVideos: 'Videos uploaded (teachers)',
    kQuizzes: 'Quizzes solved',
    kViews: 'Page views (last 30 days)',
    colNo: '#',
    colName: 'Name',
    colUsername: 'Username',
    colRole: 'Role',
    colGrade: 'Grade',
    colSubject: 'Subject',
    colPage: 'Page',
    colPath: 'Path',
    colViews30: 'Views (last 30 days)',
    colShare: 'Share',
    colViewsTotal: 'All-time views',
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
    pages: {
      '/': 'Home',
      '/login': 'Log in',
      '/signup': 'Sign up',
      '/verify-email': 'Email verification',
      '/privacy': 'Privacy policy',
      '/terms': 'Terms',
      '/cookies': 'Cookie policy',
      '/reels': 'Lessons (videos)',
      '/map': 'Adventure map',
      '/craft': 'Craft world',
      '/worksheets': 'Worksheets',
      '/leaderboard': 'Leaderboard',
      '/friends': 'Friends',
      '/profile': 'Profile',
      '/profile/:username': "Another user's profile",
      '/teacher/reels': 'Teacher videos',
      '/admin/users': 'Admin: Users',
      '/admin/videos': 'Admin: Videos',
      '/admin/reports': 'Admin: Reports',
      '/admin/certificates': 'Admin: Certificates',
      '/404': 'Page not found',
    } as Record<string, string>,
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
  /** Grade filter -- applies to the students only; teachers have no grade. */
  grade: number | null;
  studentRows: ReportRow[];
  teacherRows: ReportRow[];
  pages: PageViewRow[];
  months: string[];
  monthlyUsers: MonthlyUser[];
  quizzesSolved: number;
  pageViews30d: number;
};

type UserCol = {
  key: string;
  header: string;
  width: number;
  /** Left/right aligned text instead of centred numbers. */
  text?: boolean;
  fmt?: string;
  value: (r: ReportRow, i: number) => ExcelJS.CellValue;
  /** Sum this column in the totals row; `time` columns hold fractions of a day. */
  sum?: (r: ReportRow) => number;
};

export async function buildReportWorkbook(input: ReportInput): Promise<{ buffer: Buffer; filename: string }> {
  const T = TEXT[input.lang];
  const rtl = input.lang === 'ar';
  const textAlign: 'left' | 'right' = rtl ? 'right' : 'left';
  const now = new Date();
  const locale = rtl ? 'ar-QA' : 'en-GB';
  const generated = now.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
  const scope = T.scopeAll + (input.grade !== null ? ` — ${T.gradeWord} ${input.grade} (${T.student})` : '');
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
  const frozen = view({ state: 'frozen', xSplit: 3, ySplit: 4 });

  // Tab order: Summary, Students, Teachers, Most-visited pages, Monthly. The Summary is created first but
  // filled in last, because its formulas point into the other sheets.
  const summary = wb.addWorksheet(T.sheetSummary, { properties: { tabColor: { argb: COLOR.gold } }, views: view() });

  // ------------------------------------------------------------------ Students / Teachers sheets
  const joined = (r: ReportRow) => new Date(r.joinedAt.replace(' ', 'T') + 'Z');
  const common = {
    no: { key: 'no', header: T.colNo, width: 6, value: (_r: ReportRow, i: number) => i + 1 } as UserCol,
    name: { key: 'name', header: T.colName, width: 26, text: true, value: (r: ReportRow) => r.displayName } as UserCol,
    username: { key: 'username', header: T.colUsername, width: 20, text: true, value: (r: ReportRow) => r.username } as UserCol,
    school: { key: 'school', header: T.colSchool, width: 26, text: true, value: (r: ReportRow) => r.schoolName ?? '' } as UserCol,
    watch: { key: 'watch', header: T.colWatch, width: 15, fmt: TIME_FORMAT, value: (r: ReportRow) => r.watchedSeconds / 86400, sum: (r: ReportRow) => r.watchedSeconds / 86400 } as UserCol,
    reels: { key: 'reels', header: T.colReels, width: 13, value: (r: ReportRow) => r.reelsWatched, sum: (r: ReportRow) => r.reelsWatched } as UserCol,
    watchPts: { key: 'watchPts', header: T.colWatchPts, width: 13, value: (r: ReportRow) => r.watchPoints, sum: (r: ReportRow) => r.watchPoints } as UserCol,
    wsDone: { key: 'wsDone', header: T.colWsDone, width: 15, value: (r: ReportRow) => r.worksheetsDone, sum: (r: ReportRow) => r.worksheetsDone } as UserCol,
    points: { key: 'points', header: T.colPoints, width: 13, value: (r: ReportRow) => r.points, sum: (r: ReportRow) => r.points } as UserCol,
    joined: { key: 'joined', header: T.colJoined, width: 14, fmt: 'yyyy-mm-dd', value: joined } as UserCol,
  };
  const studentCols: UserCol[] = [
    common.no, common.name, common.username,
    { key: 'grade', header: T.colGrade, width: 12, value: (r) => (r.grade !== null ? `${T.gradeWord} ${r.grade}` : '') },
    common.school, common.watch, common.reels, common.watchPts, common.wsDone, common.points, common.joined,
  ];
  const teacherCols: UserCol[] = [
    common.no, common.name, common.username,
    { key: 'subject', header: T.colSubject, width: 22, text: true, value: (r) => (r.teacherSubject ? T.subjects[r.teacherSubject] ?? r.teacherSubject : '') },
    common.school, common.watch, common.reels, common.watchPts, common.wsDone,
    { key: 'wsPrinted', header: T.colWsPrinted, width: 15, value: (r) => r.worksheetsPrinted, sum: (r) => r.worksheetsPrinted },
    { key: 'videos', header: T.colVideos, width: 13, value: (r) => r.videosUploaded, sum: (r) => r.videosUploaded },
    { key: 'uploaded', header: T.colUploaded, width: 17, fmt: TIME_FORMAT, value: (r) => r.uploadedSeconds / 86400, sum: (r) => r.uploadedSeconds / 86400 },
    common.points, common.joined,
  ];

  function addUserSheet(name: string, title: string, rows: ReportRow[], cols: UserCol[]) {
    const ws = wb.addWorksheet(name, { properties: { tabColor: tab }, views: frozen });
    const lastCol = cols.length;
    cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
    styleTitleBlock(ws, lastCol, `${T.brand} — ${title}`, subtitle);
    cols.forEach((c, i) => (ws.getCell(4, i + 1).value = c.header));
    styleHeaderRow(ws, 4, lastCol);

    const first = 5;
    const textCols = new Set(cols.map((c, i) => (c.text ? i + 1 : 0)).filter(Boolean));
    rows.forEach((r, i) => {
      const row = ws.getRow(first + i);
      row.values = cols.map((c) => c.value(r, i));
      styleBodyRow(row, i, lastCol, textCols, textAlign);
      cols.forEach((c, ci) => c.fmt && (row.getCell(ci + 1).numFmt = c.fmt));
      row.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLOR.muted } };
    });
    const last = first + Math.max(rows.length, 1) - 1;
    const totalRow = ws.getRow(last + 1);
    totalRow.getCell(2).value = T.totals;
    cols.forEach((c, ci) => {
      if (!c.sum) return;
      const L = colLetter(ci + 1);
      const cell = totalRow.getCell(ci + 1);
      cell.value = { formula: `SUM(${L}${first}:${L}${last})`, result: rows.reduce((s, r) => s + c.sum!(r), 0) };
      if (c.fmt) cell.numFmt = c.fmt;
    });
    styleTotalsRow(totalRow, lastCol);
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: lastCol } };
    pageSetup(ws, 4);
    /** Absolute range of one column's data rows, for formulas on other sheets. */
    const range = (key: string) => {
      const L = colLetter(cols.findIndex((c) => c.key === key) + 1);
      return `'${name}'!${L}${first}:${L}${last}`;
    };
    return { range };
  }

  const students = addUserSheet(T.sheetStudents, T.sheetStudents, input.studentRows, studentCols);
  const teachers = addUserSheet(T.sheetTeachers, T.sheetTeachers, input.teacherRows, teacherCols);

  // ------------------------------------------------------------------ Most-visited pages sheet
  const pagesWs = wb.addWorksheet(T.sheetPages, { properties: { tabColor: tab }, views: view({ state: 'frozen', xSplit: 0, ySplit: 4 }) });
  const PC = 6;
  [6, 30, 26, 16, 12, 16].forEach((w, i) => (pagesWs.getColumn(i + 1).width = w));
  styleTitleBlock(pagesWs, PC, `${T.brand} — ${T.sheetPages}`, subtitle);
  [T.colNo, T.colPage, T.colPath, T.colViews30, T.colShare, T.colViewsTotal].forEach((h, i) => (pagesWs.getCell(4, i + 1).value = h));
  styleHeaderRow(pagesWs, 4, PC);
  const pFirst = 5;
  const pLast = pFirst + Math.max(input.pages.length, 1) - 1;
  const pTotalNo = pLast + 1;
  const views30Total = input.pages.reduce((s, p) => s + p.views30d, 0);
  input.pages.forEach((p, i) => {
    const row = pagesWs.getRow(pFirst + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = T.pages[p.path] ?? p.path;
    row.getCell(3).value = p.path;
    row.getCell(4).value = p.views30d;
    row.getCell(5).value = { formula: `IF($D$${pTotalNo}=0,0,D${pFirst + i}/$D$${pTotalNo})`, result: views30Total === 0 ? 0 : p.views30d / views30Total };
    row.getCell(6).value = p.viewsTotal;
    styleBodyRow(row, i, PC, new Set([2, 3]), textAlign);
    row.getCell(5).numFmt = '0.0%';
    row.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLOR.muted } };
    // Paths are always left-to-right, even in the Arabic sheet.
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
  });
  const pTotals = pagesWs.getRow(pTotalNo);
  pTotals.getCell(2).value = T.totals;
  pTotals.getCell(4).value = { formula: `SUM(D${pFirst}:D${pLast})`, result: views30Total };
  pTotals.getCell(6).value = { formula: `SUM(F${pFirst}:F${pLast})`, result: input.pages.reduce((s, p) => s + p.viewsTotal, 0) };
  styleTotalsRow(pTotals, PC);
  pagesWs.autoFilter = { from: { row: 4, column: 1 }, to: { row: pLast, column: PC } };
  pageSetup(pagesWs, 4);
  pagesWs.pageSetup.orientation = 'portrait';

  // ------------------------------------------------------------------ Summary sheet
  summary.getColumn(1).width = 44;
  summary.getColumn(2).width = 22;
  styleTitleBlock(summary, 2, `${T.brand} — ${T.title}`, subtitle);
  summary.getCell(4, 1).value = T.indicator;
  summary.getCell(4, 2).value = T.value;
  styleHeaderRow(summary, 4, 2);
  const sum = (rows: ReportRow[], f: (r: ReportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const sRows = input.studentRows;
  const tRows = input.teacherRows;
  const kpis: { label: string; value: ExcelJS.CellValue; fmt?: string }[] = [
    { label: T.kStudents, value: { formula: `COUNTA(${students.range('name')})`, result: sRows.length } },
    { label: T.kTeachers, value: { formula: `COUNTA(${teachers.range('name')})`, result: tRows.length } },
    { label: T.kStudentWatch, value: { formula: `SUM(${students.range('watch')})`, result: sum(sRows, (r) => r.watchedSeconds) / 86400 }, fmt: TIME_FORMAT },
    { label: T.kTeacherWatch, value: { formula: `SUM(${teachers.range('watch')})`, result: sum(tRows, (r) => r.watchedSeconds) / 86400 }, fmt: TIME_FORMAT },
    { label: T.kStudentWs, value: { formula: `SUM(${students.range('wsDone')})`, result: sum(sRows, (r) => r.worksheetsDone) } },
    { label: T.kTeacherWs, value: { formula: `SUM(${teachers.range('wsDone')})`, result: sum(tRows, (r) => r.worksheetsDone) } },
    { label: T.kWsPrinted, value: { formula: `SUM(${teachers.range('wsPrinted')})`, result: sum(tRows, (r) => r.worksheetsPrinted) } },
    { label: T.kVideos, value: { formula: `SUM(${teachers.range('videos')})`, result: sum(tRows, (r) => r.videosUploaded) } },
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
  const monthly = wb.addWorksheet(T.sheetMonthly, { properties: { tabColor: tab }, views: frozen });
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
    const total = c === MC ? input.monthlyUsers.reduce((s, u) => s + u.monthly.reduce((a, b) => a + b, 0), 0) : input.monthlyUsers.reduce((s, u) => s + u.monthly[monthIndex], 0);
    mTotals.getCell(c).value = { formula: `SUM(${L}5:${L}${mLast})`, result: total / 86400 };
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
