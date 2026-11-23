// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Wallet as WalletIcon, RotateCcw, DollarSign, Plus, Receipt, AlertTriangle,
  ExternalLink, Search, RefreshCw, MapPin, Check, Camera,
  X, ArrowUpRight, ArrowDownRight, ArrowLeft, Fuel, Car, Smartphone,
  HeartPulse, ParkingCircle, MoreHorizontal, ArrowRightLeft, ArrowUpDown,
  Utensils, Hotel, Image as ImageIcon, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import { cn } from '../components/layout/Layout';
import { Expense, ExpenseCategory, TopUpRecord } from '../types';
import { addWatermark, getCurrentGpsLocation, prepareImageFile } from '../utils/watermark';
import { LocalImagePreview } from '../components/LocalImagePreview';
import { formatCurrency, formatAmountWithSign } from '../utils/currency';
import { detectActiveUserVehicle, isVehicleExpenseCategory, resolveExpenseVehicle, VehicleDetectionSource } from '../utils/vehicleDetection';
import { buildAccountingLedger, formatAccountingNumber, formatDateTimeUTC8, round2, toDateKeyUTC8 } from '../utils/walletLedger';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskStatusBadgeClasses,
  getTaskSubjectName,
  isOpenTask,
} from '../utils/taskClassification';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import toast from 'react-hot-toast';

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

type UnifiedLedgerItem =
  | (TopUpRecord & { type: 'topup' })
  | (Expense & { type: 'expense' });

