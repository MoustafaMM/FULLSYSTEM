// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  History, Wallet, Receipt, ArrowUpRight, ArrowDownRight, ArrowLeft,
  Search, Filter, MapPin, ExternalLink, X, AlertTriangle,
  User, ShieldCheck, Download, Eye, Fuel, Car, Smartphone,
  HeartPulse, ParkingCircle, MoreHorizontal, Utensils, Hotel,
  FileSpreadsheet, TrendingUp, Sparkles, Gauge, CheckCircle2, RotateCcw,
  ArrowUpDown, LayoutGrid, Table2, Clock, Loader2, CheckSquare, Square
} from 'lucide-react';
import { cn } from '../components/layout/Layout';
import { Expense, ExpenseCategory } from '../types';
import { formatCurrency, formatAmountWithSign } from '../utils/currency';
import { resolveExpenseVehicle } from '../utils/vehicleDetection';
import {
  buildAccountingLedger,
  formatAccountingNumber,
  formatDateTimeUTC8,
  round2,
  toDateKeyUTC8,
} from '../utils/walletLedger';
import { AuditExportItem, buildWalletAuditWorkbook } from '../utils/walletExcelExport';
import { getRangeKeys, walletRecordKey, WalletRecordRef } from '../utils/walletSettlement';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskStatusBadgeClasses,
  getTaskSubjectName,
} from '../utils/taskClassification';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths
} from 'date-fns';
import DatePicker from '../components/DatePicker';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Fuel',
  'Tolls',
  'SIM Card',
  'Medical Fees',
  'Parking',
  'Meals',
  'Hotel',
  'Other',
];

const categoryIcons: Record<ExpenseCategory, React.ElementType> = {
  'Tolls': Car,
  'Fuel': Fuel,
  'SIM Card': Smartphone,
  'Medical Fees': HeartPulse,
  'Parking': ParkingCircle,
  'Meals': Utensils,
  'Hotel': Hotel,
  'Other': MoreHorizontal,
};

const categoryColors: Record<ExpenseCategory, string> = {
  'Tolls': 'bg-blue-50 text-blue-700 border-blue-200',
  'Fuel': 'bg-amber-50 text-amber-700 border-amber-200',
  'SIM Card': 'bg-purple-50 text-purple-700 border-purple-200',
  'Medical Fees': 'bg-rose-50 text-rose-700 border-rose-200',
  'Parking': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Meals': 'bg-orange-50 text-orange-700 border-orange-200',
  'Hotel': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Other': 'bg-slate-50 text-slate-700 border-slate-200',
};

type DatePresetKey = 'today' | 'this_week' | 'this_month' | 'last_month' | 'all_time' | 'custom';

type AuditLedgerItem = AuditExportItem;

