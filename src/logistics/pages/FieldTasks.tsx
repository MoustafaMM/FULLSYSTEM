import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  ClipboardList, CheckCircle2, Circle, Upload, MapPin, Clock, Camera, Check, 
  Map as MapIcon, Calendar, Hotel, Car, AlertCircle, Phone, X, Mail, Star, 
  Play, Wallet, DollarSign, Plus, Receipt, AlertTriangle, ExternalLink, RefreshCw, WifiOff,
  ArrowUpRight, ArrowDownRight, ArrowLeft, Image as ImageIcon, Search, Filter, RotateCcw, Activity, Sparkles
} from 'lucide-react';
import { cn } from '../components/layout/Layout';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import toast from 'react-hot-toast';
import { Task, Expense, ExpenseCategory, TopUpRecord } from '../types';
import { addWatermark, getCurrentGpsLocation, prepareImageFile } from '../utils/watermark';
import { LocalImagePreview } from '../components/LocalImagePreview';
import { formatCurrency, formatAmountWithSign } from '../utils/currency';
import { detectActiveUserVehicle, isVehicleExpenseCategory, resolveExpenseVehicle, VehicleDetectionSource } from '../utils/vehicleDetection';
import { formatDateTimeUTC8 } from '../utils/walletLedger';
import {
  getLocalDateStr,
  getTaskDisplayTitle,
  getTaskSearchableText,
  getTaskSubjectName,
  matchesTaskTypeFilter,
  normalizeTaskStatus,
  TaskCategory
} from '../utils/taskClassification';
import { format } from 'date-fns';
import { compareTasksChronologically } from '../utils/taskTiming';
import CompactTaskCard from '../components/CompactTaskCard';
import PhotoLightboxModal from '../components/PhotoLightboxModal';

