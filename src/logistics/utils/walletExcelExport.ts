import { format } from 'date-fns';
import { ExpenseCategory, TopUpRecord, Expense, User, Vehicle } from '../types';
import { resolveExpenseVehicle } from './vehicleDetection';
import {
  AccountingLedgerResult,
  formatAsOfDateUTC8,
  formatDateTimeUTC8,
  round2,
  toDateKeyUTC8,
} from './walletLedger';

export interface ExpenseAttributionInfo {
  isUnassigned: boolean;
  isStudentTask: boolean;
  taskTitle: string;
  studentName: string;
  passportNumber: string;
  studentPackage: string;
  counselorName: string;
}

export type AuditExportItem =
  | (TopUpRecord & { type: 'topup' })
  | (Expense & { type: 'expense' });

export interface BuildWalletAuditWorkbookParams {
  ledger: AccountingLedgerResult<AuditExportItem>;
  users: User[];
  fieldOfficers: User[];
  vehicles: Vehicle[];
  topups: TopUpRecord[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  fromDate: string;
  toDate: string;
  selectedOfficerId: string;
  typeFilter: 'all' | 'expense' | 'topup';
  selectedCategory: string;
  settlementFilter?: 'all' | 'settled' | 'unsettled';
  currentUserName?: string;
  currentUserRole?: string;
  totalOfficersBalance: number;
  resolveExpenseAttribution: (taskId?: string | null) => ExpenseAttributionInfo;
  exportDate?: Date;
}

const CURRENCY_NUM_FMT = '#,##0.00';

function numCell(XLSX: any, value: number, formula?: string) {
  const cell: Record<string, any> = {
    t: 'n',
    v: round2(value),
    z: CURRENCY_NUM_FMT,
  };
  if (formula) {
    cell.f = formula;
  }
  return cell;
}

export function buildWalletAuditWorkbook(
  XLSX: any,
  params: BuildWalletAuditWorkbookParams
) {
  const {
    ledger,
    users,
    fieldOfficers,
    vehicles,
    topups,
    expenses,
    expenseCategories,
    fromDate,
    toDate,
    selectedOfficerId,
    typeFilter,
    selectedCategory,
    settlementFilter = 'all',
    currentUserName = 'Auditor',
    currentUserRole = 'accountant',
    totalOfficersBalance,
    resolveExpenseAttribution,
    exportDate = new Date(),
  } = params;

  const startLabel = fromDate || 'All_Start';
  const endLabel = toDate || format(exportDate, 'yyyy-MM-dd');
  const displayRange = fromDate || toDate
    ? `${fromDate || 'Beginning'} to ${toDate || 'Present'}`
    : 'All Time (Full Historical Ledger)';

  const officerLabel = selectedOfficerId === 'all'
    ? 'All Field Officers'
    : (users.find(u => u.id === selectedOfficerId)?.name || selectedOfficerId);

  const exportedExpenses = ledger.rows
    .filter((r): r is typeof r & { item: Extract<AuditExportItem, { type: 'expense' }> } => r.item.type === 'expense')
    .map(r => r.item);

  const settledCount = ledger.rows.filter(r => Boolean(r.item.isSettled)).length;
  const unsettledCount = ledger.rows.length - settledCount;

  // -------------------------------------------------------------------------
  // SHEET 1: Summary
  // -------------------------------------------------------------------------
  const summaryRows: any[][] = [
    ['PIONEER-4SS LOGISTICS - WALLET & FINANCIAL AUDIT SUMMARY'],
    [],
    ['Audit Parameter', 'Value'],
    ['Selected Date Range', displayRange],
    ['Filtered Field Officer', officerLabel],
    ['Transaction Type Filter', typeFilter === 'all' ? 'All Transactions' : typeFilter === 'expense' ? 'Expenses Only' : 'Top-Ups Only'],
    ['Expense Category Filter', selectedCategory === 'all' ? 'All Categories' : selectedCategory],
    ['Settlement Filter', settlementFilter === 'all' ? 'All Records' : settlementFilter === 'settled' ? 'Settled Only' : 'Unsettled Only'],
    ['Ledger Sort Order', 'Chronological Ascending (Oldest to Newest)'],
    ['Exported By', `${currentUserName} (${currentUserRole})`],
    ['Export Timestamp (UTC+8)', formatDateTimeUTC8(exportDate.toISOString())],
    [],
    ['PERIOD FINANCIAL KPI SUMMARY', 'Amount (RM)'],
  ];

  if (ledger.hasOpeningBalanceRow) {
    summaryRows.push(['Opening Balance Brought Forward (RM)', numCell(XLSX, ledger.openingBalance)]);
  }
  summaryRows.push(
    ['Total Top-Ups / Debit (RM)', numCell(XLSX, ledger.totalDebit)],
    ['Total Expenses / Credit (RM)', numCell(XLSX, ledger.totalCredit)],
    ['Net Period Change (Debit - Credit) (RM)', numCell(XLSX, ledger.netChange)],
    ['Ending Ledger Balance (RM)', numCell(XLSX, ledger.endingBalance)],
    ['Current Total Active Float Across All Officers (RM)', numCell(XLSX, totalOfficersBalance)],
    ['Settled Ledger Records', settledCount],
    ['Unsettled Ledger Records', unsettledCount],
    [],
    ['EXPENSE CATEGORY BREAKDOWN', 'Transactions Count', 'Total Spend / Credit (RM)', '% of Period Spend'],
  );

  expenseCategories.forEach(cat => {
    const catItems = exportedExpenses.filter(e => e.category === cat);
    const catSum = round2(catItems.reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const pct = ledger.totalCredit > 0 ? `${((catSum / ledger.totalCredit) * 100).toFixed(1)}%` : '0.0%';
    summaryRows.push([
      cat,
      catItems.length,
      numCell(XLSX, catSum),
      pct,
    ]);
  });

  summaryRows.push([
    'TOTAL VERIFIED EXPENSES (CREDIT)',
    exportedExpenses.length,
    numCell(XLSX, ledger.totalCredit),
    ledger.totalCredit > 0 ? '100.0%' : '0.0%',
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 48 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
  ];

  // -------------------------------------------------------------------------
  // SHEET 2: Transactions_Ledger (Accounting Debit / Credit / Balance Format)
  // -------------------------------------------------------------------------
  const ledgerHeaders = [
    'Date & Time (UTC+8)',
    'Transaction ID',
    'Type (Top-Up / Expense)',
    'Field Officer Name',
    'Category / Source',
    'Notes / Memo',
    'Debit (RM)',
    'Credit (RM)',
    'Balance (RM)',
    'Vehicle',
    'Linked Task Type',
    'Student Full Name',
    'Student Counselor',
    'Student Passport Number',
    'Student Package (Free / 300$ / 500$ / 300$(Free))',
    'GPS Coordinates',
    'Receipt Photo URL',
    'Settlement Status',
    'Settled By',
    'Settled At (UTC+8)',
  ];

  const ledgerAoa: any[][] = [
    ['PIONEER-4SS LOGISTICS - TRANSACTIONS LEDGER'],
    [`As of ${formatAsOfDateUTC8(exportDate)}`, '', `Period: ${displayRange}`, '', `Officer: ${officerLabel}`],
    [],
    ledgerHeaders,
  ];

  const openingExcelRow = ledger.hasOpeningBalanceRow ? 5 : null;
  if (ledger.hasOpeningBalanceRow) {
    ledgerAoa.push([
      `Before ${fromDate}`,
      '-',
      'Opening Balance',
      officerLabel,
      'Brought Forward',
      `Opening balance prior to ${fromDate}`,
      null,
      null,
      numCell(XLSX, ledger.openingBalance),
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ]);
  }

  const firstTxExcelRow = ledger.hasOpeningBalanceRow ? 6 : 5;

  ledger.rows.forEach((row, idx) => {
    const item = row.item;
    const excelRow = firstTxExcelRow + idx;
    const officer = users.find(u => u.id === item.userId);
    const balanceFormula = (!ledger.hasOpeningBalanceRow && idx === 0)
      ? `G${excelRow}-H${excelRow}`
      : `I${excelRow - 1}+G${excelRow}-H${excelRow}`;
    const settlementStatusLabel = item.isSettled ? 'Settled' : 'Unsettled';
    const settledByLabel = item.isSettled ? (item.settledByName || item.settledBy || '-') : '-';
    const settledAtLabel = item.isSettled && item.settledAt ? formatDateTimeUTC8(item.settledAt) : '-';

    if (item.type === 'topup') {
      ledgerAoa.push([
        formatDateTimeUTC8(item.timestamp || item.createdAt),
        item.id,
        'Top-Up',
        officer?.name || 'Unknown Officer',
        item.source || 'Office Petty Cash',
        item.notes || '-',
        numCell(XLSX, row.debit ?? 0),
        null,
        numCell(XLSX, row.balance, balanceFormula),
        '-',
        'N/A (Float Top-Up)',
        '-',
        '-',
        '-',
        '-',
        '-',
        'Not Required',
        settlementStatusLabel,
        settledByLabel,
        settledAtLabel,
      ]);
    } else {
      const attr = resolveExpenseAttribution(item.taskId);
      const veh = resolveExpenseVehicle(item, vehicles);
      ledgerAoa.push([
        formatDateTimeUTC8(item.timestamp || item.createdAt),
        item.id,
        'Expense',
        officer?.name || 'Unknown Officer',
        item.category,
        item.notes || '-',
        null,
        numCell(XLSX, row.credit ?? 0),
        numCell(XLSX, row.balance, balanceFormula),
        veh?.label || '-',
        attr.taskTitle,
        attr.studentName,
        attr.counselorName,
        attr.passportNumber,
        attr.studentPackage,
        item.location || '-',
        item.receiptUrl || '-',
        settlementStatusLabel,
        settledByLabel,
        settledAtLabel,
      ]);
    }
  });

  const lastTxExcelRow = firstTxExcelRow + ledger.rows.length - 1;
  const totalExcelRow = firstTxExcelRow + ledger.rows.length;

  const totalDebitCell = ledger.rows.length > 0
    ? numCell(XLSX, ledger.totalDebit, `SUM(G${firstTxExcelRow}:G${lastTxExcelRow})`)
    : numCell(XLSX, 0);

  const totalCreditCell = ledger.rows.length > 0
    ? numCell(XLSX, ledger.totalCredit, `SUM(H${firstTxExcelRow}:H${lastTxExcelRow})`)
    : numCell(XLSX, 0);

  const totalBalanceFormula = openingExcelRow !== null
    ? `I${openingExcelRow}+G${totalExcelRow}-H${totalExcelRow}`
    : `G${totalExcelRow}-H${totalExcelRow}`;

  const totalBalanceCell = numCell(XLSX, ledger.endingBalance, totalBalanceFormula);

  ledgerAoa.push([
    'TOTAL',
    '',
    `${ledger.rows.length} ${ledger.rows.length === 1 ? 'transaction' : 'transactions'}`,
    '',
    '',
    '',
    totalDebitCell,
    totalCreditCell,
    totalBalanceCell,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `${settledCount}/${ledger.rows.length} Settled`,
    '',
    '',
  ]);

  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerAoa);
  wsLedger['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
  ];
  wsLedger['!cols'] = [
    { wch: 22 }, // Date & Time (UTC+8)
    { wch: 24 }, // Transaction ID
    { wch: 20 }, // Type (Top-Up / Expense)
    { wch: 22 }, // Field Officer Name
    { wch: 20 }, // Category / Source
    { wch: 32 }, // Notes / Memo
    { wch: 16 }, // Debit (RM)
    { wch: 16 }, // Credit (RM)
    { wch: 16 }, // Balance (RM)
    { wch: 24 }, // Vehicle
    { wch: 26 }, // Linked Task Type
    { wch: 24 }, // Student Full Name
    { wch: 22 }, // Student Counselor
    { wch: 22 }, // Student Passport Number
    { wch: 26 }, // Student Package
    { wch: 26 }, // GPS Coordinates
    { wch: 55 }, // Receipt Photo URL
    { wch: 18 }, // Settlement Status
    { wch: 22 }, // Settled By
    { wch: 22 }, // Settled At (UTC+8)
  ];

  // -------------------------------------------------------------------------
  // SHEET 3: Officer_Balances
  // -------------------------------------------------------------------------
  const isWithinPeriod = (timestamp?: string, createdAt?: string): boolean => {
    if (!fromDate && !toDate) return true;
    const txDate = toDateKeyUTC8(timestamp || createdAt);
    if (!txDate) return false;
    if (fromDate && txDate < fromDate) return false;
    if (toDate && txDate > toDate) return false;
    return true;
  };

  const officerHeaders = [
    'Officer Name',
    'Username',
    'Total Top-Ups / Debit in Period (RM)',
    'Total Spent / Credit in Period (RM)',
    'Period Net Change (RM)',
    'Current Wallet Balance (RM)',
  ];

  const officerAoa: any[][] = [officerHeaders];
  let sumOfficerTopUps = 0;
  let sumOfficerSpent = 0;
  let sumOfficerWallet = 0;

  fieldOfficers.forEach((officer, idx) => {
    const excelRow = idx + 2;
    const officerPeriodTopUps = round2(
      topups
        .filter(t => t.userId === officer.id && isWithinPeriod(t.timestamp, t.createdAt))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    );

    const officerPeriodSpent = round2(
      expenses
        .filter(e => e.userId === officer.id && isWithinPeriod(e.timestamp, e.createdAt))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );

    const officerNet = round2(officerPeriodTopUps - officerPeriodSpent);
    const officerWallet = round2(officer.walletBalance ?? 0);

    sumOfficerTopUps = round2(sumOfficerTopUps + officerPeriodTopUps);
    sumOfficerSpent = round2(sumOfficerSpent + officerPeriodSpent);
    sumOfficerWallet = round2(sumOfficerWallet + officerWallet);

    officerAoa.push([
      officer.name,
      officer.username || officer.id,
      numCell(XLSX, officerPeriodTopUps),
      numCell(XLSX, officerPeriodSpent),
      numCell(XLSX, officerNet, `C${excelRow}-D${excelRow}`),
      numCell(XLSX, officerWallet),
    ]);
  });

  if (fieldOfficers.length > 0) {
    const lastOfficerRow = fieldOfficers.length + 1;
    officerAoa.push([
      'TOTAL',
      `${fieldOfficers.length} Officers`,
      numCell(XLSX, sumOfficerTopUps, `SUM(C2:C${lastOfficerRow})`),
      numCell(XLSX, sumOfficerSpent, `SUM(D2:D${lastOfficerRow})`),
      numCell(XLSX, round2(sumOfficerTopUps - sumOfficerSpent), `SUM(E2:E${lastOfficerRow})`),
      numCell(XLSX, sumOfficerWallet, `SUM(F2:F${lastOfficerRow})`),
    ]);
  } else {
    officerAoa.push([
      'TOTAL',
      '0 Officers',
      numCell(XLSX, 0),
      numCell(XLSX, 0),
      numCell(XLSX, 0),
      numCell(XLSX, 0),
    ]);
  }

  const wsOfficers = XLSX.utils.aoa_to_sheet(officerAoa);
  wsOfficers['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 34 },
    { wch: 32 },
    { wch: 24 },
    { wch: 28 },
  ];

  // -------------------------------------------------------------------------
  // Assemble Workbook
  // -------------------------------------------------------------------------
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(workbook, wsLedger, 'Transactions_Ledger');
  XLSX.utils.book_append_sheet(workbook, wsOfficers, 'Officer_Balances');

  const fileName = `Pioneer_Wallet_Audit_${startLabel}_to_${endLabel}.xlsx`;
  return { workbook, fileName };
}