export default function WalletHistoryAudit() {
  const {
    currentUser,
    users,
    tasks,
    presets,
    students,
    expenses,
    topups,
    vehicles,
    vehicleLogs,
    toggleWalletRecordSettled,
    batchToggleWalletRecordsSettled,
    t
  } = useAppContext();

  // Filter Toolbar States
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [activePreset, setActivePreset] = useState<DatePresetKey>('all_time');
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'topup'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [linkedTaskFilter, setLinkedTaskFilter] = useState<'all' | 'task_linked' | 'no_task'>('all');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'settled' | 'unsettled'>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'asc' | 'desc'>('asc');
  const [ledgerDisplayMode, setLedgerDisplayMode] = useState<'table' | 'cards'>('table');
  const [settlingRecordKeys, setSettlingRecordKeys] = useState<Record<string, boolean>>({});
  const [selectedRecordKeys, setSelectedRecordKeys] = useState<Record<string, boolean>>({});
  const [lastClickedRecordKey, setLastClickedRecordKey] = useState<string | null>(null);
  const [isBatchSettling, setIsBatchSettling] = useState(false);
  const lastShiftKeyRef = useRef(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  // Split-View Receipt Audit Lightbox State
  const [viewingReceipt, setViewingReceipt] = useState<Expense | null>(null);

  const isAccountant = currentUser?.role === 'accountant';

  // Access Control: Strictly accessible to Admin, Coordinator, and Accountant
  const isAuthorizedAuditor =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'coordinator' ||
    currentUser?.role === 'accountant';

  if (!isAuthorizedAuditor) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto mt-12">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-xl">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500">
          You do not have the required permissions to view the operations financial audit trail.
        </p>
      </div>
    );
  }

  // Quick Date Preset Handler
  const handleApplyDatePreset = (preset: DatePresetKey) => {
    const now = new Date();
    setActivePreset(preset);

    switch (preset) {
      case 'today': {
        const todayStr = format(now, 'yyyy-MM-dd');
        setFromDate(todayStr);
        setToDate(todayStr);
        break;
      }
      case 'this_week': {
        const start = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const end = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        setFromDate(start);
        setToDate(end);
        break;
      }
      case 'this_month': {
        const start = format(startOfMonth(now), 'yyyy-MM-dd');
        const end = format(endOfMonth(now), 'yyyy-MM-dd');
        setFromDate(start);
        setToDate(end);
        break;
      }
      case 'last_month': {
        const prevMonth = subMonths(now, 1);
        const start = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
        setFromDate(start);
        setToDate(end);
        break;
      }
      case 'all_time':
      default: {
        setFromDate('');
        setToDate('');
        break;
      }
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activePreset !== 'all_time' || fromDate || toDate) count++;
    if (selectedOfficerId !== 'all') count++;
    if (typeFilter !== 'all') count++;
    if (selectedCategory !== 'all') count++;
    if (linkedTaskFilter !== 'all') count++;
    if (settlementFilter !== 'all') count++;
    if (minAmount.trim()) count++;
    if (maxAmount.trim()) count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [activePreset, fromDate, toDate, selectedOfficerId, typeFilter, selectedCategory, linkedTaskFilter, settlementFilter, minAmount, maxAmount, searchTerm]);

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setActivePreset('all_time');
    setSelectedOfficerId('all');
    setTypeFilter('all');
    setSelectedCategory('all');
    setLinkedTaskFilter('all');
    setSettlementFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setSearchTerm('');
  };

  // Field Officers List & Real-Time Active Float
  const fieldOfficers = useMemo(() => users.filter(u => u.role === 'field_officer'), [users]);
  const lowBalanceOfficers = useMemo(() => fieldOfficers.filter(u => (u.walletBalance ?? 0) < 50), [fieldOfficers]);
  const totalOfficersBalance = useMemo(
    () => round2(fieldOfficers.reduce((sum, u) => sum + (Number(u.walletBalance) || 0), 0)),
    [fieldOfficers]
  );

  // Helper: Check if a timestamp falls within [fromDate, toDate]
  const isWithinDateRange = (timestamp?: string, createdAt?: string): boolean => {
    if (!fromDate && !toDate) return true;
    const txDate = toDateKeyUTC8(timestamp || createdAt);
    if (!txDate) return false;
    if (fromDate && txDate < fromDate) return false;
    if (toDate && txDate > toDate) return false;
    return true;
  };

  // Period-filtered Top-Ups & Expenses (respecting Date Range & Officer Filter for Dynamic KPI Cards)
  const periodTopUps = useMemo(() => {
    return topups.filter(item => {
      if (!isWithinDateRange(item.timestamp, item.createdAt)) return false;
      if (selectedOfficerId !== 'all' && item.userId !== selectedOfficerId) return false;
      return true;
    });
  }, [topups, fromDate, toDate, selectedOfficerId]);

  const periodExpenses = useMemo(() => {
    return expenses.filter(item => {
      if (!isWithinDateRange(item.timestamp, item.createdAt)) return false;
      if (selectedOfficerId !== 'all' && item.userId !== selectedOfficerId) return false;
      return true;
    });
  }, [expenses, fromDate, toDate, selectedOfficerId]);

  // Dynamic KPI Metrics
  const periodTotalTopUpsRM = useMemo(
    () => round2(periodTopUps.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)),
    [periodTopUps]
  );

  const periodTotalExpensesRM = useMemo(
    () => round2(periodExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)),
    [periodExpenses]
  );

  // Top Expense Category in Selected Period
  const topExpenseCategoryStat = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const exp of periodExpenses) {
      const cat = exp.category || 'Other';
      totals[cat] = (totals[cat] || 0) + (Number(exp.amount) || 0);
    }
    let topCategory: string | null = null;
    let topAmount = 0;
    for (const [cat, amt] of Object.entries(totals)) {
      if (amt > topAmount) {
        topAmount = amt;
        topCategory = cat;
      }
    }
    const sharePct = periodTotalExpensesRM > 0 ? Math.round((topAmount / periodTotalExpensesRM) * 100) : 0;
    return { category: topCategory, amount: round2(topAmount), sharePct };
  }, [periodExpenses, periodTotalExpensesRM]);

  // Build Unified Audit Ledger
  const allLedgerItems: AuditLedgerItem[] = useMemo(() => {
    return [
      ...topups.map(t => ({ ...t, type: 'topup' as const })),
      ...expenses.map(e => ({ ...e, type: 'expense' as const }))
    ];
  }, [topups, expenses]);

  const hasSubLedgerFilter = useMemo(
    () =>
      typeFilter !== 'all' ||
      selectedCategory !== 'all' ||
      linkedTaskFilter !== 'all' ||
      settlementFilter !== 'all' ||
      minAmount.trim() !== '' ||
      maxAmount.trim() !== '' ||
      searchTerm.trim() !== '',
    [typeFilter, selectedCategory, linkedTaskFilter, settlementFilter, minAmount, maxAmount, searchTerm]
  );

  // Accounting Ledger with Debit (Top-Up), Credit (Expense), Running Balance, and Totals
  const accountingLedger = useMemo(() => {
    return buildAccountingLedger<AuditLedgerItem>({
      entries: allLedgerItems,
      officerId: selectedOfficerId,
      fromDate,
      toDate,
      hasSubLedgerFilter,
      matchesSubFilters: (item) => {
        // 1. Transaction Type Filter
        if (typeFilter !== 'all' && item.type !== typeFilter) return false;

        // 2. Expense Category Filter
        if (selectedCategory !== 'all') {
          if (item.type !== 'expense') return false;
          if (item.category !== selectedCategory) return false;
        }

        // 3. Linked Task Type Filter
        if (linkedTaskFilter !== 'all') {
          if (item.type === 'topup') {
            if (linkedTaskFilter === 'task_linked') return false;
          } else {
            const hasTask = Boolean(item.taskId && item.taskId !== 'unassigned');
            if (linkedTaskFilter === 'task_linked' && !hasTask) return false;
            if (linkedTaskFilter === 'no_task' && hasTask) return false;
          }
        }

        // 4. Settlement Status Filter
        if (settlementFilter !== 'all') {
          const isSettled = Boolean(item.isSettled);
          if (settlementFilter === 'settled' && !isSettled) return false;
          if (settlementFilter === 'unsettled' && isSettled) return false;
        }

        // 5. Amount Range Filter
        if (minAmount.trim() !== '') {
          const minVal = Number(minAmount);
          if (!isNaN(minVal) && Number(item.amount) < minVal) return false;
        }
        if (maxAmount.trim() !== '') {
          const maxVal = Number(maxAmount);
          if (!isNaN(maxVal) && Number(item.amount) > maxVal) return false;
        }

        // 6. Search Query
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const officer = users.find(u => u.id === item.userId);
          const matchesOfficer = officer?.name.toLowerCase().includes(q) || officer?.username?.toLowerCase().includes(q);
          const matchesId = item.id.toLowerCase().includes(q);

          if (item.type === 'topup') {
            const matchesSource = item.source?.toLowerCase().includes(q);
            const matchesNotes = item.notes?.toLowerCase().includes(q);
            return Boolean(matchesOfficer || matchesSource || matchesNotes || matchesId);
          } else {
            const isUnassigned = !item.taskId || item.taskId === 'unassigned';
            const linkedTask = !isUnassigned ? tasks.find(t => t.id === item.taskId) : undefined;
            const student = linkedTask && !linkedTask.isNonStudentTask ? students.find(s => s.id === linkedTask.studentId) : undefined;
            const counselorUser = student ? users.find(u => u.id === student.counselorId || u.id === student.counselor) : undefined;
            const counselorName = counselorUser?.name || student?.counselor || '';
            const pkg = student ? (student.package || student.servicePackage || 'Free') : '';

            const veh = resolveExpenseVehicle(item, vehicles);
            const matchesCategory = item.category.toLowerCase().includes(q);
            const matchesNotes = item.notes?.toLowerCase().includes(q);
            const matchesLoc = item.location?.toLowerCase().includes(q);
            const matchesVeh = veh?.label.toLowerCase().includes(q);
            const matchesStudent = student?.fullName.toLowerCase().includes(q) || student?.passportNumber?.toLowerCase().includes(q);
            const matchesCounselor = counselorName.toLowerCase().includes(q);
            const matchesPkg = pkg.toLowerCase().includes(q);
            const matchesTask = linkedTask
              ? (
                  getTaskDisplayTitle(linkedTask, presets, 'en').toLowerCase().includes(q) ||
                  getTaskSubjectName(linkedTask, students, 'en').toLowerCase().includes(q) ||
                  (linkedTask.nonStudentContact || '').toLowerCase().includes(q)
                )
              : false;
            const matchesGeneral = isUnassigned && ('unassigned / general'.includes(q) || 'general expense'.includes(q));
            return Boolean(
              matchesOfficer ||
              matchesCategory ||
              matchesNotes ||
              matchesLoc ||
              matchesVeh ||
              matchesStudent ||
              matchesCounselor ||
              matchesPkg ||
              matchesTask ||
              matchesGeneral ||
              matchesId
            );
          }
        }
        return true;
      },
    });
  }, [
    allLedgerItems,
    selectedOfficerId,
    fromDate,
    toDate,
    hasSubLedgerFilter,
    typeFilter,
    selectedCategory,
    linkedTaskFilter,
    settlementFilter,
    minAmount,
    maxAmount,
    searchTerm,
    users,
    tasks,
    presets,
    students,
    vehicles,
  ]);

  const displayedLedgerRows = useMemo(() => {
    return ledgerSortOrder === 'asc'
      ? accountingLedger.rows
      : [...accountingLedger.rows].reverse();
  }, [accountingLedger.rows, ledgerSortOrder]);

  const ledgerSettlementStats = useMemo(() => {
    let settled = 0;
    for (const row of accountingLedger.rows) {
      if (row.item.isSettled) settled++;
    }
    return {
      settled,
      unsettled: accountingLedger.rows.length - settled,
    };
  }, [accountingLedger.rows]);

  const displayedRowKeys = useMemo(
    () => displayedLedgerRows.map(r => walletRecordKey(r.item.type, r.item.id)),
    [displayedLedgerRows]
  );

  const selectedVisibleRows = useMemo(
    () => displayedLedgerRows.filter(r => Boolean(selectedRecordKeys[walletRecordKey(r.item.type, r.item.id)])),
    [displayedLedgerRows, selectedRecordKeys]
  );

  const selectedUnsettledRows = useMemo(
    () => selectedVisibleRows.filter(r => !r.item.isSettled),
    [selectedVisibleRows]
  );

  const selectedSettledRows = useMemo(
    () => selectedVisibleRows.filter(r => Boolean(r.item.isSettled)),
    [selectedVisibleRows]
  );

  const selectedVisibleAmounts = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const r of selectedVisibleRows) {
      debit += r.debit ?? 0;
      credit += r.credit ?? 0;
    }
    return { debit: round2(debit), credit: round2(credit) };
  }, [selectedVisibleRows]);

  const visibleUnsettledCount = useMemo(
    () => displayedLedgerRows.filter(r => !r.item.isSettled).length,
    [displayedLedgerRows]
  );

  const selectedCount = selectedVisibleRows.length;
  const allVisibleSelected = displayedRowKeys.length > 0 && selectedCount === displayedRowKeys.length;
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (!isAccountant) {
      setSelectedRecordKeys(prev => (Object.keys(prev).length === 0 ? prev : {}));
      setLastClickedRecordKey(null);
      return;
    }
    const visibleSet = new Set(displayedRowKeys);
    setSelectedRecordKeys(prev => {
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === 0) return prev;
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const k of prevKeys) {
        if (prev[k] && visibleSet.has(k)) {
          next[k] = true;
        } else if (prev[k]) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isAccountant, displayedRowKeys]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleToggleRowSelection = (key: string, checked: boolean) => {
    if (!isAccountant) return;
    const useRange =
      lastShiftKeyRef.current &&
      lastClickedRecordKey !== null &&
      displayedRowKeys.includes(lastClickedRecordKey);
    lastShiftKeyRef.current = false;

    setSelectedRecordKeys(prev => {
      const next = { ...prev };
      if (useRange) {
        const rangeKeys = getRangeKeys(displayedRowKeys, lastClickedRecordKey, key);
        for (const rk of rangeKeys) {
          if (checked) {
            next[rk] = true;
          } else {
            delete next[rk];
          }
        }
      } else {
        if (checked) {
          next[key] = true;
        } else {
          delete next[key];
        }
      }
      return next;
    });
    setLastClickedRecordKey(key);
  };

  const handleToggleSelectAllVisible = () => {
    if (!isAccountant || displayedRowKeys.length === 0) return;
    if (allVisibleSelected) {
      setSelectedRecordKeys({});
    } else {
      const next: Record<string, boolean> = {};
      for (const k of displayedRowKeys) {
        next[k] = true;
      }
      setSelectedRecordKeys(next);
    }
    setLastClickedRecordKey(null);
  };

  const handleSelectUnsettledVisible = () => {
    if (!isAccountant) return;
    const next: Record<string, boolean> = {};
    for (const r of displayedLedgerRows) {
      if (!r.item.isSettled) {
        next[walletRecordKey(r.item.type, r.item.id)] = true;
      }
    }
    setSelectedRecordKeys(next);
    setLastClickedRecordKey(null);
  };

  const handleClearSelection = () => {
    setSelectedRecordKeys({});
    setLastClickedRecordKey(null);
  };

  const handleBulkSettle = async (targetSettled: boolean) => {
    if (!isAccountant || isBatchSettling) return;
    const targetRows = targetSettled ? selectedUnsettledRows : selectedSettledRows;
    if (targetRows.length === 0) return;

    const refs: WalletRecordRef[] = targetRows.map(r => ({
      recordType: r.item.type,
      recordId: r.item.id,
    }));

    setIsBatchSettling(true);
    try {
      const updatedCount = await batchToggleWalletRecordsSettled(refs, targetSettled);
      setSelectedRecordKeys({});
      setLastClickedRecordKey(null);
      toast.success(
        targetSettled
          ? `${updatedCount} ${updatedCount === 1 ? 'record' : 'records'} ${t('settled') || 'Settled'}`
          : `${updatedCount} ${updatedCount === 1 ? 'record' : 'records'} ${t('unsettled') || 'Unsettled'}`
      );
    } catch (error) {
      console.error('Failed to batch update settlement status:', error);
      toast.error('Failed to update selected records.');
    } finally {
      setIsBatchSettling(false);
    }
  };

  const handleToggleSettled = async (
    recordType: 'expense' | 'topup',
    recordId: string,
    nextSettled: boolean,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (!isAccountant) return;
    const key = `${recordType}:${recordId}`;
    if (settlingRecordKeys[key]) return;

    setSettlingRecordKeys(prev => ({ ...prev, [key]: true }));
    try {
      await toggleWalletRecordSettled(recordType, recordId, nextSettled);
      if (recordType === 'expense' && viewingReceipt && viewingReceipt.id === recordId) {
        setViewingReceipt(prev =>
          prev
            ? {
                ...prev,
                isSettled: nextSettled,
                settledAt: nextSettled ? new Date().toISOString() : undefined,
                settledBy: nextSettled ? currentUser?.id : undefined,
                settledByName: nextSettled ? (currentUser?.name || currentUser?.username) : undefined,
              }
            : null
        );
      }
      toast.success(
        nextSettled
          ? (t('settled') || 'Settled')
          : (t('unsettled') || 'Unsettled')
      );
    } catch (error) {
      console.error('Failed to update settlement status:', error);
      toast.error('Failed to update settlement status.');
    } finally {
      setSettlingRecordKeys(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Resolve Task, Student / Beneficiary, Service Package, Category, and Counselor Attribution for an Expense
  const resolveExpenseAttribution = (taskId?: string | null) => {
    if (!taskId || taskId === 'unassigned') {
      return {
        isUnassigned: true,
        isStudentTask: false,
        taskCategory: undefined,
        taskStatus: undefined,
        taskTitle: 'Unassigned / General',
        studentName: 'Unassigned / General',
        passportNumber: '-',
        studentPackage: '-' as const,
        counselorName: '-',
      };
    }
    const linkedTask = tasks.find(t => t.id === taskId);
    if (!linkedTask) {
      return {
        isUnassigned: true,
        isStudentTask: false,
        taskCategory: undefined,
        taskStatus: undefined,
        taskTitle: 'Unassigned / General',
        studentName: 'Unassigned / General',
        passportNumber: '-',
        studentPackage: '-' as const,
        counselorName: '-',
      };
    }
    const taskCategory = getTaskCategory(linkedTask);
    const isStudentTask = taskCategory !== 'non_student';
    const student = isStudentTask ? students.find(s => s.id === linkedTask.studentId) : undefined;
    const taskTitle = getTaskDisplayTitle(linkedTask, presets, 'en');
    const studentName = getTaskSubjectName(linkedTask, students, 'en');
    const passportNumber = student?.passportNumber || '-';
    const studentPackage = isStudentTask && student ? (student.package || student.servicePackage || 'Free') : ('-' as const);
    const counselorUser = student
      ? users.find(u => u.id === student.counselorId || u.id === student.counselor)
      : undefined;
    const counselorName = isStudentTask
      ? (counselorUser?.name || student?.counselor || 'Unassigned')
      : '-';

    return {
      isUnassigned: false,
      isStudentTask,
      taskCategory,
      taskStatus: linkedTask.status,
      taskTitle,
      studentName,
      passportNumber,
      studentPackage,
      counselorName,
      student,
      linkedTask,
    };
  };

  // Same-date Officer VehicleLogs Mileage Cross-Check for "Fuel" Expenses
  const viewingReceiptMileageLogs = useMemo(() => {
    if (!viewingReceipt || viewingReceipt.category !== 'Fuel') return [];
    const receiptDateKey = toDateKeyUTC8(viewingReceipt.timestamp || viewingReceipt.createdAt);
    if (!receiptDateKey) return [];

    return vehicleLogs.filter(log => {
      if (log.userId !== viewingReceipt.userId) return false;
      const logDateKey = log.date || toDateKeyUTC8(log.startTime);
      return logDateKey === receiptDateKey;
    });
  }, [viewingReceipt, vehicleLogs]);

  // Multi-Sheet Excel (.xlsx) Export Handler
  const handleExportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const { workbook, fileName } = buildWalletAuditWorkbook(XLSX, {
        ledger: accountingLedger,
        users,
        fieldOfficers,
        vehicles,
        topups,
        expenses,
        expenseCategories: EXPENSE_CATEGORIES,
        fromDate,
        toDate,
        selectedOfficerId,
        typeFilter,
        selectedCategory,
        settlementFilter,
        currentUserName: currentUser?.name,
        currentUserRole: currentUser?.role,
        totalOfficersBalance,
        resolveExpenseAttribution,
      });

      XLSX.writeFile(workbook, fileName);
      toast.success(`Exported ${fileName}`);
    } catch (error) {
      console.error('Excel export failed:', error);
      toast.error('Failed to export Excel audit report.');
    }
  };

  const renderPackageBadge = (pkg: string) => {
    if (!pkg || pkg === '-') return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border shadow-2xs",
          pkg === '500$'
            ? "bg-purple-50 text-purple-800 border-purple-300"
            : pkg === '300$'
            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
            : pkg === '300$(Free)'
            ? "bg-teal-50 text-teal-800 border-teal-300"
            : "bg-slate-100 text-slate-700 border-slate-300"
        )}
      >
        <Sparkles
          size={10}
          className={
            pkg === '500$'
              ? "text-purple-600"
              : pkg === '300$'
              ? "text-emerald-600"
              : pkg === '300$(Free)'
              ? "text-teal-600"
              : "text-slate-500"
          }
        />
        <span>{pkg} Package</span>
      </span>
    );
  };

  const renderSettlementControl = (
    item: Pick<AuditLedgerItem, 'type' | 'id' | 'isSettled' | 'settledAt' | 'settledByName'>,
    compact = false
  ) => {
    const isSettled = Boolean(item.isSettled);
    const isSettling = Boolean(settlingRecordKeys[`${item.type}:${item.id}`]);
    const settledTimeLabel = item.settledAt ? formatDateTimeUTC8(item.settledAt) : '';
    const settledTooltip = isSettled
      ? [
          t('settled') || 'Settled',
          item.settledByName ? `${t('settledBy') || 'Settled By'}: ${item.settledByName}` : '',
          settledTimeLabel ? `${t('settledAt') || 'Settled At'}: ${settledTimeLabel} UTC+8` : '',
          isAccountant ? `(${t('markAsUnsettled') || 'Mark as Unsettled'})` : '',
        ]
          .filter(Boolean)
          .join(' • ')
      : isAccountant
      ? (t('markAsSettled') || 'Mark as Settled')
      : (t('unsettled') || 'Unsettled');

    if (isAccountant) {
      return (
        <div className={cn("flex flex-col", compact ? "items-end" : "items-start sm:items-end")}>
          <button
            type="button"
            disabled={isSettling || isBatchSettling}
            onClick={(e) => handleToggleSettled(item.type, item.id, !isSettled, e)}
            title={settledTooltip}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-wait",
              compact
                ? "px-2 py-1 text-[10.5px] xl:text-[11px]"
                : "px-3 py-1.5 text-xs",
              isSettled
                ? "bg-teal-600 hover:bg-teal-700 text-white border border-teal-600 shadow-2xs"
                : "bg-teal-50/70 hover:bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950/50 dark:hover:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700"
            )}
          >
            {isSettling ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : isSettled ? (
              <CheckCircle2 size={12} className="shrink-0" />
            ) : (
              <Clock size={12} className="shrink-0" />
            )}
            <span>
              {isSettled
                ? (t('settled') || 'Settled')
                : (t('markAsSettled') || 'Mark Settled')}
            </span>
          </button>
          {isSettled && item.settledByName && (
            <span className="text-[9.5px] text-teal-800/80 dark:text-teal-300/80 font-medium mt-0.5 truncate max-w-[130px]">
              {item.settledByName}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className={cn("flex flex-col", compact ? "items-end" : "items-start sm:items-end")} title={settledTooltip}>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full font-bold border whitespace-nowrap",
            compact ? "px-2 py-0.5 text-[10px] xl:text-[11px]" : "px-2.5 py-1 text-xs",
            isSettled
              ? "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700"
              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
          )}
        >
          {isSettled ? <CheckCircle2 size={11} className="shrink-0" /> : <Clock size={11} className="shrink-0" />}
          <span>{isSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}</span>
        </span>
        {isSettled && item.settledByName && (
          <span className="text-[9.5px] text-teal-800/80 dark:text-teal-300/80 font-medium mt-0.5 truncate max-w-[130px]">
            {item.settledByName}
          </span>
        )}
      </div>
    );
  };

  const selectedOfficerLabel = selectedOfficerId === 'all'
    ? 'All Field Officers'
    : (users.find(u => u.id === selectedOfficerId)?.name || 'Selected Officer');

  return (
    <div className="space-y-6 pb-20 w-full">
      {/* Top Header with Export to Excel CTA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <History className="text-red-600" size={28} />
              <span>{t('walletHistory') || 'Wallet History & Financial Audit'}</span>
            </h1>
            <span
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1.5",
                isAccountant
                  ? "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800"
                  : "bg-indigo-50 text-indigo-800 border-indigo-200"
              )}
            >
              <ShieldCheck size={14} className={isAccountant ? "text-teal-600 dark:text-teal-300" : "text-indigo-600"} />
              <span>
                {isAccountant
                  ? (t('accountantSettlementAudit') || 'Accountant Audit & Settlement')
                  : (t('readOnlyAudit') || 'Read-Only Audit')}
              </span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Auditable, chronological ledger of float disbursements (Debit), operational expenses (Credit), running balances, and GPS-watermarked receipts
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportToExcel}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all cursor-pointer shrink-0"
        >
          <FileSpreadsheet size={18} />
          <span>Export to Excel</span>
          <Download size={15} className="opacity-80" />
        </button>
      </div>

      {/* 4 Dynamic Period KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Float Disbursed / Top-Ups (Debit) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Total Top-Ups (Debit)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2 font-mono">
            {formatAmountWithSign(periodTotalTopUpsRM, 'topup')}
          </div>
          <span className="text-xs text-slate-500 mt-1">
            {periodTopUps.length} top-up {periodTopUps.length === 1 ? 'disbursement' : 'disbursements'} in selected period
          </span>
        </div>

        {/* KPI 2: Total Verified Expenses (Credit) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Total Expenses (Credit)</span>
            <div className="p-2 bg-red-50 text-red-600 rounded-xl">
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-600 mt-2 font-mono">
            {formatAmountWithSign(periodTotalExpensesRM, 'expense')}
          </div>
          <span className="text-xs text-slate-500 mt-1">
            {periodExpenses.length} watermarked {periodExpenses.length === 1 ? 'receipt' : 'receipts'} in selected period
          </span>
        </div>

        {/* KPI 3: Current Total Active Float Across All Officers (RM) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Current Total Active Float</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Wallet size={18} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 font-mono">
            {formatCurrency(totalOfficersBalance)}
          </div>
          <span className="text-xs text-slate-500 mt-1">
            Across {fieldOfficers.length} field officers ({lowBalanceOfficers.length} low float &lt; RM 50)
          </span>
        </div>

        {/* KPI 4: Top Expense Category in Selected Period */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Top Expense Category</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <TrendingUp size={18} />
            </div>
          </div>
          {topExpenseCategoryStat.category ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-900 truncate">
                  {topExpenseCategoryStat.category}
                </span>
                <span className="text-sm font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 font-mono shrink-0">
                  {formatCurrency(topExpenseCategoryStat.amount)}
                </span>
              </div>
              <span className="text-xs text-slate-500 mt-1">
                {topExpenseCategoryStat.sharePct}% of total period expenses
              </span>
            </>
          ) : (
            <>
              <div className="text-2xl font-black text-slate-400 mt-2">No Expenses</div>
              <span className="text-xs text-slate-400 mt-1">RM 0.00 recorded in selected period</span>
            </>
          )}
        </div>
      </div>

      {/* Field Officers Fleet Status Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <User size={18} className="text-slate-500" />
            <span>Field Personnel Float Snapshot</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            Click an officer card to filter ledger • {fieldOfficers.length} Officers Registered
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {fieldOfficers.map(officer => {
            const bal = round2(officer.walletBalance ?? 0);
            const isLow = bal < 50;
            const isSelected = selectedOfficerId === officer.id;

            return (
              <div
                key={officer.id}
                onClick={() => setSelectedOfficerId(isSelected ? 'all' : officer.id)}
                className={cn(
                  "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                  isSelected
                    ? "border-red-500 bg-red-50/40 ring-2 ring-red-500/20"
                    : isLow
                    ? "border-amber-200 bg-amber-50/40 hover:border-amber-300"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100/70"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {officer.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-xs truncate">{officer.name}</p>
                    <p className="text-[10px] text-slate-400">@{officer.username || officer.id}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={cn(
                    "text-xs font-black px-2 py-0.5 rounded-md border inline-block font-mono",
                    isLow ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-emerald-700 border-slate-200"
                  )}>
                    {formatCurrency(bal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date-Range & Multi-Criteria Filter Toolbar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter size={17} className="text-red-600" />
            <h3 className="font-bold text-slate-800 text-sm">Audit Period & Multi-Criteria Filter Bar</h3>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs mr-1">
                <Filter size={12} />
                <span>{activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}</span>
              </span>
            )}
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Presets:</span>
            {([
              { id: 'today', label: 'Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'all_time', label: 'All Time' },
            ] as { id: DatePresetKey; label: string }[]).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyDatePreset(preset.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                  activePreset === preset.id
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {preset.label}
              </button>
            ))}

            {(fromDate || toDate || selectedOfficerId !== 'all' || typeFilter !== 'all' || selectedCategory !== 'all' || linkedTaskFilter !== 'all' || settlementFilter !== 'all' || minAmount || maxAmount || searchTerm) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors cursor-pointer ml-1"
                title="Reset all audit filters"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              <Filter size={13} />
              <span>{isFiltersExpanded ? 'Hide Filters' : 'Filters'}</span>
            </button>
          </div>
        </div>

        {/* Date Pickers + Audit Dropdowns Row */}
        <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-end", isFiltersExpanded ? "grid" : "hidden md:grid")}>
          {/* Start Date (fromDate) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Start Date (From)
            </label>
            <DatePicker
              value={fromDate}
              onChange={(date) => {
                setFromDate(date);
                setActivePreset('custom');
              }}
              placeholder="From Date"
            />
          </div>

          {/* End Date (toDate) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              End Date (To)
            </label>
            <DatePicker
              value={toDate}
              onChange={(date) => {
                setToDate(date);
                setActivePreset('custom');
              }}
              placeholder="To Date"
            />
          </div>

          {/* Field Officer Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Field Officer
            </label>
            <select
              value={selectedOfficerId}
              onChange={e => setSelectedOfficerId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Field Officers</option>
              {fieldOfficers.map(off => (
                <option key={off.id} value={off.id}>{off.name}</option>
              ))}
            </select>
          </div>

          {/* Transaction Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Transaction Type
            </label>
            <select
              value={typeFilter}
              onChange={e => {
                const val = e.target.value as 'all' | 'expense' | 'topup';
                setTypeFilter(val);
                if (val === 'topup') setSelectedCategory('all');
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All</option>
              <option value="expense">Expenses Only (Credit)</option>
              <option value="topup">Top-Ups Only (Debit)</option>
            </select>
          </div>

          {/* Expense Category Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Expense Category
            </label>
            <select
              value={selectedCategory}
              disabled={typeFilter === 'topup'}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="all">All Categories</option>
              <option value="Fuel">Fuel</option>
              <option value="Tolls">Tolls</option>
              <option value="SIM Card">SIM Card</option>
              <option value="Medical Fees">Medical Fees</option>
              <option value="Parking">Parking</option>
              <option value="Meals">Meals</option>
              <option value="Hotel">Hotel</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Linked Task Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Linked Task Type
            </label>
            <select
              value={linkedTaskFilter}
              onChange={e => setLinkedTaskFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Records</option>
              <option value="task_linked">Task-Linked</option>
              <option value="no_task">No Task Assigned</option>
            </select>
          </div>

          {/* Settlement Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {t('settlementStatus') || 'Settlement Status'}
            </label>
            <select
              value={settlementFilter}
              onChange={e => setSettlementFilter(e.target.value as 'all' | 'settled' | 'unsettled')}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{t('all') || 'All Records'}</option>
              <option value="settled">{t('settledOnly') || 'Settled Only'}</option>
              <option value="unsettled">{t('unsettledOnly') || 'Unsettled Only'}</option>
            </select>
          </div>

          {/* Amount Range: Min RM */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Min Amount (RM)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Min RM"
              value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>

          {/* Amount Range: Max RM */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Max Amount (RM)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Max RM"
              value={maxAmount}
              onChange={e => setMaxAmount(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Keyword Search
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Student, passport, note..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>
          </div>
        </div>

        {/* Live Results Counter & Settlement Color Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
          <span>
            Showing <strong className="text-slate-900 font-bold">{accountingLedger.rows.length}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{allLedgerItems.length}</strong> financial audit records
          </span>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-teal-800 dark:text-teal-300">
              <span className="w-3 h-3 rounded-sm bg-teal-100 border-2 border-teal-500 dark:bg-teal-900 dark:border-teal-400 inline-block" />
              <span>{t('settled') || 'Settled'}: <strong>{ledgerSettlementStats.settled}</strong></span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 inline-block" />
              <span>{t('unsettled') || 'Unsettled'}: <strong>{ledgerSettlementStats.unsettled}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Structured Audit Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-slate-50/60">
          <div>
            <h3 className="font-bold text-slate-800 text-base sm:text-lg flex items-center gap-2">
              <Receipt size={20} className="text-red-600 shrink-0" />
              <span>Transactions Ledger (Debit / Credit / Balance)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing <span className="font-bold text-slate-800">{accountingLedger.rows.length}</span> verified transactions
              {(fromDate || toDate) && (
                <span> • Period: <span className="font-semibold text-slate-700">{fromDate || 'Start'} → {toDate || 'Now'}</span></span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Desktop Table / Card Display Switcher */}
            <div className="hidden lg:inline-flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setLedgerDisplayMode('table')}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer",
                  ledgerDisplayMode === 'table'
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
                title="Full-width structured table view"
              >
                <Table2 size={13} />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setLedgerDisplayMode('cards')}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer",
                  ledgerDisplayMode === 'cards'
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
                title="Detailed audit card view"
              >
                <LayoutGrid size={13} />
                <span>Cards</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLedgerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Toggle chronological display order (Excel export always uses ascending ledger order)"
            >
              <ArrowUpDown size={14} className="text-slate-500" />
              <span>{ledgerSortOrder === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportToExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet size={15} />
              <span>Download .XLSX ({accountingLedger.rows.length} rows)</span>
            </button>
          </div>
        </div>

        {/* Period Ledger Accounting Summary Strip */}
        {(accountingLedger.rows.length > 0 || accountingLedger.hasOpeningBalanceRow) && (
          <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {accountingLedger.hasOpeningBalanceRow && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200">
                  <span className="text-slate-500 font-semibold">Opening:</span>
                  <span className={cn(
                    "font-mono font-black",
                    accountingLedger.openingBalance < 0 ? "text-red-600" : "text-slate-900"
                  )}>
                    RM {formatAccountingNumber(accountingLedger.openingBalance)}
                  </span>
                </div>
              )}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-800 font-semibold">Debit (+):</span>
                <span className="font-mono font-black text-emerald-700">
                  RM {formatAccountingNumber(accountingLedger.totalDebit)}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 border border-red-200">
                <span className="text-red-800 font-semibold">Credit (-):</span>
                <span className="font-mono font-black text-red-600">
                  RM {formatAccountingNumber(accountingLedger.totalCredit)}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500 font-semibold">Net Change:</span>
                <span className={cn(
                  "font-mono font-black",
                  accountingLedger.netChange < 0 ? "text-red-600" : "text-emerald-700"
                )}>
                  {accountingLedger.netChange >= 0 ? '+' : '-'}RM {formatAccountingNumber(Math.abs(accountingLedger.netChange))}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-50 border border-teal-200 dark:bg-teal-950/60 dark:border-teal-800">
                <CheckCircle2 size={13} className="text-teal-600 dark:text-teal-300" />
                <span className="text-teal-800 dark:text-teal-200 font-semibold">{t('settled') || 'Settled'}:</span>
                <span className="font-mono font-black text-teal-700 dark:text-teal-300">
                  {ledgerSettlementStats.settled}/{accountingLedger.rows.length}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 text-white">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">Ending Balance:</span>
              <span className={cn(
                "font-mono font-black text-xs sm:text-sm",
                accountingLedger.endingBalance < 0 ? "text-red-300" : "text-emerald-300"
              )}>
                RM {formatAccountingNumber(accountingLedger.endingBalance)}
              </span>
            </div>
          </div>
        )}

        {/* Accountant Batch Selection Quick Toolbar */}
        {isAccountant && displayedLedgerRows.length > 0 && (
          <div className="px-4 sm:px-5 py-2.5 bg-teal-50/60 dark:bg-teal-950/35 border-b border-teal-200/70 dark:border-teal-800/60 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBatchSettling}
                onClick={handleToggleSelectAllVisible}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold border transition-all cursor-pointer disabled:opacity-50",
                  allVisibleSelected
                    ? "bg-teal-600 text-white border-teal-600 shadow-2xs"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-950/60"
                )}
              >
                {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>
                  {t('selectAll') || 'Select All'} ({displayedLedgerRows.length})
                </span>
              </button>

              <button
                type="button"
                disabled={isBatchSettling || visibleUnsettledCount === 0}
                onClick={handleSelectUnsettledVisible}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold border bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-200 border-teal-300 dark:border-teal-700 hover:bg-teal-100/70 dark:hover:bg-teal-900/60 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Clock size={13} className="shrink-0" />
                <span>
                  {t('selectUnsettled') || 'Select Unsettled'} ({visibleUnsettledCount})
                </span>
              </button>

              {selectedCount > 0 && (
                <button
                  type="button"
                  disabled={isBatchSettling}
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50"
                >
                  <X size={13} />
                  <span>{t('clearSelection') || 'Clear'}</span>
                </button>
              )}
            </div>

            {selectedCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-teal-900 dark:text-teal-200 bg-teal-100/90 dark:bg-teal-900/70 px-2.5 py-1 rounded-lg border border-teal-300 dark:border-teal-700">
                  {selectedCount} {t('selectedRecords') || 'Selected'}
                  {selectedUnsettledRows.length > 0 && ` • ${selectedUnsettledRows.length} ${t('unsettled') || 'Unsettled'}`}
                  {selectedSettledRows.length > 0 && ` • ${selectedSettledRows.length} ${t('settled') || 'Settled'}`}
                </span>
                {selectedUnsettledRows.length > 0 && (
                  <button
                    type="button"
                    disabled={isBatchSettling}
                    onClick={() => handleBulkSettle(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isBatchSettling ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>{t('markSelectedSettled') || 'Mark Selected Settled'} ({selectedUnsettledRows.length})</span>
                  </button>
                )}
                {selectedSettledRows.length > 0 && (
                  <button
                    type="button"
                    disabled={isBatchSettling}
                    onClick={() => handleBulkSettle(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isBatchSettling ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    <span>{t('unsettleSelected') || 'Unsettle Selected'} ({selectedSettledRows.length})</span>
                  </button>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-teal-800/80 dark:text-teal-300/80 font-medium hidden sm:inline">
                Shift+Click checkboxes to select a range of records
              </span>
            )}
          </div>
        )}

        {/* Audit Table */}
        {accountingLedger.rows.length === 0 && !accountingLedger.hasOpeningBalanceRow ? (
          <div className="p-16 text-center text-slate-400">
            <Receipt size={44} className="mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-slate-700 text-base">No audit ledger records found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the date range, officer, or category filters above.</p>
          </div>
        ) : (
          <div>
            {/* Responsive Transaction Cards View (Mobile/Tablet < lg, or desktop Cards mode) */}
            <div className={cn("divide-y divide-slate-100 dark:divide-slate-800", ledgerDisplayMode === 'cards' ? "block" : "lg:hidden")}>
              {accountingLedger.hasOpeningBalanceRow && ledgerSortOrder === 'asc' && (
                <div className="p-4 bg-slate-50/90 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Opening Balance (Before {fromDate})
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{selectedOfficerLabel}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Balance</span>
                    <span className={cn(
                      "text-sm font-black font-mono",
                      accountingLedger.openingBalance < 0 ? "text-red-600" : "text-slate-900 dark:text-white"
                    )}>
                      RM {formatAccountingNumber(accountingLedger.openingBalance)}
                    </span>
                  </div>
                </div>
              )}

              {displayedLedgerRows.map(row => {
                const item = row.item;
                const officer = users.find(u => u.id === item.userId);
                const fullTimestamp = formatDateTimeUTC8(item.timestamp || item.createdAt);
                const isSettled = Boolean(item.isSettled);
                const recordKey = walletRecordKey(item.type, item.id);
                const isSelected = Boolean(selectedRecordKeys[recordKey]);
                const cardSurfaceClass = isSettled
                  ? isSelected
                    ? "bg-teal-100/95 hover:bg-teal-100 dark:bg-teal-900/70 dark:hover:bg-teal-800/75 border-s-4 border-s-teal-600 dark:border-s-teal-300"
                    : "bg-teal-50/90 hover:bg-teal-100/75 dark:bg-teal-950/45 dark:hover:bg-teal-900/55 border-s-4 border-s-teal-500 dark:border-s-teal-400"
                  : isSelected
                  ? "bg-indigo-50/90 hover:bg-indigo-100/70 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border-s-4 border-s-indigo-500 dark:border-s-indigo-400"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50";

                if (item.type === 'topup') {
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 sm:p-5 transition-colors space-y-2.5",
                        cardSurfaceClass
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isAccountant && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isBatchSettling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  lastShiftKeyRef.current = e.shiftKey;
                                }}
                                onChange={(e) => handleToggleRowSelection(recordKey, e.target.checked)}
                                aria-label={`Select top-up ${item.id}`}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600 shrink-0"
                              />
                            )}
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <ArrowUpRight size={12} /> Top-Up (Debit)
                            </span>
                            {isSettled && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700">
                                <CheckCircle2 size={10} /> {t('settled') || 'Settled'}
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-400 break-all">ID: {item.id}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {officer?.name.charAt(0) || 'U'}
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white">{officer?.name || 'Unknown Officer'}</span>
                            <span className="text-[11px] text-slate-400">@{officer?.username || item.userId}</span>
                            <span className="font-mono text-[11px] text-slate-400">• {fullTimestamp} UTC+8</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800 font-mono inline-block">
                            +RM {formatAccountingNumber(row.debit ?? 0)}
                          </span>
                          <span className={cn(
                            "block text-[11px] font-bold font-mono mt-1",
                            row.balance < 0 ? "text-red-600" : "text-slate-600 dark:text-slate-300"
                          )}>
                            Bal: RM {formatAccountingNumber(row.balance)}
                          </span>
                        </div>
                      </div>

                      <div className={cn(
                        "text-xs text-slate-600 dark:text-slate-300 p-2.5 rounded-xl border space-y-1",
                        isSettled
                          ? "bg-white/75 dark:bg-teal-950/60 border-teal-200/80 dark:border-teal-800/70"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800"
                      )}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{item.source || 'Office Petty Cash'}</span>
                          <span className="text-[11px] italic text-slate-400">Float Top-Up Disbursement</span>
                        </div>
                        {item.notes && (
                          <p className="text-slate-500 dark:text-slate-400 text-[11px] whitespace-normal break-words">
                            "{item.notes}"
                          </p>
                        )}
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-400">
                          {isSettled && item.settledAt
                            ? `${t('settledAt') || 'Settled At'}: ${formatDateTimeUTC8(item.settledAt)} UTC+8`
                            : ''}
                        </span>
                        {renderSettlementControl(item, false)}
                      </div>
                    </div>
                  );
                } else {
                  // Expense item
                  const attr = resolveExpenseAttribution(item.taskId);
                  const veh = resolveExpenseVehicle(item, vehicles);
                  const CatIcon = categoryIcons[item.category] || MoreHorizontal;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 sm:p-5 transition-colors space-y-2.5",
                        cardSurfaceClass
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isAccountant && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isBatchSettling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  lastShiftKeyRef.current = e.shiftKey;
                                }}
                                onChange={(e) => handleToggleRowSelection(recordKey, e.target.checked)}
                                aria-label={`Select expense ${item.id}`}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600 shrink-0"
                              />
                            )}
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">
                              <ArrowDownRight size={12} /> Expense (Credit)
                            </span>
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border", categoryColors[item.category] || 'bg-slate-50 text-slate-700 border-slate-200')}>
                              <CatIcon size={11} />
                              <span>{item.category}</span>
                            </span>
                            {isSettled && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700">
                                <CheckCircle2 size={10} /> {t('settled') || 'Settled'}
                              </span>
                            )}
                            {veh && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <Car size={11} className="text-red-600 shrink-0" />
                                <span>{veh.label}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                            <div className="w-6 h-6 rounded-lg bg-red-100 text-red-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {officer?.name.charAt(0) || 'U'}
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white">{officer?.name || 'Unknown Officer'}</span>
                            <span className="text-[11px] text-slate-400">@{officer?.username || item.userId}</span>
                            <span className="font-mono text-[11px] text-slate-400">• {fullTimestamp} UTC+8</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2.5 py-1 rounded-xl border border-red-200 dark:border-red-800 font-mono inline-block">
                            -RM {formatAccountingNumber(row.credit ?? 0)}
                          </span>
                          <span className={cn(
                            "block text-[11px] font-bold font-mono mt-1",
                            row.balance < 0 ? "text-red-600" : "text-slate-600 dark:text-slate-300"
                          )}>
                            Bal: RM {formatAccountingNumber(row.balance)}
                          </span>
                        </div>
                      </div>

                      {(item.notes || item.location || item.id) && (
                        <div className="space-y-1 text-xs">
                          {item.notes && (
                            <p className="text-slate-600 dark:text-slate-300 font-medium whitespace-normal break-words">
                              "{item.notes}"
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.location && (
                              <span className="inline-flex items-start gap-1 whitespace-normal break-words">
                                <MapPin size={11} className="text-red-500 shrink-0 mt-0.5" />
                                <span>{item.location}</span>
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-400 break-all">ID: {item.id}</span>
                          </div>
                        </div>
                      )}

                      {!attr.isUnassigned ? (
                        <div className={cn(
                          "text-xs p-2.5 rounded-xl border space-y-1.5",
                          isSettled
                            ? "bg-white/75 dark:bg-teal-950/60 border-teal-200/80 dark:border-teal-800/70"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800"
                        )}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">{attr.studentName}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {attr.taskCategory && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border",
                                  attr.taskCategory === 'non_student'
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : attr.taskCategory === 'student_custom'
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                )}>
                                  {attr.taskCategory === 'non_student' ? 'Non-Student' : attr.taskCategory === 'student_custom' ? 'Student Custom' : 'Student SOP'}
                                </span>
                              )}
                              {attr.taskStatus && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                  getTaskStatusBadgeClasses(attr.taskStatus)
                                )}>
                                  {attr.taskStatus.replace('_', ' ')}
                                </span>
                              )}
                              {attr.isStudentTask && renderPackageBadge(attr.studentPackage)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                            {attr.taskTitle !== attr.studentName && (
                              <span className="font-medium text-slate-700 dark:text-slate-300">{attr.taskTitle}</span>
                            )}
                            {attr.isStudentTask && attr.passportNumber !== '-' && (
                              <span className="font-mono text-[10px] bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {attr.passportNumber}
                              </span>
                            )}
                            {!attr.isStudentTask && attr.linkedTask?.nonStudentContact && (
                              <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold">
                                • Contact: {attr.linkedTask.nonStudentContact}
                              </span>
                            )}
                            {attr.isStudentTask && attr.counselorName !== '-' && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                • Counselor: <strong className="text-slate-700 dark:text-slate-200">{attr.counselorName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={cn(
                          "text-xs text-slate-500 dark:text-slate-400 px-2.5 py-1.5 rounded-xl border italic",
                          isSettled
                            ? "bg-white/75 dark:bg-teal-950/60 border-teal-200/80 dark:border-teal-800/70"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800"
                        )}>
                          Unassigned / General Expense
                        </div>
                      )}

                      <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderSettlementControl(item, false)}
                          {isSettled && item.settledAt && (
                            <span className="text-[11px] text-teal-800/80 dark:text-teal-300/80 font-mono">
                              {formatDateTimeUTC8(item.settledAt)} UTC+8
                            </span>
                          )}
                        </div>
                        {item.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => setViewingReceipt(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-red-600 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                            <span>Audit Receipt</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              })}

              {accountingLedger.hasOpeningBalanceRow && ledgerSortOrder === 'desc' && (
                <div className="p-4 bg-slate-50/90 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Opening Balance (Before {fromDate})
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{selectedOfficerLabel}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Balance</span>
                    <span className={cn(
                      "text-sm font-black font-mono",
                      accountingLedger.openingBalance < 0 ? "text-red-600" : "text-slate-900 dark:text-white"
                    )}>
                      RM {formatAccountingNumber(accountingLedger.openingBalance)}
                    </span>
                  </div>
                </div>
              )}

              {/* Mobile / Card Ledger Totals Summary Footer */}
              <div className="p-4 bg-slate-900 text-white space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300">
                  <span>Ledger Totals</span>
                  <span>{accountingLedger.rows.length} {accountingLedger.rows.length === 1 ? 'record' : 'records'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-white/10 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-300 block font-bold">Total Debit</span>
                    <span className="text-xs font-black font-mono text-white">
                      {formatAccountingNumber(accountingLedger.totalDebit)}
                    </span>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-red-300 block font-bold">Total Credit</span>
                    <span className="text-xs font-black font-mono text-white">
                      {formatAccountingNumber(accountingLedger.totalCredit)}
                    </span>
                  </div>
                  <div className="bg-white/15 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-200 block font-bold">Balance</span>
                    <span className={cn(
                      "text-xs font-black font-mono",
                      accountingLedger.endingBalance < 0 ? "text-red-300" : "text-emerald-300"
                    )}>
                      {formatAccountingNumber(accountingLedger.endingBalance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Zero-Scroll Full-Fit Audit Table */}
            <div className={cn("w-full", ledgerDisplayMode === 'table' ? "hidden lg:block" : "hidden")}>
              <table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  {isAccountant && <col className="w-[36px] xl:w-[42px]" />}
                  <col className="w-[78px] xl:w-[92px]" />
                  <col className="w-[88px] xl:w-[132px] 2xl:w-[156px]" />
                  <col className="w-auto" />
                  <col className="w-auto" />
                  <col className="w-[74px] xl:w-[90px] 2xl:w-[104px]" />
                  <col className="w-[74px] xl:w-[90px] 2xl:w-[104px]" />
                  <col className="w-[78px] xl:w-[96px] 2xl:w-[110px]" />
                  <col className="w-[96px] xl:w-[116px] 2xl:w-[126px]" />
                  <col className="w-[58px] xl:w-[76px]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] xl:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {isAccountant && (
                      <th className="px-1.5 py-3.5 text-center align-middle">
                        <input
                          ref={selectAllCheckboxRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={displayedRowKeys.length === 0 || isBatchSettling}
                          onChange={handleToggleSelectAllVisible}
                          aria-label={t('selectAll') || 'Select All'}
                          title={t('selectAll') || 'Select All'}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                        />
                      </th>
                    )}
                    <th className="px-1.5 xl:px-3 py-3.5">Date / Time (UTC+8)</th>
                    <th className="px-1.5 xl:px-3 py-3.5">Logistics Officer</th>
                    <th className="px-1.5 xl:px-3 py-3.5">Type & Details</th>
                    <th className="px-1.5 xl:px-3 py-3.5">Student & Task Attribution</th>
                    <th className="px-1.5 xl:px-3 py-3.5 text-right text-emerald-700">Debit (RM)</th>
                    <th className="px-1.5 xl:px-3 py-3.5 text-right text-red-700">Credit (RM)</th>
                    <th className="px-1.5 xl:px-3 py-3.5 text-right text-slate-700">Balance (RM)</th>
                    <th className="px-1.5 xl:px-3 py-3.5 text-right text-teal-800 dark:text-teal-300">{t('settled') || 'Settlement'}</th>
                    <th className="px-1.5 xl:px-3 py-3.5 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {accountingLedger.hasOpeningBalanceRow && ledgerSortOrder === 'asc' && (
                    <tr className="bg-slate-50/80 font-semibold">
                      {isAccountant && <td className="px-1.5 py-3 text-center align-top text-slate-300" />}
                      <td className="px-1.5 xl:px-3 py-3 text-slate-500 font-mono align-top leading-tight">
                        <span className="block text-[10px] uppercase text-slate-400">Before</span>
                        <span className="block text-[10.5px] xl:text-[11px] font-bold text-slate-700">{fromDate}</span>
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-slate-700 align-top [overflow-wrap:anywhere]">{selectedOfficerLabel}</td>
                      <td className="px-1.5 xl:px-3 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] xl:text-[11px] font-bold bg-slate-200/80 text-slate-700">
                            Opening Balance
                          </span>
                          <span className="text-slate-600 text-[11px]">Brought Forward</span>
                        </div>
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-slate-400 italic align-top [overflow-wrap:anywhere]">
                        Opening balance prior to {fromDate}
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-300 font-mono align-top">-</td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-300 font-mono align-top">-</td>
                      <td className={cn(
                        "px-1.5 xl:px-3 py-3 text-right font-mono tabular-nums font-black align-top whitespace-nowrap text-[11px] xl:text-xs",
                        accountingLedger.openingBalance < 0 ? "text-red-600" : "text-slate-900"
                      )}>
                        {formatAccountingNumber(accountingLedger.openingBalance)}
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-400 align-top">-</td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-400 align-top">-</td>
                    </tr>
                  )}

                  {displayedLedgerRows.map(row => {
                    const item = row.item;
                    const officer = users.find(u => u.id === item.userId);
                    const formattedDt = formatDateTimeUTC8(item.timestamp || item.createdAt);
                    const [datePart, timePart] = formattedDt.includes(' ') ? formattedDt.split(' ') : [formattedDt, ''];
                    const isSettled = Boolean(item.isSettled);
                    const recordKey = walletRecordKey(item.type, item.id);
                    const isSelected = Boolean(selectedRecordKeys[recordKey]);
                    const rowSurfaceClass = isSettled
                      ? isSelected
                        ? "bg-teal-200/75 hover:bg-teal-200/85 dark:bg-teal-900/80 dark:hover:bg-teal-800/85 transition-colors"
                        : "bg-teal-100/70 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/70 transition-colors"
                      : isSelected
                      ? "bg-indigo-50/90 hover:bg-indigo-100/70 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 transition-colors"
                      : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors";
                    const startBorderClass = isSettled
                      ? isSelected
                        ? "border-s-4 border-s-teal-600 dark:border-s-teal-300"
                        : "border-s-4 border-s-teal-500 dark:border-s-teal-400"
                      : isSelected
                      ? "border-s-4 border-s-indigo-500 dark:border-s-indigo-400"
                      : "";

                    if (item.type === 'topup') {
                      return (
                        <tr key={item.id} className={rowSurfaceClass}>
                          {isAccountant && (
                            <td className={cn("px-1.5 py-3.5 text-center align-top", startBorderClass)}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isBatchSettling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  lastShiftKeyRef.current = e.shiftKey;
                                }}
                                onChange={(e) => handleToggleRowSelection(recordKey, e.target.checked)}
                                aria-label={`Select top-up ${item.id}`}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600 mt-0.5"
                              />
                            </td>
                          )}
                          {/* Timestamp (Stacked Date + Full Time) */}
                          <td className={cn("px-1.5 xl:px-3 py-3.5 font-mono align-top leading-tight", !isAccountant && startBorderClass)}>
                            <span className="block text-[10.5px] xl:text-[11px] font-semibold text-slate-700 whitespace-nowrap">{datePart}</span>
                            {timePart && (
                              <span className="block text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{timePart}</span>
                            )}
                          </td>

                          {/* Officer */}
                          <td className="px-1.5 xl:px-3 py-3.5 align-top">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="hidden xl:flex w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 items-center justify-center font-bold text-[10px] shrink-0">
                                {officer?.name.charAt(0) || 'U'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900 [overflow-wrap:anywhere] leading-tight text-[11px] xl:text-xs">
                                  {officer?.name || 'Unknown Officer'}
                                </p>
                                <p className="text-[10px] text-slate-400 [overflow-wrap:anywhere] mt-0.5">
                                  @{officer?.username || item.userId}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Type & Details */}
                          <td className="px-1.5 xl:px-3 py-3.5 align-top">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 xl:px-2 py-0.5 rounded-md text-[10px] xl:text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                <ArrowUpRight size={11} /> Top-Up
                              </span>
                              <span className="font-semibold text-slate-800 text-[11px] xl:text-xs [overflow-wrap:anywhere] min-w-0">
                                {item.source || 'Office Petty Cash'}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="text-slate-600 text-[11px] mt-1 font-medium whitespace-normal [overflow-wrap:anywhere] leading-snug">
                                "{item.notes}"
                              </p>
                            )}
                            <p className="text-[10px] font-mono text-slate-400 mt-1 [overflow-wrap:anywhere]">
                              ID: {item.id}
                            </p>
                          </td>

                          {/* Linked Task / Student Attribution */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-slate-400 italic align-top [overflow-wrap:anywhere]">
                            - Float Top-Up Disbursement -
                          </td>

                          {/* Debit (Top-Up) */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right align-top">
                            <span className="text-[10.5px] xl:text-xs font-black text-emerald-700 bg-emerald-50 px-1.5 xl:px-2 py-0.5 rounded-lg border border-emerald-200 inline-block font-mono tabular-nums whitespace-nowrap">
                              {formatAccountingNumber(row.debit ?? 0)}
                            </span>
                          </td>

                          {/* Credit (Blank for Top-Up) */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right text-slate-300 font-mono align-top">
                            -
                          </td>

                          {/* Running Balance */}
                          <td className={cn(
                            "px-1.5 xl:px-3 py-3.5 text-right font-mono tabular-nums font-black align-top whitespace-nowrap text-[10.5px] xl:text-xs",
                            row.balance < 0 ? "text-red-600" : "text-slate-900"
                          )}>
                            {formatAccountingNumber(row.balance)}
                          </td>

                          {/* Settlement Status / Accountant Action */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right align-top">
                            {renderSettlementControl(item, true)}
                          </td>

                          {/* Receipt */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right text-slate-400 align-top">
                            <span className="text-[10px] italic whitespace-nowrap">Not Req.</span>
                          </td>
                        </tr>
                      );
                    } else {
                      // Expense Item with Student & Package Cost Attribution
                      const attr = resolveExpenseAttribution(item.taskId);
                      const veh = resolveExpenseVehicle(item, vehicles);
                      const CatIcon = categoryIcons[item.category] || MoreHorizontal;

                      return (
                        <tr key={item.id} className={rowSurfaceClass}>
                          {isAccountant && (
                            <td className={cn("px-1.5 py-3.5 text-center align-top", startBorderClass)}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isBatchSettling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  lastShiftKeyRef.current = e.shiftKey;
                                }}
                                onChange={(e) => handleToggleRowSelection(recordKey, e.target.checked)}
                                aria-label={`Select expense ${item.id}`}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600 mt-0.5"
                              />
                            </td>
                          )}
                          {/* Timestamp (Stacked Date + Full Time) */}
                          <td className={cn("px-1.5 xl:px-3 py-3.5 font-mono align-top leading-tight", !isAccountant && startBorderClass)}>
                            <span className="block text-[10.5px] xl:text-[11px] font-semibold text-slate-700 whitespace-nowrap">{datePart}</span>
                            {timePart && (
                              <span className="block text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{timePart}</span>
                            )}
                          </td>

                          {/* Officer */}
                          <td className="px-1.5 xl:px-3 py-3.5 align-top">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="hidden xl:flex w-7 h-7 rounded-lg bg-red-100 text-red-800 items-center justify-center font-bold text-[10px] shrink-0">
                                {officer?.name.charAt(0) || 'U'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900 [overflow-wrap:anywhere] leading-tight text-[11px] xl:text-xs">
                                  {officer?.name || 'Unknown Officer'}
                                </p>
                                <p className="text-[10px] text-slate-400 [overflow-wrap:anywhere] mt-0.5">
                                  @{officer?.username || item.userId}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Type, Category, Vehicle, Full Notes & Full GPS Location */}
                          <td className="px-1.5 xl:px-3 py-3.5 align-top">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 xl:px-2 py-0.5 rounded-md text-[10px] xl:text-[11px] font-bold bg-red-100 text-red-800 border border-red-200 shrink-0">
                                <ArrowDownRight size={11} /> Expense
                              </span>
                              <span className={cn("inline-flex items-center gap-1 px-1.5 xl:px-2 py-0.5 rounded text-[10px] xl:text-[11px] font-bold border shrink-0", categoryColors[item.category] || 'bg-slate-50 text-slate-700 border-slate-200')}>
                                <CatIcon size={10} />
                                <span>{item.category}</span>
                              </span>
                              {veh && (
                                <span className="inline-flex items-center gap-1 px-1.5 xl:px-2 py-0.5 rounded text-[10px] xl:text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 max-w-full min-w-0">
                                  <Car size={10} className="text-red-600 shrink-0" />
                                  <span className="[overflow-wrap:anywhere]">{veh.label}</span>
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-slate-600 text-[11px] mt-1 font-medium whitespace-normal [overflow-wrap:anywhere] leading-snug">
                                "{item.notes}"
                              </p>
                            )}
                            {item.location && (
                              <p className="text-[10px] text-slate-500 flex items-start gap-1 mt-1 whitespace-normal [overflow-wrap:anywhere] leading-snug">
                                <MapPin size={10} className="text-red-500 shrink-0 mt-0.5" />
                                <span className="min-w-0 [overflow-wrap:anywhere]">{item.location}</span>
                              </p>
                            )}
                            <p className="text-[10px] font-mono text-slate-400 mt-1 [overflow-wrap:anywhere]">
                              ID: {item.id}
                            </p>
                          </td>

                          {/* Student / Beneficiary Attribution */}
                          <td className="px-1.5 xl:px-3 py-3.5 align-top">
                            {!attr.isUnassigned ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900 [overflow-wrap:anywhere] leading-tight text-[11px] xl:text-xs min-w-0">
                                    {attr.studentName}
                                  </span>
                                  {attr.taskCategory && (
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border",
                                      attr.taskCategory === 'non_student'
                                        ? "bg-purple-50 text-purple-700 border-purple-200"
                                        : attr.taskCategory === 'student_custom'
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    )}>
                                      {attr.taskCategory === 'non_student' ? 'Non-Student' : attr.taskCategory === 'student_custom' ? 'Custom' : 'SOP'}
                                    </span>
                                  )}
                                  {attr.taskStatus && (
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                      getTaskStatusBadgeClasses(attr.taskStatus)
                                    )}>
                                      {attr.taskStatus.replace('_', ' ')}
                                    </span>
                                  )}
                                  {attr.isStudentTask && renderPackageBadge(attr.studentPackage)}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap leading-snug">
                                  {attr.taskTitle !== attr.studentName && (
                                    <span className="font-medium text-slate-700 [overflow-wrap:anywhere] min-w-0">{attr.taskTitle}</span>
                                  )}
                                  {attr.isStudentTask && attr.passportNumber !== '-' && (
                                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 [overflow-wrap:anywhere]">
                                      {attr.passportNumber}
                                    </span>
                                  )}
                                  {!attr.isStudentTask && attr.linkedTask?.nonStudentContact && (
                                    <span className="text-[10px] text-purple-700 font-semibold [overflow-wrap:anywhere]">
                                      • Contact: {attr.linkedTask.nonStudentContact}
                                    </span>
                                  )}
                                  {attr.isStudentTask && attr.counselorName !== '-' && (
                                    <span className="text-[10px] text-slate-500 [overflow-wrap:anywhere] min-w-0">
                                      • Counselor: <strong className="text-slate-700">{attr.counselorName}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] xl:text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Unassigned / General
                              </span>
                            )}
                          </td>

                          {/* Debit (Blank for Expense) */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right text-slate-300 font-mono align-top">
                            -
                          </td>

                          {/* Credit (Expense) */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right align-top">
                            <span className="text-[10.5px] xl:text-xs font-black text-red-600 bg-red-50 px-1.5 xl:px-2 py-0.5 rounded-lg border border-red-200 inline-block font-mono tabular-nums whitespace-nowrap">
                              {formatAccountingNumber(row.credit ?? 0)}
                            </span>
                          </td>

                          {/* Running Balance */}
                          <td className={cn(
                            "px-1.5 xl:px-3 py-3.5 text-right font-mono tabular-nums font-black align-top whitespace-nowrap text-[10.5px] xl:text-xs",
                            row.balance < 0 ? "text-red-600" : "text-slate-900"
                          )}>
                            {formatAccountingNumber(row.balance)}
                          </td>

                          {/* Settlement Status / Accountant Action */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right align-top">
                            {renderSettlementControl(item, true)}
                          </td>

                          {/* Watermarked Receipt Split-View Trigger */}
                          <td className="px-1.5 xl:px-3 py-3.5 text-right align-top">
                            {item.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewingReceipt(item)}
                                className="inline-flex items-center gap-1 px-1.5 xl:px-2.5 py-1 xl:py-1.5 bg-slate-900 hover:bg-red-600 text-white rounded-xl text-[10.5px] xl:text-[11px] font-bold transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
                                title="Open side-by-side receipt & mileage audit view"
                              >
                                <Eye size={12} className="shrink-0" />
                                <span>Audit</span>
                              </button>
                            ) : (
                              <span className="text-slate-300 italic text-[10px] whitespace-nowrap">No image</span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  })}

                  {accountingLedger.hasOpeningBalanceRow && ledgerSortOrder === 'desc' && (
                    <tr className="bg-slate-50/80 font-semibold">
                      {isAccountant && <td className="px-1.5 py-3 text-center align-top text-slate-300" />}
                      <td className="px-1.5 xl:px-3 py-3 text-slate-500 font-mono align-top leading-tight">
                        <span className="block text-[10px] uppercase text-slate-400">Before</span>
                        <span className="block text-[10.5px] xl:text-[11px] font-bold text-slate-700">{fromDate}</span>
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-slate-700 align-top [overflow-wrap:anywhere]">{selectedOfficerLabel}</td>
                      <td className="px-1.5 xl:px-3 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] xl:text-[11px] font-bold bg-slate-200/80 text-slate-700">
                            Opening Balance
                          </span>
                          <span className="text-slate-600 text-[11px]">Brought Forward</span>
                        </div>
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-slate-400 italic align-top [overflow-wrap:anywhere]">
                        Opening balance prior to {fromDate}
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-300 font-mono align-top">-</td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-300 font-mono align-top">-</td>
                      <td className={cn(
                        "px-1.5 xl:px-3 py-3 text-right font-mono tabular-nums font-black align-top whitespace-nowrap text-[11px] xl:text-xs",
                        accountingLedger.openingBalance < 0 ? "text-red-600" : "text-slate-900"
                      )}>
                        {formatAccountingNumber(accountingLedger.openingBalance)}
                      </td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-400 align-top">-</td>
                      <td className="px-1.5 xl:px-3 py-3 text-right text-slate-400 align-top">-</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white border-t-2 border-slate-700 text-xs font-extrabold">
                    <td colSpan={isAccountant ? 5 : 4} className="px-1.5 xl:px-3 py-4 uppercase tracking-wider">
                      TOTAL ({accountingLedger.rows.length} {accountingLedger.rows.length === 1 ? 'transaction' : 'transactions'})
                    </td>
                    <td className="px-1.5 xl:px-3 py-4 text-right font-mono tabular-nums text-[11px] xl:text-sm text-emerald-300 whitespace-nowrap">
                      {formatAccountingNumber(accountingLedger.totalDebit)}
                    </td>
                    <td className="px-1.5 xl:px-3 py-4 text-right font-mono tabular-nums text-[11px] xl:text-sm text-red-300 whitespace-nowrap">
                      {formatAccountingNumber(accountingLedger.totalCredit)}
                    </td>
                    <td className={cn(
                      "px-1.5 xl:px-3 py-4 text-right font-mono tabular-nums text-[11px] xl:text-sm whitespace-nowrap",
                      accountingLedger.endingBalance < 0 ? "text-red-300" : "text-white"
                    )}>
                      {formatAccountingNumber(accountingLedger.endingBalance)}
                    </td>
                    <td className="px-1.5 xl:px-3 py-4 text-right font-mono text-[10.5px] xl:text-xs text-teal-300 whitespace-nowrap">
                      {ledgerSettlementStats.settled}/{accountingLedger.rows.length} {t('settled') || 'Settled'}
                    </td>
                    <td className="px-1.5 xl:px-3 py-4" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Floating Sticky Accountant Bulk Settlement Action Bar */}
      {isAccountant && selectedCount > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-30 bg-slate-900 text-white rounded-2xl p-3.5 sm:px-5 shadow-2xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/40 text-xs font-extrabold">
              <CheckSquare size={14} />
              <span>{selectedCount} {t('selectedRecords') || 'Selected'}</span>
            </span>
            <span className="text-xs text-slate-300 font-medium">
              {selectedUnsettledRows.length > 0 && (
                <span>{selectedUnsettledRows.length} {t('unsettled') || 'Unsettled'}</span>
              )}
              {selectedUnsettledRows.length > 0 && selectedSettledRows.length > 0 && ' • '}
              {selectedSettledRows.length > 0 && (
                <span className="text-teal-300">{selectedSettledRows.length} {t('settled') || 'Settled'}</span>
              )}
            </span>
            {(selectedVisibleAmounts.debit > 0 || selectedVisibleAmounts.credit > 0) && (
              <span className="text-[11px] font-mono text-slate-300 bg-white/10 px-2.5 py-1 rounded-lg">
                {selectedVisibleAmounts.debit > 0 && `+RM ${formatAccountingNumber(selectedVisibleAmounts.debit)}`}
                {selectedVisibleAmounts.debit > 0 && selectedVisibleAmounts.credit > 0 && ' | '}
                {selectedVisibleAmounts.credit > 0 && `-RM ${formatAccountingNumber(selectedVisibleAmounts.credit)}`}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedUnsettledRows.length > 0 && (
              <button
                type="button"
                disabled={isBatchSettling}
                onClick={() => handleBulkSettle(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {isBatchSettling ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>{t('markSelectedSettled') || 'Mark Selected Settled'} ({selectedUnsettledRows.length})</span>
              </button>
            )}
            {selectedSettledRows.length > 0 && (
              <button
                type="button"
                disabled={isBatchSettling}
                onClick={() => handleBulkSettle(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {isBatchSettling ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                <span>{t('unsettleSelected') || 'Unsettle Selected'} ({selectedSettledRows.length})</span>
              </button>
            )}
            <button
              type="button"
              disabled={isBatchSettling}
              onClick={handleClearSelection}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              <X size={14} />
              <span>{t('clearSelection') || 'Clear'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Receipt Split-View Lightbox & Mileage Cross-Check Modal */}
      {viewingReceipt && (() => {
        const liveReceipt = expenses.find(e => e.id === viewingReceipt.id) || viewingReceipt;
        const officer = users.find(u => u.id === liveReceipt.userId);
        const attr = resolveExpenseAttribution(liveReceipt.taskId);
        const viewingVehicle = resolveExpenseVehicle(liveReceipt, vehicles);
        const receiptDateKey = toDateKeyUTC8(liveReceipt.timestamp || liveReceipt.createdAt);
        const isReceiptSettled = Boolean(liveReceipt.isSettled);
        const isReceiptSettling = Boolean(settlingRecordKeys[`expense:${liveReceipt.id}`]);

        return (
          <div
            className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-md animate-fade-in overflow-y-auto"
            onClick={() => setViewingReceipt(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-5xl w-full overflow-hidden shadow-2xl border border-slate-800 relative my-auto max-h-[92vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="p-3.5 sm:px-6 sm:py-4 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-slate-800 pt-safe">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 pr-2">
                  <button
                    type="button"
                    onClick={() => setViewingReceipt(null)}
                    className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 cursor-pointer"
                    title="Go back"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <Receipt size={18} className="text-red-500 shrink-0" />
                  <span className="font-bold text-xs sm:text-base truncate">Receipt & Financial Audit</span>
                  <span className="px-2 py-0.5 bg-red-600/20 text-red-300 border border-red-500/30 text-[10px] sm:text-xs font-bold rounded-full shrink-0">
                    {viewingReceipt.category}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] sm:text-[11px] font-bold rounded-full hidden md:inline-flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={12} /> Canvas2D GPS Watermarked
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <a
                    href={viewingReceipt.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                    title="Open high-res image in new tab"
                  >
                    <ExternalLink size={14} />
                    <span className="hidden sm:inline">Open Original</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setViewingReceipt(null)}
                    className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Split-View Body */}
              <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
                {/* Left Column: High-Resolution Watermarked Receipt Image */}
                <div className="lg:col-span-7 bg-slate-950 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[340px] lg:min-h-[520px] border-b lg:border-b-0 lg:border-r border-slate-800">
                  <img
                    src={viewingReceipt.receiptUrl}
                    alt="Watermarked Receipt Full Audit View"
                    className="max-h-[68vh] w-auto max-w-full object-contain rounded-xl shadow-2xl border border-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-3 text-center">
                    Inspect embedded Canvas2D timestamp & GPS coordinates burned into the bottom of the receipt image.
                  </p>
                </div>

                {/* Right Column: Transaction Metadata & Same-Date Mileage Cross-Check */}
                <div className="lg:col-span-5 p-5 sm:p-6 bg-white space-y-5 overflow-y-auto">
                  {/* Amount & Category Header */}
                  <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 block">
                        Claimed Expense Amount
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-red-600 font-mono">
                        {formatCurrency(liveReceipt.amount)}
                      </span>
                    </div>
                    <span className={cn("px-3 py-1 rounded-xl text-xs font-extrabold border", categoryColors[liveReceipt.category])}>
                      {liveReceipt.category}
                    </span>
                  </div>

                  {/* Settlement Status Card */}
                  <div className={cn(
                    "p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap",
                    isReceiptSettled
                      ? "bg-teal-50/90 border-teal-300 dark:bg-teal-950/60 dark:border-teal-700"
                      : "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700"
                  )}>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        {t('settlementStatus') || 'Settlement Status'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isReceiptSettled ? (
                          <CheckCircle2 size={15} className="text-teal-600 dark:text-teal-300 shrink-0" />
                        ) : (
                          <Clock size={15} className="text-slate-400 shrink-0" />
                        )}
                        <span className={cn(
                          "text-sm font-extrabold",
                          isReceiptSettled ? "text-teal-800 dark:text-teal-200" : "text-slate-700 dark:text-slate-300"
                        )}>
                          {isReceiptSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}
                        </span>
                      </div>
                      {isReceiptSettled && (liveReceipt.settledByName || liveReceipt.settledAt) && (
                        <p className="text-[11px] text-teal-800/80 dark:text-teal-300/80">
                          {liveReceipt.settledByName ? `${liveReceipt.settledByName}` : ''}
                          {liveReceipt.settledByName && liveReceipt.settledAt ? ' • ' : ''}
                          {liveReceipt.settledAt ? `${formatDateTimeUTC8(liveReceipt.settledAt)} UTC+8` : ''}
                        </p>
                      )}
                    </div>

                    {isAccountant && (
                      <button
                        type="button"
                        disabled={isReceiptSettling}
                        onClick={() => handleToggleSettled('expense', liveReceipt.id, !isReceiptSettled)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait",
                          isReceiptSettled
                            ? "bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            : "bg-teal-600 hover:bg-teal-700 text-white shadow-2xs"
                        )}
                      >
                        {isReceiptSettling ? (
                          <Loader2 size={13} className="animate-spin shrink-0" />
                        ) : (
                          <CheckCircle2 size={13} className="shrink-0" />
                        )}
                        <span>
                          {isReceiptSettled
                            ? (t('markAsUnsettled') || 'Mark as Unsettled')
                            : (t('markAsSettled') || 'Mark as Settled')}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Submitted Transaction Metadata */}
                  <div className="space-y-3 text-xs">
                    <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-1.5">
                      Submitted Transaction Metadata
                    </h4>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Transaction ID:</span>
                      <span className="font-mono text-slate-700 font-semibold">{liveReceipt.id}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Date & Time (UTC+8):</span>
                      <span className="font-mono text-slate-800 font-semibold">
                        {formatDateTimeUTC8(liveReceipt.timestamp || liveReceipt.createdAt)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Field Officer:</span>
                      <span className="font-bold text-slate-900">
                        {officer?.name || 'Unknown Officer'} (@{officer?.username || liveReceipt.userId})
                      </span>
                    </div>

                    {viewingVehicle && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500">{t('vehicleUsed')}:</span>
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                          <Car size={12} className="text-red-600 shrink-0" />
                          <span>{viewingVehicle.label}</span>
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-1 border-b border-slate-100 gap-2">
                      <span className="text-slate-500 shrink-0">Linked Task:</span>
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <span className="font-bold text-slate-900 text-right">{attr.taskTitle}</span>
                        {attr.taskCategory && (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border",
                            attr.taskCategory === 'non_student'
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : attr.taskCategory === 'student_custom'
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          )}>
                            {attr.taskCategory === 'non_student' ? 'Non-Student' : attr.taskCategory === 'student_custom' ? 'Student Custom' : 'Student SOP'}
                          </span>
                        )}
                        {attr.taskStatus && (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            getTaskStatusBadgeClasses(attr.taskStatus)
                          )}>
                            {attr.taskStatus.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">
                        {attr.isUnassigned ? 'Attribution:' : attr.isStudentTask ? 'Student & Package:' : 'Beneficiary:'}
                      </span>
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <span className="font-bold text-slate-900">{attr.studentName}</span>
                        {attr.isStudentTask && renderPackageBadge(attr.studentPackage)}
                      </div>
                    </div>

                    {!attr.isStudentTask && attr.linkedTask?.nonStudentContact && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500">Beneficiary Contact:</span>
                        <span className="font-bold text-purple-700 text-right">{attr.linkedTask.nonStudentContact}</span>
                      </div>
                    )}

                    {attr.isStudentTask && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500">Student Counselor:</span>
                        <span className="font-bold text-slate-900 text-right">{attr.counselorName}</span>
                      </div>
                    )}

                    {attr.passportNumber !== '-' && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500">Student Passport:</span>
                        <span className="font-mono font-bold text-slate-800">{attr.passportNumber}</span>
                      </div>
                    )}

                    {liveReceipt.notes && (
                      <div className="flex justify-between items-start py-1 border-b border-slate-100 gap-4">
                        <span className="text-slate-500 shrink-0">Officer Notes:</span>
                        <span className="font-medium text-slate-800 text-right">"{liveReceipt.notes}"</span>
                      </div>
                    )}

                    <div className="flex justify-between items-start py-1 gap-4">
                      <span className="text-slate-500 shrink-0">GPS Coordinates:</span>
                      <span className="font-mono text-slate-700 text-right break-all">
                        {liveReceipt.location || 'Location unavailable'}
                      </span>
                    </div>
                  </div>

                  {/* Fuel Expense Same-Date VehicleLogs Mileage Cross-Check */}
                  {viewingReceipt.category === 'Fuel' && (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gauge size={16} className="text-amber-700" />
                          <h4 className="font-extrabold text-amber-950 text-xs uppercase tracking-wider">
                            Same-Date Mileage Cross-Check ({receiptDateKey})
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          {viewingReceiptMileageLogs.length} {viewingReceiptMileageLogs.length === 1 ? 'Trip Log' : 'Trip Logs'}
                        </span>
                      </div>

                      {viewingReceiptMileageLogs.length === 0 ? (
                        <div className="p-3 rounded-xl bg-white border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            No <code className="font-mono font-bold">vehicleLogs</code> odometer entry found for {officer?.name || 'this officer'} on {receiptDateKey}.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {viewingReceiptMileageLogs.map(log => {
                            const veh = vehicles.find(v => v.id === log.vehicleId);
                            const hasEnd = log.endKm !== undefined && log.endKm !== null;
                            const deltaKm = hasEnd ? Number(log.endKm) - Number(log.startKm) : null;

                            return (
                              <div key={log.id} className="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <Car size={13} className="text-red-600" />
                                    <span>{veh?.name || 'Fleet Vehicle'} ({veh?.plateNumber || log.vehicleId})</span>
                                  </span>
                                  {deltaKm !== null && deltaKm >= 0 ? (
                                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-black font-mono text-[11px]">
                                      +{deltaKm} km driven
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                                      Session In Progress
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 font-mono text-[11px]">
                                  <div>
                                    <span className="text-slate-400 font-sans block text-[10px]">Start Odometer:</span>
                                    <span className="font-bold text-slate-800">{log.startKm} km</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 font-sans block text-[10px]">End Odometer:</span>
                                    <span className="font-bold text-slate-800">{hasEnd ? `${log.endKm} km` : 'Active'}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