export default function FieldTasks() {
  const { 
    t, tasks, students, presets, users, currentUser, startTask, updateTaskStatus, 
    updateSubTaskStatus, addMediaToSubTask, removeMediaFromSubTask, updateTaskNotes, 
    updateTaskCommunication, removeCommunicationMedia,
    vehicles, vehicleLogs, expenses, topups, logExpense, logTopUp, language,
    pendingTaskIds, completingTaskIds, isOnline, retryPendingTaskSync
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'history'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  
  // Expense Logging State
  const [selectedExpenseTask, setSelectedExpenseTask] = useState<Task | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Tolls');
  const [expenseVehicleId, setExpenseVehicleId] = useState('');
  const [hasManualVehicleSelection, setHasManualVehicleSelection] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseReceiptFile, setExpenseReceiptFile] = useState<File | null>(null);
  const [expenseLocationStr, setExpenseLocationStr] = useState('Fetching GPS...');
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<Expense | null>(null);
  const [selectedProofMedia, setSelectedProofMedia] = useState<{ 
    url: string; 
    timestamp: string; 
    location: string; 
    title?: string;
    taskId?: string;
    subTaskId?: string;
    mediaIndex?: number;
    isCommunication?: boolean;
  } | null>(null);

  // Photo Source Selection Modal State
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);

  // Top-Up / Money Received State
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpSource, setTopUpSource] = useState('Office Petty Cash');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  
  const todayStr = getLocalDateStr();
  
  const allActiveTasks = tasks.filter(t => {
    const status = normalizeTaskStatus(t);
    return (
      t.assigneeId === currentUser?.id &&
      status !== 'cancelled' &&
      (status !== 'completed' || completingTaskIds.has(t.id))
    );
  });
  const historyTasks = tasks.filter(t =>
    t.assigneeId === currentUser?.id &&
    normalizeTaskStatus(t) === 'completed' &&
    !completingTaskIds.has(t.id)
  );

  const detectedVehicleResult = useMemo(() => {
    return detectActiveUserVehicle({
      userId: currentUser?.id,
      vehicles,
      vehicleLogs,
      task: selectedExpenseTask,
      activeTasks: allActiveTasks,
      todayStr,
    });
  }, [currentUser?.id, vehicles, vehicleLogs, selectedExpenseTask, allActiveTasks, todayStr]);

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
  
  const todayTasks = allActiveTasks.filter(t => !t.taskDate || t.taskDate <= todayStr);
  const upcomingTasks = allActiveTasks.filter(t => t.taskDate && t.taskDate > todayStr);

  const baseTabTasks = activeTab === 'today' ? todayTasks : activeTab === 'upcoming' ? upcomingTasks : historyTasks;

  const myTasks = useMemo(() => {
    return baseTabTasks
      .filter(task => {
        // 1. Status filter for active tabs
        if (activeTab !== 'history' && statusFilter !== 'all' && normalizeTaskStatus(task) !== statusFilter) {
          return false;
        }

        // 2. Category axis filter
        if (categoryFilter !== 'all' && !matchesTaskTypeFilter(task, categoryFilter)) {
          return false;
        }

        // 3. Preset / Task Type filter (supports omitted presetId and legacy presetId === 'custom')
        if (presetFilter !== 'all' && !matchesTaskTypeFilter(task, presetFilter)) {
          return false;
        }

        // 4. Date Range filter (primarily for History tab)
        if (activeTab === 'history' && (fromDate || toDate)) {
          const tDate = task.taskDate || (task.completedAt ? task.completedAt.slice(0, 10) : (task.createdAt ? task.createdAt.slice(0, 10) : ''));
          if (fromDate && (!tDate || tDate < fromDate)) return false;
          if (toDate && (!tDate || tDate > toDate)) return false;
        }

        // 5. Search query across student, passport, contact, flightNo, hotel, title, officer
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return getTaskSearchableText(task, presets, students, users).includes(q);
        }

        return true;
      })
      .sort((a, b) => {
        if (activeTab === 'history') {
          const tA = new Date(a.completedAt || a.startedAt || a.createdAt).getTime() || 0;
          const tB = new Date(b.completedAt || b.startedAt || b.createdAt).getTime() || 0;
          if (tB !== tA) return tB - tA;
          return (a.id || '').localeCompare(b.id || '');
        }
        // Sort active tasks: in_progress first, then pending, then completing/syncing;
        // within each group, sort chronologically (earliest scheduled date/time first)
        const priority: Record<string, number> = { in_progress: 0, pending: 1, completed: 2 };
        const pA = priority[normalizeTaskStatus(a)] ?? 3;
        const pB = priority[normalizeTaskStatus(b)] ?? 3;
        if (pA !== pB) return pA - pB;
        return compareTasksChronologically(a, b, todayStr);
      });
  }, [baseTabTasks, activeTab, statusFilter, categoryFilter, presetFilter, fromDate, toDate, searchQuery, students, presets, users, todayStr]);

  const todaySeparatedSections = useMemo(() => {
    if (activeTab !== 'today') return [];
    const inProgress = myTasks.filter(t => normalizeTaskStatus(t) === 'in_progress');
    const overduePending = myTasks.filter(
      t => normalizeTaskStatus(t) === 'pending' && Boolean(t.taskDate && t.taskDate < todayStr)
    );
    const scheduledTodayPending = myTasks.filter(t => normalizeTaskStatus(t) === 'pending' && t.taskDate === todayStr);
    const unscheduledPending = myTasks.filter(t => normalizeTaskStatus(t) === 'pending' && !t.taskDate);
    const syncingCompleted = myTasks.filter(t => normalizeTaskStatus(t) === 'completed');

    return [
      {
        key: 'in_progress',
        title: t('sectionInProgressNow') || 'In Progress Now',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
        items: inProgress,
      },
      {
        key: 'overdue',
        title: t('sectionOverdueCarriedOver') || 'Overdue / Carried Over',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
        items: overduePending,
      },
      {
        key: 'today_pending',
        title: 'Scheduled for Today (Pending)',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        items: scheduledTodayPending,
      },
      {
        key: 'unscheduled',
        title: t('sectionUnscheduledOpen') || 'Unscheduled Open',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-400',
        items: unscheduledPending,
      },
      {
        key: 'syncing_completed',
        title: 'Completing / Syncing',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        items: syncingCompleted,
      },
    ].filter(s => s.items.length > 0);
  }, [activeTab, myTasks, todayStr, t]);

  const historySummary = useMemo(() => {
    const completedCount = historyTasks.length;
    const onTimeRate = 100;
    const ratings = historyTasks.filter(t => t.feedback?.rating).map(t => t.feedback!.rating);
    const avgRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1) : 'N/A';
    return { completedCount, onTimeRate, avgRating, ratingsCount: ratings.length };
  }, [historyTasks]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const commFileInputRef = useRef<HTMLInputElement>(null);
  const expenseCameraInputRef = useRef<HTMLInputElement>(null);
  const expenseGalleryInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{taskId: string, subTaskId?: string, isCommunication?: boolean} | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<'gps' | 'watermark' | 'storage' | null>(null);
  const [expenseSubmitStage, setExpenseSubmitStage] = useState<'gps' | 'watermark' | 'storage' | null>(null);
  const [isPreparingReceipt, setIsPreparingReceipt] = useState(false);

  const handleExpenseReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '--';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMins = Math.floor((endTime - startTime) / 60000);
    if (diffMins < 0) return '0m';
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  };

  const handleUploadClick = (taskId: string, subTaskId?: string, isCommunication: boolean = false) => {
    setUploadTarget({ taskId, subTaskId, isCommunication });
    setIsSourceModalOpen(true);
  };

  const handleDeleteProof = async (taskId: string, subTaskId?: string, mediaIndex?: number, isCommunication: boolean = false) => {
    if (mediaIndex === undefined) return;
    try {
      if (isCommunication) {
        await removeCommunicationMedia(taskId, mediaIndex);
      } else if (subTaskId) {
        await removeMediaFromSubTask(taskId, subTaskId, mediaIndex);
      }
      toast.success(t('discardPhoto') || 'Proof photo discarded');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to discard proof');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && uploadTarget) {
      const file = e.target.files[0];
      const target = uploadTarget;
      setUploadTarget(null);
      setIsUploading(true);
      setUploadStage('gps');

      try {
        // 1. Asynchronous Blocking: Await full resolution of HTML5 Geolocation (enableHighAccuracy: true) & reverse geocoding
        const gpsResult = await getCurrentGpsLocation();
        const locationString = gpsResult.locationStr;

        // 2. Hardware-accelerated Canvas2D Watermarking with auto-downscaling & 0.80 JPEG compression
        setUploadStage('watermark');
        const watermarkedFile = await addWatermark(file, locationString);

        // 3. Upload watermarked image to Firebase Cloud Storage
        setUploadStage('storage');
        const fileRef = ref(storage, `proofs/${target.taskId}/${target.subTaskId || 'comm'}_${Date.now()}_${watermarkedFile.name}`);
        await uploadBytes(fileRef, watermarkedFile);
        const downloadUrl = await getDownloadURL(fileRef);

        if (target.isCommunication) {
          await updateTaskCommunication(target.taskId, true, downloadUrl, locationString);
        } else if (target.subTaskId) {
          await addMediaToSubTask(target.taskId, target.subTaskId, downloadUrl, locationString);
        }
        toast.success('Proof uploaded with GPS watermark');
      } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error.message || 'GPS access is mandatory for visual audits. Please enable location permissions.');
      } finally {
        setIsUploading(false);
        setUploadStage(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        if (commFileInputRef.current) {
          commFileInputRef.current.value = '';
        }
      }
    }
  };

  useEffect(() => {
    if (isExpenseModalOpen) {
      setIsAcquiringGps(true);
      getCurrentGpsLocation()
        .then((res) => {
          setExpenseLocationStr(res.locationStr);
        })
        .catch((err) => {
          console.warn('Initial GPS fetch warning:', err);
          setExpenseLocationStr('GPS Lock Required (Tap Refresh)');
        })
        .finally(() => {
          setIsAcquiringGps(false);
        });
    }
  }, [isExpenseModalOpen]);

  // Auto-detect vehicle when logging Fuel, Tolls, or Parking (unless manually overridden in this session)
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

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseTask) {
      toast.error('Please select a task for this expense.');
      return;
    }
    const numAmount = parseFloat(expenseAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount.');
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
      // 2. Hardware-accelerated Canvas2D Watermarking (exact GPS & UTC/local timestamp)
      const watermarkedReceipt = await addWatermark(expenseReceiptFile, activeLocation);

      setExpenseSubmitStage('storage');
      // 3. Upload watermarked image to Firebase Cloud Storage
      const storagePath = `receipts/expenses/${selectedExpenseTask.id}_${Date.now()}_${watermarkedReceipt.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, watermarkedReceipt);
      const downloadUrl = await getDownloadURL(fileRef);

      // 4. Instant Batched Deduction & Firestore Log (Optimistic via IndexedDB persistence)
      const isVehicleExpense = isVehicleExpenseCategory(expenseCategory);
      const selectedVehicle = isVehicleExpense && expenseVehicleId
        ? vehicles.find(v => v.id === expenseVehicleId)
        : undefined;

      await logExpense({
        taskId: selectedExpenseTask.id,
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
      setSelectedExpenseTask(null);
      setExpenseAmount('');
      setExpenseNotes('');
      setExpenseReceiptFile(null);
      setExpenseCategory('Tolls');
      setExpenseVehicleId('');
      setHasManualVehicleSelection(false);
    } catch (err: any) {
      console.error('Error logging expense:', err);
      toast.error(err.message || 'Failed to submit expense.');
    } finally {
      setIsSubmittingExpense(false);
      setExpenseSubmitStage(null);
    }
  };

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

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-20">
      {/* Camera input for physical on-site subtask verification */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
      
      {/* Gallery / Screenshot input for student communication proof */}
      <input type="file" ref={commFileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {/* Cloud Sync & Offline Status Banner */}
      {(!isOnline || pendingTaskIds.size > 0 || completingTaskIds.size > 0) && (
        <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-3 shadow-md ${
          !isOnline 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200' 
            : 'bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-200'
        }`}>
          <div className="flex items-center gap-3">
            {!isOnline ? (
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <WifiOff size={20} />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                <RefreshCw size={20} className="animate-spin" />
              </div>
            )}
            <div>
              <div className="text-xs font-black uppercase tracking-wider">
                {!isOnline ? 'Offline Mode (Device Storage Active)' : 'Syncing with Cloud Database'}
              </div>
              <div className="text-xs font-medium opacity-90">
                {!isOnline
                  ? 'Network disconnected. Tasks are safely saved to your device and will sync once internet returns.'
                  : `${pendingTaskIds.size + completingTaskIds.size} update(s) currently being confirmed by Firestore...`}
              </div>
            </div>
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={retryPendingTaskSync}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw size={13} />
              <span>Verify Sync</span>
            </button>
          )}
        </div>
      )}

      {/* Field Officer Wallet Status Card */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-blue-900/50 relative overflow-hidden">
        {/* Background decorative glow */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 bg-red-600/20 text-red-500 rounded-2xl border border-red-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Wallet size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {t('walletBalance')}
                </span>
                {(currentUser?.walletBalance ?? 0) < 50 ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
                    <AlertTriangle size={11} /> Low Balance Alert (&lt; RM 50)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full">
                    Active Funds
                  </span>
                )}
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white mt-1 tracking-tight">
                {formatCurrency(currentUser?.walletBalance ?? 0)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
            {/* Money Received (Top-up) button */}
            <button
              type="button"
              onClick={() => setIsTopUpModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/30 transition-all shrink-0 active:scale-95 hover:-translate-y-0.5"
            >
              <ArrowUpRight size={16} />
              <span>{t('moneyReceived')}</span>
            </button>

            {/* Money Spent (Expense) button */}
            {allActiveTasks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const active = allActiveTasks.find(t => normalizeTaskStatus(t) === 'in_progress') || allActiveTasks[0];
                  setSelectedExpenseTask(active);
                  setIsExpenseModalOpen(true);
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md shadow-red-600/30 transition-all shrink-0 active:scale-95 hover:-translate-y-0.5"
              >
                <ArrowDownRight size={16} />
                <span>{t('moneySpent')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Low Balance Warning Banner */}
        {(currentUser?.walletBalance ?? 0) < 50 && (
          <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center gap-2.5 text-xs text-amber-200 bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <span className="leading-snug">{t('lowBalanceWarning')}</span>
          </div>
        )}
      </div>

      {/* Streamlined My Tasks Header & Tabs with Live Count Badges */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{t('fieldTasks')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'today'
                ? 'Active missions scheduled for today or requiring immediate attention'
                : activeTab === 'upcoming'
                ? 'Future scheduled logistics assignments'
                : 'Completed mission archive, visual audits, and student feedback'}
            </p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-auto border border-slate-200/70 overflow-x-auto scrollbar-none">
            <button 
              type="button"
              onClick={() => setActiveTab('today')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'today' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span>Today</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[11px] font-extrabold",
                activeTab === 'today' ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"
              )}>
                {todayTasks.length}
              </span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'upcoming' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span>Upcoming</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[11px] font-extrabold",
                activeTab === 'upcoming' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
              )}>
                {upcomingTasks.length}
              </span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'history' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span>History</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[11px] font-extrabold",
                activeTab === 'history' ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              )}>
                {historyTasks.length}
              </span>
            </button>
          </div>
        </div>

        {/* History Tab Personal KPI Summary Strip */}
        {activeTab === 'history' && (
          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Completed</span>
              <span className="text-lg sm:text-xl font-black text-emerald-900">{historySummary.completedCount}</span>
            </div>
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">On-Time SLA</span>
              <span className="text-lg sm:text-xl font-black text-blue-900">{historySummary.onTimeRate}%</span>
            </div>
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Student Rating</span>
              <span className="text-lg sm:text-xl font-black text-amber-900">
                {historySummary.avgRating}{historySummary.avgRating !== 'N/A' ? ' ★' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Search & Filter Controls */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search student, flight no, phone, passport, hotel, task..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={presetFilter}
              onChange={(e) => setPresetFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Task Types</option>
              <option value="non_student">General / Non-Student</option>
              <option value="custom">Custom Tasks</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{language === 'ar' && p.nameAr ? p.nameAr : p.nameEn}</option>
              ))}
            </select>
          </div>

          {activeTab !== 'history' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {([
                    { id: 'all', label: 'All', count: baseTabTasks.length },
                    { id: 'in_progress', label: 'In Progress', count: baseTabTasks.filter(t => normalizeTaskStatus(t) === 'in_progress').length },
                    { id: 'pending', label: 'Pending', count: baseTabTasks.filter(t => normalizeTaskStatus(t) === 'pending').length },
                  ] as const).map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setStatusFilter(chip.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer border",
                        statusFilter === chip.id
                          ? chip.id === 'in_progress'
                            ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                            : chip.id === 'pending'
                            ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                            : "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {chip.label} ({chip.count})
                    </button>
                  ))}
                </div>

                {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' || presetFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setCategoryFilter('all');
                      setPresetFilter('all');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {([
                  { id: 'all', label: t('allCategories') || 'All Categories' },
                  { id: 'student_preset', label: t('studentPresetCategory') || 'Student SOP' },
                  { id: 'student_custom', label: t('studentCustomCategory') || 'Student Custom' },
                  { id: 'non_student', label: t('nonStudentCategory') || 'Non-Student' },
                ] as const).map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer border",
                      categoryFilter === cat.id
                        ? "bg-purple-900 text-white border-purple-900 shadow-2xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Date:</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                  />
                </div>

                {(searchQuery || categoryFilter !== 'all' || presetFilter !== 'all' || fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                      setPresetFilter('all');
                      setFromDate('');
                      setToDate('');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {([
                  { id: 'all', label: t('allCategories') || 'All Categories' },
                  { id: 'student_preset', label: t('studentPresetCategory') || 'Student SOP' },
                  { id: 'student_custom', label: t('studentCustomCategory') || 'Student Custom' },
                  { id: 'non_student', label: t('nonStudentCategory') || 'Non-Student' },
                ] as const).map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer border",
                      categoryFilter === cat.id
                        ? "bg-purple-900 text-white border-purple-900 shadow-2xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {myTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 border border-emerald-100 shadow-2xs">
            <CheckCircle2 size={36} />
          </div>
          <h3 className="text-lg font-black text-slate-900 mb-1">
            {baseTabTasks.length > 0
              ? 'No Matching Tasks Found'
              : activeTab === 'today'
              ? 'All Caught Up For Today!'
              : activeTab === 'upcoming'
              ? 'No Upcoming Tasks Scheduled'
              : 'No Completed Tasks Yet'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
            {baseTabTasks.length > 0
              ? 'Try clearing your search query or filters above to see all tasks in this tab.'
              : activeTab === 'today' 
              ? 'All assigned field tasks for today have been completed. Completed items and visual audits are logged in your History tab.' 
              : activeTab === 'upcoming' 
              ? 'Future scheduled tasks will appear here once assigned by the operations coordinator.' 
              : 'Tasks marked as completed will be archived here along with visual proofs and receipts.'}
          </p>
        </div>
      )}

      {activeTab === 'today' ? (
        <div className="space-y-6">
          {todaySeparatedSections.map(section => (
            <div key={section.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${section.badgeClass}`}>
                  <span className={`w-2 h-2 rounded-full ${section.dotClass}`} />
                  <span>{section.title}</span>
                  <span className="font-black">({section.items.length})</span>
                </span>
              </div>
              <div className="space-y-4">
                {section.items.map(task => (
                  <CompactTaskCard
                    key={task.id}
                    task={task}
                    mode="field_officer"
                    onStartTask={async (t) => {
                      try {
                        await startTask(t.id);
                        toast.success('Task started');
                      } catch (error: any) {
                        toast.error(error.message || 'Failed to start task');
                      }
                    }}
                    onUploadPhoto={handleUploadClick}
                    onDeleteProof={handleDeleteProof}
                    onOpenExpenseModal={(t) => {
                      setSelectedExpenseTask(t);
                      setIsExpenseModalOpen(true);
                    }}
                    onViewProof={(media) => setSelectedProofMedia(media)}
                    onViewReceipt={(exp) => setViewingReceipt(exp)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {myTasks.map(task => {
            return (
              <CompactTaskCard
                key={task.id}
                task={task}
                mode="field_officer"
                onStartTask={async (t) => {
                  try {
                    await startTask(t.id);
                    toast.success('Task started');
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to start task');
                  }
                }}
                onUploadPhoto={handleUploadClick}
                onDeleteProof={handleDeleteProof}
                onOpenExpenseModal={(t) => {
                  setSelectedExpenseTask(t);
                  setIsExpenseModalOpen(true);
                }}
                onViewProof={(media) => setSelectedProofMedia(media)}
                onViewReceipt={(exp) => setViewingReceipt(exp)}
              />
            );
          })}
        </div>
      )}

      {/* Log Expense Modal */}
      {isExpenseModalOpen && selectedExpenseTask && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-950 to-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600/30 border border-red-500/40 rounded-xl text-red-400">
                  <Receipt size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('logExpense')}</h3>
                  <p className="text-xs text-slate-300 truncate max-w-xs">
                    {getTaskDisplayTitle(selectedExpenseTask, presets, language)} &bull; {getTaskSubjectName(selectedExpenseTask, students, language)}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (!isSubmittingExpense) {
                    setIsExpenseModalOpen(false);
                    setSelectedExpenseTask(null);
                  }
                }}
                className="text-slate-400 hover:text-white p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-5 sm:p-6 space-y-4">
              {/* Task Selector if multiple active */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Linked Task <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedExpenseTask.id}
                  onChange={(e) => {
                    const found = tasks.find(t => t.id === e.target.value);
                    if (found) setSelectedExpenseTask(found);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  {allActiveTasks.map(tItem => {
                    const beneficiary = getTaskSubjectName(tItem, students, language);
                    const title = getTaskDisplayTitle(tItem, presets, language);
                    return (
                      <option key={tItem.id} value={tItem.id}>
                        {title === beneficiary ? title : `${title} - ${beneficiary}`} ({tItem.status})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('expenseCategory')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
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
                      onChange={(e) => {
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
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Will instantly deduct from your balance: <span className="font-semibold text-slate-700">{formatCurrency(currentUser?.walletBalance ?? 0)}</span>
                </p>
              </div>

              {/* Notes / Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t('expenseNotes')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Highway toll, Sepang clinic fee"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              {/* Required Receipt Upload with Live Watermarking preview & GPS capture */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex justify-between items-center">
                  <span>{t('receiptPhoto')} <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-red-600 font-semibold uppercase">Watermark Required</span>
                </label>

                {/* Hidden Inputs for Camera vs Gallery */}
                <input 
                  type="file" 
                  ref={expenseCameraInputRef}
                  accept="image/*" 
                  capture="environment" 
                  className="hidden"
                  disabled={isSubmittingExpense || isPreparingReceipt}
                  onChange={handleExpenseReceiptSelected} 
                />
                <input 
                  type="file" 
                  ref={expenseGalleryInputRef}
                  accept="image/*" 
                  className="hidden"
                  disabled={isSubmittingExpense || isPreparingReceipt}
                  onChange={handleExpenseReceiptSelected} 
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
                  onClick={() => {
                    setIsExpenseModalOpen(false);
                    setSelectedExpenseTask(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense || !expenseAmount || !expenseReceiptFile}
                  className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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

      {/* Log Money Received (Top-up) Modal */}
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
                  <p className="text-xs text-emerald-200">Record funds received into your wallet balance</p>
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
                  {formatCurrency((currentUser?.walletBalance ?? 0) + (parseFloat(topUpAmount) || 0))}
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

      {/* Receipt Full-Size Inspection Modal */}
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
              {student && (
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
              {liveReceipt.notes && (
                <div className="flex justify-between items-start">
                  <span className="text-slate-500">Notes:</span>
                  <span className="font-medium text-slate-800 text-right">{liveReceipt.notes}</span>
                </div>
              )}
              <div className="flex justify-between items-start">
                <span className="text-slate-500">Time:</span>
                <span className="font-medium text-slate-700 text-right">{new Date(liveReceipt.timestamp).toLocaleString()}</span>
              </div>
              {liveReceipt.location && (
                <div className="flex justify-between items-start pt-1 border-t border-slate-100">
                  <span className="text-slate-500">GPS Location:</span>
                  <span className="font-medium text-slate-700 text-right max-w-xs truncate">{liveReceipt.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Proof Lightbox Modal with Mobile-Optimized Back & X buttons */}
      <PhotoLightboxModal
        isOpen={!!selectedProofMedia}
        onClose={() => setSelectedProofMedia(null)}
        imageUrl={selectedProofMedia?.url || null}
        title={selectedProofMedia?.title}
        timestamp={selectedProofMedia?.timestamp}
        location={selectedProofMedia?.location}
        onDelete={
          selectedProofMedia?.taskId && selectedProofMedia.mediaIndex !== undefined
            ? async () => {
                if (window.confirm(t('confirmDiscardProof') || 'Discard this photo proof?')) {
                  await handleDeleteProof(
                    selectedProofMedia.taskId!,
                    selectedProofMedia.subTaskId,
                    selectedProofMedia.mediaIndex,
                    selectedProofMedia.isCommunication
                  );
                  setSelectedProofMedia(null);
                }
              }
            : undefined
        }
        deleteLabel={t('discardPhoto') || 'Discard Proof'}
      />

      {/* Photo Source Modal: Camera vs Gallery */}
      {isSourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Camera size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">{t('selectPhotoSource') || 'Select Photo Source'}</h3>
              <p className="text-xs text-slate-500 mt-1">Take a new live photo or upload from device gallery</p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsSourceModalOpen(false);
                  fileInputRef.current?.click();
                }}
                className="p-4 rounded-2xl border-2 border-slate-200 hover:border-red-500 hover:bg-red-50/30 transition-all flex flex-col items-center gap-2 cursor-pointer group"
              >
                <div className="p-2.5 bg-red-100 text-red-600 rounded-xl group-hover:scale-110 transition-transform">
                  <Camera size={20} />
                </div>
                <span className="text-xs font-bold text-slate-800">{t('cameraShot') || 'Camera'}</span>
                <span className="text-[10px] text-slate-500">{t('takePhoto') || 'Take Photo'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSourceModalOpen(false);
                  commFileInputRef.current?.click();
                }}
                className="p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex flex-col items-center gap-2 cursor-pointer group"
              >
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                  <ImageIcon size={20} />
                </div>
                <span className="text-xs font-bold text-slate-800">{t('galleryUpload') || 'Gallery'}</span>
                <span className="text-[10px] text-slate-500">{t('chooseGallery') || 'From Gallery'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSourceModalOpen(false);
                setUploadTarget(null);
              }}
              className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              {t('cancel') || 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full flex flex-col items-center shadow-2xl border border-slate-100 text-center">
            <div className="relative mb-4">
              <div className="w-14 h-14 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-red-600">
                {uploadStage === 'gps' && <MapPin size={20} className="animate-pulse" />}
                {uploadStage === 'watermark' && <Camera size={20} className="animate-pulse" />}
                {uploadStage === 'storage' && <Upload size={20} className="animate-pulse" />}
              </div>
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1">
              {uploadStage === 'gps' && 'Acquiring GPS Lock...'}
              {uploadStage === 'watermark' && 'Applying Audit Watermark...'}
              {uploadStage === 'storage' && 'Uploading to Storage...'}
              {!uploadStage && 'Processing photo proof...'}
            </h4>
            <p className="text-xs text-slate-500">
              {uploadStage === 'gps' && 'Locking exact GPS coordinates (High Accuracy)...'}
              {uploadStage === 'watermark' && 'Stamping timestamps & location into pixel buffer...'}
              {uploadStage === 'storage' && 'Dispatching watermarked image to cloud...'}
              {!uploadStage && 'Please wait a moment...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