export default function FieldOfficerWallet() {
  const { currentUser, users, tasks, presets, students, vehicles, vehicleLogs, expenses, topups, logExpense, logTopUp, t } = useAppContext();

  // Search & Filter State
  const isFieldOfficer = currentUser?.role === 'field_officer';
  const fieldOfficers = useMemo(() => users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>(() => isFieldOfficer && currentUser?.id ? currentUser.id : 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'topup' | 'expense'>('all');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'settled' | 'unsettled'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [linkedTaskFilter, setLinkedTaskFilter] = useState<'all' | 'task_linked' | 'no_task'>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewingReceipt, setViewingReceipt] = useState<Expense | null>(null);

  // Money Spent (Expense) Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseTaskId, setExpenseTaskId] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Tolls');
  const [expenseVehicleId, setExpenseVehicleId] = useState('');
  const [hasManualVehicleSelection, setHasManualVehicleSelection] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseReceiptFile, setExpenseReceiptFile] = useState<File | null>(null);
  const [isPreparingReceipt, setIsPreparingReceipt] = useState(false);
  const expenseCameraInputRef = useRef<HTMLInputElement>(null);
  const expenseGalleryInputRef = useRef<HTMLInputElement>(null);
  const [expenseLocationStr, setExpenseLocationStr] = useState('Acquiring GPS...');
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const handleReceiptFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;

    setIsPreparingReceipt(true);
    try {
      const prepared = await prepareImageFile(rawFile);
      setExpenseReceiptFile(prepared);
    } catch (err: any) {
      console.error('Receipt image preparation failed:', err);
      toast.error(err?.message || 'Could not load selected image. Please try another photo.');
    } finally {
      setIsPreparingReceipt(false);
    }
  };

  // Money Received (Top-up) Modal State
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpSource, setTopUpSource] = useState('Office Petty Cash');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);

  // Active tasks assigned to officer
  const myActiveTasks = tasks.filter(
    t => t.assigneeId === currentUser?.id && isOpenTask(t)
  );

  const linkedExpenseTask = useMemo(() => {
    if (!expenseTaskId || expenseTaskId === 'unassigned') return undefined;
    return tasks.find(t => t.id === expenseTaskId);
  }, [tasks, expenseTaskId]);

  const detectedVehicleResult = useMemo(() => {
    return detectActiveUserVehicle({
      userId: currentUser?.id,
      vehicles,
      vehicleLogs,
      task: linkedExpenseTask,
      activeTasks: myActiveTasks,
    });
  }, [currentUser?.id, vehicles, vehicleLogs, linkedExpenseTask, myActiveTasks]);

  const sortedFleetVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const statusRank = (s: string) => (s === 'active' ? 0 : s === 'maintenance' ? 1 : 2);
      const diff = statusRank(a.status) - statusRank(b.status);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [vehicles]);

  const getDetectionSourceLabel = (source: VehicleDetectionSource): string => {
    switch (source) {
      case 'active_trip':
        return t('detectionActiveTrip');
      case 'checked_out':
        return t('detectionCheckedOut');
      case 'task':
        return t('detectionTaskAssigned');
      case 'today_trip':
        return t('detectionTodayTrip');
      case 'assigned':
        return t('detectionAssignedDriver');
      default:
        return '';
    }
  };

  const [expenseSubmitStage, setExpenseSubmitStage] = useState<'gps' | 'watermark' | 'storage' | null>(null);

  useEffect(() => {
    if (isExpenseModalOpen) {
      if (!expenseTaskId) {
        setExpenseTaskId(myActiveTasks.length > 0 ? myActiveTasks[0].id : 'unassigned');
      }
      setIsAcquiringGps(true);
      getCurrentGpsLocation()
        .then(res => setExpenseLocationStr(res.locationStr))
        .catch((err) => {
          console.warn('Wallet GPS lookup:', err);
          setExpenseLocationStr('GPS Lock Required (Tap Refresh)');
        })
        .finally(() => setIsAcquiringGps(false));
    }
  }, [isExpenseModalOpen]);

  // Auto-detect vehicle when logging Fuel, Tolls, or Parking (unless manually changed in this session)
  useEffect(() => {
    if (!isExpenseModalOpen) {
      setHasManualVehicleSelection(false);
      setExpenseVehicleId('');
      return;
    }
    if (isVehicleExpenseCategory(expenseCategory) && !hasManualVehicleSelection) {
      setExpenseVehicleId(detectedVehicleResult.vehicle?.id || '');
    }
  }, [isExpenseModalOpen, expenseCategory, detectedVehicleResult.vehicle?.id, hasManualVehicleSelection]);

  // Handle Money Spent (Expense) Submission
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(expenseAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid expense amount.');
      return;
    }
    if (!expenseReceiptFile) {
      toast.error(t('receiptRequired'));
      return;
    }

    setIsSubmittingExpense(true);
    setExpenseSubmitStage('gps');
    try {
      // 1. GPS Lock: Use already resolved active location or fetch cached/fast GPS lock
      let activeLocation = expenseLocationStr;
      if (!activeLocation || activeLocation.includes('Required') || activeLocation.includes('Unavailable') || activeLocation.includes('Fetching')) {
        try {
          const gpsRes = await getCurrentGpsLocation();
          activeLocation = gpsRes.locationStr;
          setExpenseLocationStr(gpsRes.locationStr);
        } catch (gpsErr: any) {
          if (!activeLocation || activeLocation.includes('Required') || activeLocation.includes('Unavailable')) {
            throw new Error('GPS access is mandatory for visual audits. Please enable location permissions.');
          }
        }
      }

      setExpenseSubmitStage('watermark');
      // 2. Hardware-accelerated Canvas2D Watermark with GPS and UTC/local timestamp (0.80 JPEG)
      const watermarkedReceipt = await addWatermark(expenseReceiptFile, activeLocation);

      setExpenseSubmitStage('storage');
      // 3. Upload to Cloud Storage
      const isGeneral = !expenseTaskId || expenseTaskId === 'unassigned';
      const storagePrefix = isGeneral ? 'general' : expenseTaskId;
      const storagePath = `receipts/expenses/${storagePrefix}_${Date.now()}_${watermarkedReceipt.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, watermarkedReceipt);
      const downloadUrl = await getDownloadURL(fileRef);

      // 4. Batched Firestore write + instant wallet deduction
      const isVehicleExpense = isVehicleExpenseCategory(expenseCategory);
      const selectedVehicle = isVehicleExpense && expenseVehicleId
        ? vehicles.find(v => v.id === expenseVehicleId)
        : undefined;

      await logExpense({
        taskId: isGeneral ? null : expenseTaskId,
        amount: numAmount,
        category: expenseCategory,
        vehicleId: isVehicleExpense ? (selectedVehicle?.id || null) : null,
        vehicleName: isVehicleExpense ? selectedVehicle?.name : undefined,
        vehiclePlateNumber: isVehicleExpense ? selectedVehicle?.plateNumber : undefined,
        notes: expenseNotes.trim() || undefined,
        receiptUrl: downloadUrl,
        location: activeLocation,
        timestamp: new Date().toISOString()
      });

      toast.success(t('expenseSuccess'));
      setIsExpenseModalOpen(false);
      setExpenseAmount('');
      setExpenseNotes('');
      setExpenseReceiptFile(null);
      setExpenseCategory('Tolls');
      setExpenseTaskId('');
      setExpenseVehicleId('');
      setHasManualVehicleSelection(false);
    } catch (err: any) {
      console.error('Wallet expense submission error:', err);
      toast.error(err.message || 'Failed to record expense. GPS access is mandatory.');
    } finally {
      setIsSubmittingExpense(false);
      setExpenseSubmitStage(null);
    }
  };

  // Handle Money Received (Top-up) Submission
  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(topUpAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid received amount.');
      return;
    }

    setIsSubmittingTopUp(true);
    try {
      await logTopUp({
        amount: numAmount,
        source: topUpSource,
        notes: topUpNotes.trim() || undefined,
        timestamp: new Date().toISOString()
      });

      toast.success(t('topUpSuccess'));
      setIsTopUpModalOpen(false);
      setTopUpAmount('');
      setTopUpNotes('');
      setTopUpSource('Office Petty Cash');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to record received money');
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  // Data Calculations
  const myExpenses: Expense[] = useMemo(() => {
    return expenses.filter(e => selectedOfficerId === 'all' ? true : e.userId === selectedOfficerId);
  }, [expenses, selectedOfficerId]);

  const myTopups: TopUpRecord[] = useMemo(() => {
    return topups.filter(t => selectedOfficerId === 'all' ? true : t.userId === selectedOfficerId);
  }, [topups, selectedOfficerId]);

  const totalSpent = round2(myExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  const totalReceived = round2(myTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));
  const displayedUser = selectedOfficerId !== 'all' ? users.find(u => u.id === selectedOfficerId) : currentUser;
  const balance = round2(displayedUser?.walletBalance ?? currentUser?.walletBalance ?? 0);
  const isLowBalance = balance < 50;

  // Build Unified Chronological Ledger
  const ledgerItems: UnifiedLedgerItem[] = useMemo(() => {
    return [
      ...myTopups.map(t => ({ ...t, type: 'topup' as const })),
      ...myExpenses.map(e => ({ ...e, type: 'expense' as const }))
    ];
  }, [myTopups, myExpenses]);

  const hasSubLedgerFilter = useMemo(
    () =>
      typeFilter !== 'all' ||
      settlementFilter !== 'all' ||
      selectedCategory !== 'all' ||
      linkedTaskFilter !== 'all' ||
      minAmount.trim() !== '' ||
      maxAmount.trim() !== '' ||
      searchTerm.trim() !== '',
    [typeFilter, settlementFilter, selectedCategory, linkedTaskFilter, minAmount, maxAmount, searchTerm]
  );

  // Accounting Ledger with Debit (Top-Up), Credit (Expense), Running Balance, and Totals
  const accountingLedger = useMemo(() => {
    return buildAccountingLedger<UnifiedLedgerItem>({
      entries: ledgerItems,
      officerId: selectedOfficerId,
      fromDate,
      toDate,
      hasSubLedgerFilter,
      matchesSubFilters: (item) => {
        // 1. Transaction Type Filter
        if (typeFilter !== 'all' && item.type !== typeFilter) return false;

        // 2. Settlement Status Filter
        if (settlementFilter !== 'all') {
          const isSettled = Boolean(item.isSettled);
          if (settlementFilter === 'settled' && !isSettled) return false;
          if (settlementFilter === 'unsettled' && isSettled) return false;
        }

        // 3. Category Filter
        if (selectedCategory !== 'all') {
          if (item.type !== 'expense') return false;
          if (item.category !== selectedCategory) return false;
        }

        // 3. Linked Task Filter
        if (linkedTaskFilter !== 'all') {
          if (item.type === 'topup') {
            if (linkedTaskFilter === 'task_linked') return false;
          } else {
            const hasTask = Boolean(item.taskId && item.taskId !== 'unassigned');
            if (linkedTaskFilter === 'task_linked' && !hasTask) return false;
            if (linkedTaskFilter === 'no_task' && hasTask) return false;
          }
        }

        // 4. Amount Range Filter
        if (minAmount.trim() !== '') {
          const minVal = Number(minAmount);
          if (!isNaN(minVal) && Number(item.amount) < minVal) return false;
        }
        if (maxAmount.trim() !== '') {
          const maxVal = Number(maxAmount);
          if (!isNaN(maxVal) && Number(item.amount) > maxVal) return false;
        }

        // 5. Search Query Filter
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          if (item.type === 'topup') {
            const matchesSource = item.source?.toLowerCase().includes(q);
            const matchesNotes = item.notes?.toLowerCase().includes(q);
            return Boolean(matchesSource || matchesNotes);
          } else {
            const linkedTask = item.taskId && item.taskId !== 'unassigned'
              ? tasks.find(t => t.id === item.taskId)
              : undefined;
            const veh = resolveExpenseVehicle(item, vehicles);
            const matchesCat = item.category.toLowerCase().includes(q);
            const matchesNotes = item.notes?.toLowerCase().includes(q);
            const matchesLoc = item.location?.toLowerCase().includes(q);
            const matchesVeh = veh?.label.toLowerCase().includes(q);
            const matchesTask = linkedTask
              ? (
                  getTaskDisplayTitle(linkedTask, presets, 'en').toLowerCase().includes(q) ||
                  getTaskSubjectName(linkedTask, students, 'en').toLowerCase().includes(q) ||
                  (linkedTask.nonStudentContact || '').toLowerCase().includes(q)
                )
              : false;
            return Boolean(matchesCat || matchesNotes || matchesLoc || matchesVeh || matchesTask);
          }
        }

        return true;
      },
    });
  }, [
    ledgerItems,
    selectedOfficerId,
    fromDate,
    toDate,
    hasSubLedgerFilter,
    typeFilter,
    settlementFilter,
    selectedCategory,
    linkedTaskFilter,
    minAmount,
    maxAmount,
    searchTerm,
    vehicles,
    tasks,
    presets,
    students,
  ]);

  const displayedLedgerRows = useMemo(() => {
    return ledgerSortOrder === 'asc'
      ? accountingLedger.rows
      : [...accountingLedger.rows].reverse();
  }, [accountingLedger.rows, ledgerSortOrder]);

  const overallSettlementStats = useMemo(() => {
    let settled = 0;
    for (const item of ledgerItems) {
      if (item.isSettled) settled++;
    }
    return {
      settled,
      unsettled: ledgerItems.length - settled,
    };
  }, [ledgerItems]);

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <WalletIcon className="text-red-600" size={28} />
            <span>{t('wallet')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Self-service ledger: Record funds received (Debit) and operational expenses (Credit)
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Money Received (Top-up) Button */}
          <button
            type="button"
            onClick={() => setIsTopUpModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-2xl shadow-md shadow-emerald-600/20 transition-all active:scale-95 text-xs sm:text-sm"
          >
            <ArrowUpRight size={16} />
            <span>{t('moneyReceived')}</span>
          </button>

          {/* Money Spent (Expense) Button */}
          <button
            type="button"
            onClick={() => {
              if (myActiveTasks.length > 0) {
                setExpenseTaskId(myActiveTasks[0].id);
              }
              setIsExpenseModalOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-2xl shadow-md shadow-red-600/20 transition-all active:scale-95 text-xs sm:text-sm"
          >
            <ArrowDownRight size={16} />
            <span>{t('moneySpent')}</span>
          </button>
        </div>
      </div>

      {/* Main Balance & Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance Hero Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-blue-900/50 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-1">
                  {t('currentBalance')}
                </span>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                  {formatCurrency(balance)}
                </div>
              </div>

              <div className="p-3 bg-white/10 rounded-2xl border border-white/10 text-red-400 backdrop-blur-md">
                <WalletIcon size={28} />
              </div>
            </div>

            {isLowBalance ? (
              <div className="mt-4 p-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-amber-200">
                <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                <span>{t('lowBalanceWarning')} (&lt; RM 50.00)</span>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 w-fit">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Active Funds &bull; Ready for Field Operations</span>
              </div>
            )}
          </div>

          <div className="relative z-10 pt-4 mt-4 border-t border-slate-800/80 flex justify-between items-center text-xs text-slate-400">
            <span>Logistics Officer: <strong className="text-slate-200">{currentUser?.name}</strong></span>
            <span>ID: #{currentUser?.id}</span>
          </div>
        </div>

        {/* Quick Float Stats */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
              Petty Cash Summary
            </span>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                    <ArrowUpRight size={14} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{t('totalReceived')} (Debit)</span>
                </div>
                <span className="text-sm font-extrabold text-emerald-700">{formatAmountWithSign(totalReceived, 'topup')}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-red-50/70 rounded-xl border border-red-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-100 text-red-700 rounded-lg">
                    <ArrowDownRight size={14} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{t('totalSpent')} (Credit)</span>
                </div>
                <span className="text-sm font-extrabold text-red-700">{formatAmountWithSign(totalSpent, 'expense')}</span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 dark:bg-teal-950/60 dark:border-teal-800 dark:text-teal-200 font-bold">
                  <CheckCircle2 size={11} className="shrink-0" />
                  <span>{t('settled') || 'Settled'}: {overallSettlementStats.settled}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-bold">
                  <Clock size={11} className="shrink-0" />
                  <span>{t('unsettled') || 'Unsettled'}: {overallSettlementStats.unsettled}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Active Tasks: <strong>{myActiveTasks.length}</strong></span>
            <span>Threshold: <strong>RM 50.00</strong></span>
          </div>
        </div>
      </div>

      {/* Self-Managed Chronological Ledger */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter & Search Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <ArrowRightLeft size={20} className="text-slate-600" />
              <span>Personal Transaction Ledger</span>
            </h3>
            <p className="text-xs text-slate-500">Debit (Top-Up), Credit (Expense), and running Balance</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Type Filter Buttons */}
            <div className="flex bg-slate-200/80 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={cn("px-3 py-1 rounded-lg transition-colors", typeFilter === 'all' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('topup')}
                className={cn("px-3 py-1 rounded-lg transition-colors", typeFilter === 'topup' ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              >
                Debit (Top-Up)
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('expense')}
                className={cn("px-3 py-1 rounded-lg transition-colors", typeFilter === 'expense' ? "bg-white text-red-700 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              >
                Credit (Spent)
              </button>
            </div>

            {/* Category Filter for Expenses */}
            {typeFilter !== 'topup' && (
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
              >
                <option value="all">All Categories</option>
                <option value="Tolls">Tolls</option>
                <option value="Fuel">Fuel</option>
                <option value="SIM Card">SIM Card</option>
                <option value="Medical Fees">Medical Fees</option>
                <option value="Parking">Parking</option>
                <option value="Meals">Meals</option>
                <option value="Hotel">Hotel</option>
                <option value="Other">Other</option>
              </select>
            )}

            {/* Settlement Status Filter */}
            <select
              value={settlementFilter}
              onChange={e => setSettlementFilter(e.target.value as 'all' | 'settled' | 'unsettled')}
              aria-label={t('settlementStatus') || 'Settlement Status'}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              <option value="all">{t('settlementStatus') || 'Settlement'}: {t('all') || 'All'}</option>
              <option value="settled">{t('settledOnly') || 'Settled Only'}</option>
              <option value="unsettled">{t('unsettledOnly') || 'Unsettled Only'}</option>
            </select>

            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() => setLedgerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              title="Toggle chronological order"
            >
              <ArrowUpDown size={13} className="text-slate-500" />
              <span>{ledgerSortOrder === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}</span>
            </button>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>
          </div>
        </div>

        {/* Settlement Legend & Live Count Strip */}
        <div className="px-5 py-2.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-900 font-bold">{accountingLedger.rows.length}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{ledgerItems.length}</strong> transactions
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

        {/* Ledger Entries List */}
        {accountingLedger.rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-600 text-base">No transactions recorded</p>
            <p className="text-xs text-slate-400 mt-1">Use the "Money Received" or "Money Spent" buttons above to manage your wallet.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {displayedLedgerRows.map(row => {
                const item = row.item;
                const isSettled = Boolean(item.isSettled);
                const settledRowClass = isSettled
                  ? "bg-teal-100/70 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/70 border-s-4 border-s-teal-500 dark:border-s-teal-400"
                  : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40";
                const settlementBadge = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border",
                      isSettled
                        ? "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                    )}
                  >
                    {isSettled ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                    <span>{isSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}</span>
                  </span>
                );

                if (item.type === 'topup') {
                  return (
                    <div key={item.id} className={cn("p-4 sm:p-5 flex items-center justify-between gap-4 transition-colors", settledRowClass)}>
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <ArrowUpRight size={22} />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Top-Up (Debit)
                            </span>
                            {settlementBadge}
                            <span className="text-xs font-semibold text-slate-700">
                              {item.source || 'Office Petty Cash'}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              &bull; {formatDateTimeUTC8(item.timestamp || item.createdAt).slice(0, 16)}
                            </span>
                          </div>

                          {item.notes && (
                            <p className="text-xs text-slate-600 mt-1 truncate">
                              "{item.notes}"
                            </p>
                          )}
                          {isSettled && (item.settledByName || item.settledAt) && (
                            <p className="text-[11px] text-teal-800/90 dark:text-teal-300/90 font-medium mt-1">
                              {t('settled') || 'Settled'}
                              {item.settledByName ? ` • ${item.settledByName}` : ''}
                              {item.settledAt ? ` • ${formatDateTimeUTC8(item.settledAt).slice(0, 16)} UTC+8` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base sm:text-lg font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-2xl border border-emerald-200 inline-block font-mono">
                          +{formatAccountingNumber(row.debit ?? 0)}
                        </div>
                        <div className={cn(
                          "text-[11px] font-bold font-mono mt-1",
                          row.balance < 0 ? "text-red-600" : "text-slate-600"
                        )}>
                          Bal: RM {formatAccountingNumber(row.balance)}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Expense item
                  const linkedTask = tasks.find(t => t.id === item.taskId);
                  const taskPreset = presets.find(p => p.id === linkedTask?.presetId);
                  const student = students.find(s => s.id === linkedTask?.studentId);
                  const resolvedVeh = resolveExpenseVehicle(item, vehicles);
                  const Icon = categoryIcons[item.category] || MoreHorizontal;

                  return (
                    <div key={item.id} className={cn("p-4 sm:p-5 flex items-center justify-between gap-4 transition-colors", settledRowClass)}>
                      <div className="flex items-center gap-3.5 min-w-0">
                        {item.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => setViewingReceipt(item)}
                            className="w-12 h-12 rounded-2xl border border-slate-200 overflow-hidden shrink-0 group relative hover:opacity-90 transition-opacity shadow-2xs bg-slate-100"
                            title="Inspect watermarked receipt"
                          >
                            <img src={item.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <ExternalLink size={14} />
                            </div>
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                            <Icon size={20} />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("px-2.5 py-0.5 rounded-md text-xs font-bold border", categoryColors[item.category] || 'bg-slate-50 text-slate-700 border-slate-200')}>
                              {item.category} (Credit)
                            </span>
                            {settlementBadge}
                            {linkedTask && (() => {
                              const taskCat = getTaskCategory(linkedTask);
                              return (
                                <>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider",
                                    taskCat === 'non_student'
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : taskCat === 'student_custom'
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  )}>
                                    {taskCat === 'non_student' ? 'Non-Student' : taskCat === 'student_custom' ? 'Student Custom' : 'Student SOP'}
                                  </span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider",
                                    getTaskStatusBadgeClasses(linkedTask.status)
                                  )}>
                                    {linkedTask.status.replace('_', ' ')}
                                  </span>
                                </>
                              );
                            })()}
                            {resolvedVeh && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <Car size={11} className="text-red-600 shrink-0" />
                                <span>{resolvedVeh.label}</span>
                              </span>
                            )}
                            <span className="text-xs text-slate-400 font-mono">
                              {formatDateTimeUTC8(item.timestamp || item.createdAt).slice(0, 16)}
                            </span>
                          </div>

                          <p className="font-semibold text-slate-800 text-sm mt-1 truncate">
                            {item.taskId && item.taskId !== 'unassigned' && linkedTask
                              ? `${getTaskDisplayTitle(linkedTask, presets, 'en')} • ${getTaskSubjectName(linkedTask, students, 'en')}`
                              : 'General Expense (No Task Assigned)'}
                          </p>

                          {item.notes && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              "{item.notes}"
                            </p>
                          )}

                          {item.location && (
                            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin size={10} className="text-red-500 shrink-0" />
                              <span className="truncate">{item.location}</span>
                            </p>
                          )}

                          {isSettled && (item.settledByName || item.settledAt) && (
                            <p className="text-[11px] text-teal-800/90 dark:text-teal-300/90 font-medium mt-0.5">
                              {t('settled') || 'Settled'}
                              {item.settledByName ? ` • ${item.settledByName}` : ''}
                              {item.settledAt ? ` • ${formatDateTimeUTC8(item.settledAt).slice(0, 16)} UTC+8` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base sm:text-lg font-black text-red-600 bg-red-50 px-3 py-1 rounded-2xl border border-red-200 inline-block font-mono">
                          -{formatAccountingNumber(row.credit ?? 0)}
                        </div>
                        <div className={cn(
                          "text-[11px] font-bold font-mono mt-1",
                          row.balance < 0 ? "text-red-600" : "text-slate-600"
                        )}>
                          Bal: RM {formatAccountingNumber(row.balance)}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* Totals Summary Footer */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left sm:text-right">
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                  Total Debit (Top-Up)
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-white">
                  RM {formatAccountingNumber(accountingLedger.totalDebit)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block">
                  Total Credit (Expense)
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-white">
                  RM {formatAccountingNumber(accountingLedger.totalCredit)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                  Ending Balance
                </span>
                <span className={cn(
                  "text-sm sm:text-base font-black font-mono",
                  accountingLedger.endingBalance < 0 ? "text-red-300" : "text-emerald-300"
                )}>
                  RM {formatAccountingNumber(accountingLedger.endingBalance)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 block">
                  {t('settled') || 'Settled'}
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-teal-300">
                  {ledgerSettlementStats.settled}/{accountingLedger.rows.length}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: MONEY RECEIVED (TOP-UP)                                         */}
      {/* ========================================================================= */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="p-5 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600/30 border border-emerald-500/40 rounded-xl text-emerald-400">
                  <ArrowUpRight size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('logTopUp')}</h3>
                  <p className="text-xs text-emerald-200">Record cash/funds received into your wallet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingTopUp) setIsTopUpModalOpen(false);
                }}
                className="text-slate-400 hover:text-white p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleTopUpSubmit} className="p-5 space-y-4">
              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Amount Received (RM) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                    RM
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="50.00"
                    value={topUpAmount}
                    onChange={e => setTopUpAmount(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex gap-2">
                {['20', '50', '100', '200'].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopUpAmount(amt)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                      topUpAmount === amt
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    +RM {amt}
                  </button>
                ))}
              </div>

              {/* Source Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('topUpSource')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={topUpSource}
                  onChange={e => setTopUpSource(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="Office Petty Cash">🏢 {t('officeDisbursement')}</option>
                  <option value="Coordinator Handover">👤 {t('coordinatorTransfer')}</option>
                  <option value="ATM / Bank Withdrawal">🏧 {t('atmWithdrawal')}</option>
                  <option value="Emergency Cash Advance">🚨 Emergency Cash Advance</option>
                  <option value="Other">💼 Other Source</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received from Coordinator Omar at KLIA"
                  value={topUpNotes}
                  onChange={e => setTopUpNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              {/* Projected Balance Preview */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs flex justify-between items-center">
                <span className="text-emerald-800 font-medium">New Wallet Balance:</span>
                <span className="font-extrabold text-sm text-emerald-700">
                  {formatCurrency(balance + (parseFloat(topUpAmount) || 0))}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmittingTopUp}
                  onClick={() => setIsTopUpModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTopUp || !topUpAmount}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingTopUp ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Add to Balance</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MONEY SPENT (EXPENSE WITH WATERMARKED RECEIPT)                  */}
      {/* ========================================================================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-950 to-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600/30 border border-red-500/40 rounded-xl text-red-400">
                  <Receipt size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('logExpense')}</h3>
                  <p className="text-xs text-slate-300">Deduct expense & stamp GPS watermark onto receipt</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingExpense) setIsExpenseModalOpen(false);
                }}
                className="text-slate-400 hover:text-white p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-5 sm:p-6 space-y-4">
              {/* Linked Task Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Linked Task <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
                </label>
                <select
                  value={expenseTaskId || 'unassigned'}
                  onChange={e => setExpenseTaskId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  <option value="unassigned">📌 No Task Assigned (General Expense)</option>
                  {myActiveTasks.map(tItem => {
                    const cat = getTaskCategory(tItem);
                    const catTag = cat === 'non_student' ? 'Non-Student' : cat === 'student_custom' ? 'Custom' : 'SOP';
                    return (
                      <option key={tItem.id} value={tItem.id}>
                        [{catTag}] {getTaskDisplayTitle(tItem, presets, 'en')} - {getTaskSubjectName(tItem, students, 'en')} ({tItem.status.replace('_', ' ')})
                      </option>
                    );
                  })}
                </select>
                {myActiveTasks.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    No active tasks currently assigned. This expense will be recorded as a general expense.
                  </p>
                )}
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('expenseCategory')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  <option value="Tolls">🚗 {t('tolls')}</option>
                  <option value="Fuel">⛽ {t('fuel')}</option>
                  <option value="SIM Card">📶 {t('simCard')}</option>
                  <option value="Medical Fees">🏥 {t('medicalFees')}</option>
                  <option value="Parking">🅿️ {t('parking')}</option>
                  <option value="Meals">🍽️ {t('meals')}</option>
                  <option value="Hotel">🏨 {t('hotel')}</option>
                  <option value="Other">💼 {t('otherExpense')}</option>
                </select>
              </div>

              {/* Auto-detected & Editable Vehicle Selector (Fuel, Tolls & Parking) */}
              {isVehicleExpenseCategory(expenseCategory) && (() => {
                const detectedVeh = detectedVehicleResult.vehicle;
                const isAutoMatch = Boolean(detectedVeh && expenseVehicleId === detectedVeh.id && !hasManualVehicleSelection);
                const isManualOverride = Boolean(hasManualVehicleSelection && detectedVeh && expenseVehicleId !== detectedVeh.id);

                return (
                  <div className={cn(
                    "p-3.5 rounded-2xl border space-y-2 transition-colors",
                    expenseVehicleId
                      ? "bg-blue-50/70 border-blue-200"
                      : "bg-amber-50/70 border-amber-200"
                  )}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <Car size={14} className="text-red-600" />
                        <span>{t('vehicleUsed')}</span>
                      </label>

                      {isAutoMatch && detectedVeh ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Sparkles size={10} />
                          <span>
                            {t('autoDetected')}
                            {detectedVehicleResult.source ? ` • ${getDetectionSourceLabel(detectedVehicleResult.source)}` : ''}
                          </span>
                        </span>
                      ) : isManualOverride && detectedVeh ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {t('changedManually')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setHasManualVehicleSelection(false);
                              setExpenseVehicleId(detectedVeh.id);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 hover:text-red-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            <RotateCcw size={10} />
                            <span>{t('resetToAutoDetected')}</span>
                          </button>
                        </div>
                      ) : !expenseVehicleId ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {sortedFleetVehicles.length > 0 ? 'Select Vehicle' : 'No Fleet Cars'}
                        </span>
                      ) : null}
                    </div>

                    <select
                      value={expenseVehicleId}
                      onChange={e => {
                        const nextVal = e.target.value;
                        setExpenseVehicleId(nextVal);
                        setHasManualVehicleSelection(nextVal !== (detectedVeh?.id || ''));
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                    >
                      <option value="">— {t('selectVehicleOptional')} —</option>
                      {sortedFleetVehicles.map(v => {
                        const isDetectedOption = detectedVeh?.id === v.id;
                        const statusSuffix = v.status !== 'active' ? ` [${t(v.status)}]` : '';
                        const detectedSuffix = isDetectedOption ? ` (${t('autoDetected')})` : '';
                        return (
                          <option key={v.id} value={v.id}>
                            🚗 {v.name} ({v.plateNumber}){detectedSuffix}{statusSuffix}
                          </option>
                        );
                      })}
                    </select>

                    <p className="text-[11px] text-slate-600 leading-snug">
                      {detectedVeh
                        ? t('changeVehicleHint')
                        : t('noVehicleDetected')}
                    </p>
                  </div>
                );
              })()}

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('amount')} (RM) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                    RM
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={e => setExpenseAmount(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Current Balance: <span className="font-semibold text-slate-700">{formatCurrency(balance)}</span>
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('expenseNotes')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Highway toll, Clinic blood test fee"
                  value={expenseNotes}
                  onChange={e => setExpenseNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              {/* Mandatory Receipt Upload & Watermarking */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex justify-between items-center">
                  <span>{t('receiptPhoto')} <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-red-600 font-semibold uppercase">Watermark Required</span>
                </label>

                {/* Hidden File Inputs: Camera vs Gallery */}
                <input
                  ref={expenseCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={isSubmittingExpense || isPreparingReceipt}
                  onChange={handleReceiptFileSelected}
                />
                <input
                  ref={expenseGalleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isSubmittingExpense || isPreparingReceipt}
                  onChange={handleReceiptFileSelected}
                />

                {expenseReceiptFile ? (
                  <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 shadow-sm">
                    <LocalImagePreview
                      file={expenseReceiptFile}
                      alt="Receipt preview"
                      className="w-full h-44 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setExpenseReceiptFile(null)}
                      disabled={isSubmittingExpense}
                      title={t('discardPhoto') || "Discard photo"}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-all cursor-pointer hover:scale-110 z-10"
                    >
                      <X size={14} />
                    </button>
                    <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                      <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 truncate">
                        <Check size={14} className="shrink-0" />
                        <span className="truncate">{expenseReceiptFile.name}</span>
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => expenseCameraInputRef.current?.click()}
                          disabled={isSubmittingExpense}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Camera size={12} /> {t('cameraShot') || 'Camera'}
                        </button>
                        <button
                          type="button"
                          onClick={() => expenseGalleryInputRef.current?.click()}
                          disabled={isSubmittingExpense}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <ImageIcon size={12} /> {t('galleryUpload') || 'Gallery'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => expenseCameraInputRef.current?.click()}
                      disabled={isSubmittingExpense}
                      className="p-4 border-2 border-dashed border-slate-300 hover:border-red-500 hover:bg-red-50/30 rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
                    >
                      <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Camera size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-800">{t('cameraShot') || 'Camera Shot'}</span>
                      <span className="text-[10px] text-slate-500">{t('takePhoto') || 'Take Photo'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => expenseGalleryInputRef.current?.click()}
                      disabled={isSubmittingExpense}
                      className="p-4 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
                    >
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                        <ImageIcon size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-800">{t('galleryUpload') || 'Gallery Upload'}</span>
                      <span className="text-[10px] text-slate-500">{t('chooseGallery') || 'From Gallery'}</span>
                    </button>
                  </div>
                )}

                {/* GPS Stamp Info */}
                <div className="mt-2.5 p-2.5 bg-slate-100 rounded-xl flex items-center justify-between text-xs text-slate-600 border border-slate-200/70">
                  <div className="flex items-center gap-2 truncate">
                    <MapPin size={14} className={isAcquiringGps ? "animate-pulse text-amber-500 shrink-0" : "text-red-600 shrink-0"} />
                    <span className="truncate text-[11px]">
                      {isAcquiringGps ? 'Acquiring GPS fix...' : expenseLocationStr}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAcquiringGps(true);
                      getCurrentGpsLocation().then(res => setExpenseLocationStr(res.locationStr)).finally(() => setIsAcquiringGps(false));
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                    title="Refresh GPS"
                  >
                    <RefreshCw size={12} className={isAcquiringGps ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmittingExpense}
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense || !expenseAmount || !expenseReceiptFile}
                  className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingExpense ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>
                        {expenseSubmitStage === 'gps' && 'Acquiring GPS Lock...'}
                        {expenseSubmitStage === 'watermark' && t('watermarkingImage')}
                        {expenseSubmitStage === 'storage' && 'Uploading Receipt...'}
                        {!expenseSubmitStage && t('watermarkingImage')}
                      </span>
                    </>
                  ) : (
                    <>
                      <DollarSign size={16} />
                      <span>Confirm & Deduct</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: FULL RECEIPT INSPECTION WITH GPS WATERMARK                       */}
      {/* ========================================================================= */}
      {viewingReceipt && (() => {
        const liveReceipt = expenses.find(e => e.id === viewingReceipt.id) || viewingReceipt;
        const linkedTask = liveReceipt.taskId && liveReceipt.taskId !== 'unassigned'
          ? tasks.find(t => t.id === liveReceipt.taskId)
          : undefined;
        const student = linkedTask && !linkedTask.isNonStudentTask
          ? students.find(s => s.id === linkedTask.studentId)
          : undefined;
        const counselorUser = student
          ? users.find(u => u.id === student.counselorId || u.id === student.counselor)
          : undefined;
        const counselorName = student
          ? (counselorUser?.name || student.counselor || 'Unassigned')
          : null;
        const viewingVehicle = resolveExpenseVehicle(liveReceipt, vehicles);
        const isReceiptSettled = Boolean(liveReceipt.isSettled);

        return (
        <div
          className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-fade-in overflow-y-auto"
          onClick={() => setViewingReceipt(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-800 relative my-auto max-h-[92dvh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <Receipt size={18} className="text-red-500" />
                <span className="font-bold text-sm">Watermarked Receipt Proof</span>
                <span className="px-2 py-0.5 bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-bold rounded-md">
                  {liveReceipt.category}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-slate-100 max-h-[60vh] flex items-center justify-center overflow-auto">
              <img
                src={liveReceipt.receiptUrl}
                alt="Receipt Full Preview"
                className="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-slate-300"
              />
            </div>

            <div className="p-4 bg-white space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Amount:</span>
                <span className="font-extrabold text-base text-red-600">{formatCurrency(liveReceipt.amount)}</span>
              </div>
              <div className={cn(
                "flex justify-between items-center p-2.5 rounded-xl border",
                isReceiptSettled
                  ? "bg-teal-50/90 border-teal-200 dark:bg-teal-950/60 dark:border-teal-800"
                  : "bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-700"
              )}>
                <span className="text-slate-500 font-semibold">{t('settlementStatus') || 'Settlement Status'}:</span>
                <div className="text-right">
                  <span className={cn(
                    "inline-flex items-center gap-1 font-extrabold",
                    isReceiptSettled ? "text-teal-800 dark:text-teal-200" : "text-slate-700 dark:text-slate-300"
                  )}>
                    {isReceiptSettled ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    <span>{isReceiptSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}</span>
                  </span>
                  {isReceiptSettled && (liveReceipt.settledByName || liveReceipt.settledAt) && (
                    <span className="block text-[10px] text-teal-700 dark:text-teal-300 mt-0.5">
                      {liveReceipt.settledByName || ''}
                      {liveReceipt.settledByName && liveReceipt.settledAt ? ' • ' : ''}
                      {liveReceipt.settledAt ? `${formatDateTimeUTC8(liveReceipt.settledAt).slice(0, 16)} UTC+8` : ''}
                    </span>
                  )}
                </div>
              </div>
              {viewingVehicle && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{t('vehicleUsed')}:</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                    <Car size={12} className="text-red-600 shrink-0" />
                    <span>{viewingVehicle.label}</span>
                  </span>
                </div>
              )}
              {linkedTask && (() => {
                const taskCat = getTaskCategory(linkedTask);
                return (
                  <>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-slate-500">Linked Task:</span>
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <span className="font-bold text-slate-900 text-right">
                          {getTaskDisplayTitle(linkedTask, presets, 'en')}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border uppercase",
                          taskCat === 'non_student'
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : taskCat === 'student_custom'
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                        )}>
                          {taskCat === 'non_student' ? 'Non-Student' : taskCat === 'student_custom' ? 'Student Custom' : 'Student SOP'}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border uppercase",
                          getTaskStatusBadgeClasses(linkedTask.status)
                        )}>
                          {linkedTask.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {linkedTask.isNonStudentTask ? (
                      <>
                        <div className="flex justify-between items-start">
                          <span className="text-slate-500">Beneficiary / Task Subject:</span>
                          <span className="font-bold text-slate-900 text-right">
                            {getTaskSubjectName(linkedTask, students, 'en')}
                          </span>
                        </div>
                        {linkedTask.nonStudentContact && (
                          <div className="flex justify-between items-start">
                            <span className="text-slate-500">Contact:</span>
                            <span className="font-semibold text-purple-700 text-right">{linkedTask.nonStudentContact}</span>
                          </div>
                        )}
                      </>
                    ) : student && (
                      <>
                        <div className="flex justify-between items-start">
                          <span className="text-slate-500">Student:</span>
                          <span className="font-bold text-slate-900 text-right">{student.fullName}</span>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-slate-500">Student Counselor:</span>
                          <span className="font-bold text-slate-900 text-right">{counselorName}</span>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
              {liveReceipt.notes && (
                <div className="flex justify-between items-start">
                  <span className="text-slate-500">Notes:</span>
                  <span className="font-medium text-slate-800 text-right">{liveReceipt.notes}</span>
                </div>
              )}
              <div className="flex justify-between items-start">
                <span className="text-slate-500">Timestamp:</span>
                <span className="font-medium text-slate-700 text-right">{new Date(liveReceipt.timestamp).toLocaleString()}</span>
              </div>
              {liveReceipt.location && (
                <div className="flex justify-between items-start pt-1 border-t border-slate-100">
                  <span className="text-slate-500">GPS Coordinates:</span>
                  <span className="font-medium text-slate-700 text-right max-w-xs truncate">{liveReceipt.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
