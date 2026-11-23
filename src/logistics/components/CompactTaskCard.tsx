import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  MapPin, 
  Camera, 
  Calendar, 
  Hotel, 
  Car, 
  AlertCircle, 
  Play, 
  Receipt, 
  Plus, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  X, 
  User as UserIcon, 
  Mail, 
  Star, 
  DollarSign, 
  ShieldCheck, 
  FileText, 
  AlertTriangle,
  Send,
  MessageSquare,
  Sparkles,
  Phone,
  Check,
  ArrowRight,
  ShieldAlert,
  Trash2,
  Edit,
  Plane,
  Copy,
  Link as LinkIcon,
  PhoneCall
} from 'lucide-react';
import { Task, SubTask, Expense, Student } from '../types';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, formatAmountWithSign } from '../utils/currency';
import { getTaskSlaInfo } from '../utils/taskTiming';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import { resolveExpenseVehicle } from '../utils/vehicleDetection';
import { getTaskStepMetrics, isCommunicationSubTask } from '../utils/taskSteps';
import { hasValidLogisticReport } from '../utils/taskCompletion';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskScheduleBucket,
  getTaskServiceLabel,
  getTaskStatusAccentClass,
  getTaskStatusBadgeClasses,
  getTaskSubjectName,
  hasPresetTemplate,
  isOpenTask,
  normalizeTaskStatus
} from '../utils/taskClassification';
import StudentDossierModal from './StudentDossierModal';
import QCReviewModal from './QCReviewModal';
import { QC_GRADES, getQCGradeLabel } from '../utils/qualityControl';
import { getServiceQuestions } from '../pages/FeedbackForm';
import toast from 'react-hot-toast';
import { cn } from './layout/Layout';
import { format } from 'date-fns';

interface CompactTaskCardProps {
  key?: React.Key;
  task: Task;
  mode?: 'field_officer' | 'admin_coord';
  readOnlySubtasks?: boolean;
  onStartTask?: (task: Task) => void | Promise<void>;
  onUploadPhoto?: (taskId: string, subTaskId?: string, isCommunication?: boolean) => void;
  onDeleteProof?: (taskId: string, subTaskId?: string, mediaIndex?: number, isCommunication?: boolean) => void;
  onOpenExpenseModal?: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
  onViewProof?: (media: { url: string; timestamp: string; location: string; title?: string; taskId?: string; subTaskId?: string; mediaIndex?: number; isCommunication?: boolean }) => void;
  onViewReceipt?: (expense: Expense) => void;
  onNavigateToStudent?: (studentId: string) => void;
}

export function formatWhatsAppUrl(rawContact?: string): string | null {
  if (!rawContact) return null;
  // Extract first phone-like sequence or digits
  let digits = rawContact.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('01')) {
    // Normalize Malaysian mobile numbers (01X-XXXXXXX -> 601XXXXXXXX)
    digits = `6${digits}`;
  }
  const cleanDigits = digits.replace(/\D/g, '');
  if (cleanDigits.length < 7) return null;
  return `https://wa.me/${cleanDigits}`;
}

export interface ValidationGateItem {
  id: string;
  title: string;
  description: string;
  isPassed: boolean;
  type: 'communication' | 'comm_proof' | 'subtask_complete' | 'subtask_proof' | 'logistic_report';
  subTaskId?: string;
  actionLabel: string;
}

export default function CompactTaskCard({
  task,
  mode,
  readOnlySubtasks,
  onStartTask,
  onUploadPhoto,
  onDeleteProof,
  onOpenExpenseModal,
  onEditTask,
  onDeleteTask,
  onViewProof,
  onViewReceipt,
  onNavigateToStudent
}: CompactTaskCardProps) {
  const { 
    t, 
    students, 
    presets, 
    users, 
    vehicles, 
    expenses, 
    currentUser, 
    language,
    updateSubTaskStatus,
    updateTaskCommunication,
    updateTaskNotes,
    updateTaskStatus,
    updateTaskStudentEmail,
    resendTaskFeedbackEmail,
    pendingTaskIds,
    completingTaskIds,
    isOnline,
    qcReviews
  } = useAppContext();

  const isFieldOfficer = mode ? mode === 'field_officer' : currentUser?.role === 'field_officer';
  const isAccountant = currentUser?.role === 'accountant' || currentUser?.role === 'counselor_manager';
  const isAdminQC = currentUser?.role === 'admin' && mode !== 'field_officer';
  const taskQCReview = isAdminQC ? qcReviews.find(r => r.taskId === task.id || r.id === task.id) : undefined;
  const canResendFeedback = (currentUser?.role === 'admin' || currentUser?.role === 'coordinator') && mode !== 'field_officer';
  const isSubtaskReadOnly = readOnlySubtasks !== undefined 
    ? readOnlySubtasks 
    : (mode === 'admin_coord' || !isFieldOfficer || isAccountant);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isQCModalOpen, setIsQCModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [isStartingTask, setIsStartingTask] = useState(false);
  const [reportNote, setReportNote] = useState(task.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const isCompletingRef = useRef(false);
  const isNoteFocusedRef = useRef(false);
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync reportNote when task.notes changes remotely and officer is not actively typing
  useEffect(() => {
    if (!isNoteFocusedRef.current && !isSavingNotes) {
      setReportNote(task.notes || '');
    }
  }, [task.notes, isSavingNotes]);

  // Embedded Student Email State for CSAT Feedback Loop
  const [taskEmail, setTaskEmail] = useState(task.studentEmail || '');
  const [isEmailDirty, setIsEmailDirty] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isEmailSaved, setIsEmailSaved] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const isNonStudent = !!task.isNonStudentTask;
  const student = useMemo(() => (!isNonStudent && task.studentId ? students.find(s => s.id === task.studentId) : undefined), [students, task.studentId, isNonStudent]);

  const handleResendFeedbackEmail = async (overrideEmail?: string) => {
    if (!canResendFeedback) {
      toast.error('Only administrators and coordinators can resend feedback emails.');
      return;
    }
    const emailToUse = (overrideEmail !== undefined ? overrideEmail : taskEmail).trim();
    if (!emailToUse) {
      toast.error('Please enter a recipient email address first.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToUse)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setIsResendingEmail(true);
    try {
      await resendTaskFeedbackEmail(task.id, emailToUse);
      toast.success(`Feedback email dispatched to ${emailToUse}`);
    } catch (err: any) {
      console.error('Failed to resend feedback email:', err);
      toast.error(err.message || 'Failed to resend feedback email');
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Keep local task email state synchronized with Firestore task/student data when not actively editing
  useEffect(() => {
    if (!isEmailDirty && !isSavingEmail) {
      setTaskEmail(task.studentEmail || student?.email || '');
    }
  }, [task.studentEmail, student?.email, isEmailDirty, isSavingEmail]);

  const handleSaveEmail = async (overrideValue?: string) => {
    const rawVal = overrideValue !== undefined ? overrideValue : taskEmail;
    const trimmedVal = rawVal.trim().toLowerCase();

    if (trimmedVal) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedVal)) {
        setEmailError(t('invalidEmail') || 'Please enter a valid email address.');
        return false;
      }
    }
    setEmailError(null);

    // If identical to existing task.studentEmail, avoid redundant Firestore write
    if (trimmedVal === (task.studentEmail || '').toLowerCase()) {
      setIsEmailDirty(false);
      return true;
    }

    setIsSavingEmail(true);
    try {
      await updateTaskStudentEmail(task.id, trimmedVal);
      setIsEmailDirty(false);
      setIsEmailSaved(true);
      setTimeout(() => setIsEmailSaved(false), 3000);
      toast.success('Student email updated');
      return true;
    } catch (err: any) {
      console.error('Error updating student email:', err);
      toast.error(err.message || 'Failed to update student email');
      return false;
    } finally {
      setIsSavingEmail(false);
    }
  };
  const preset = useMemo(
    () => (hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined),
    [presets, task]
  );
  const assignee = useMemo(() => users.find(u => u.id === task.assigneeId), [users, task.assigneeId]);
  const vehicle = useMemo(() => vehicles.find(v => v.id === task.vehicleId), [vehicles, task.vehicleId]);
  const taskExpenses = useMemo(() => expenses.filter(e => e.taskId === task.id), [expenses, task.id]);
  const taskExpensesTotal = useMemo(() => taskExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [taskExpenses]);

  const hasExistingCommSubtask = useMemo(
    () => (task.subTasks || []).some(st => isCommunicationSubTask(st)),
    [task.subTasks]
  );
  const includeCommunicationStep = !isNonStudent || hasExistingCommSubtask || Boolean(task.studentCommunicated) || Boolean(task.studentCommunicationMedia?.length);

  // Non-communication subtasks
  const nonCommSubtasks = useMemo(() => {
    return (task.subTasks || []).filter(st => !isCommunicationSubTask(st));
  }, [task.subTasks]);

  const stepMetrics = useMemo(() => getTaskStepMetrics(task), [task]);

  // Subtask progress calculations aligned with canonical getTaskStepMetrics
  const { completedSubtasksCount, totalSubtasksCount, progressPercentage } = useMemo(() => {
    if (!includeCommunicationStep || !isNonStudent || hasExistingCommSubtask) {
      return {
        completedSubtasksCount: stepMetrics.completed,
        totalSubtasksCount: stepMetrics.total,
        progressPercentage: stepMetrics.percentage
      };
    }
    const commCount = task.studentCommunicated ? 1 : 0;
    const subtasksDone = nonCommSubtasks.filter(st => st.isCompleted || st.isSkipped).length;
    const completed = commCount + subtasksDone;
    const total = 1 + nonCommSubtasks.length;
    return {
      completedSubtasksCount: completed,
      totalSubtasksCount: total,
      progressPercentage: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
    };
  }, [includeCommunicationStep, isNonStudent, hasExistingCommSubtask, stepMetrics, task.studentCommunicated, nonCommSubtasks]);

  // Comprehensive Validation Gates for Task Completion
  const validationGates = useMemo<ValidationGateItem[]>(() => {
    const gates: ValidationGateItem[] = [];

    if (includeCommunicationStep) {
      // Gate 1: Communication Status
      gates.push({
        id: 'gate-comm',
        title: isNonStudent ? 'Beneficiary Contact Established' : 'Student Contact Established',
        description: isNonStudent
          ? (task.nonStudentContact ? `Contact verified with ${task.nonStudentContact}.` : 'Beneficiary contact verified.')
          : 'Communication with the student has been initiated and verified.',
        isPassed: !!task.studentCommunicated,
        type: 'communication',
        actionLabel: 'Verify Contact'
      });

      // Gate 2: Communication Proof Photo
      gates.push({
        id: 'gate-comm-proof',
        title: isNonStudent ? 'Beneficiary Contact Visual Proof' : 'Communication Visual Proof',
        description: isNonStudent
          ? 'Screenshot or photo proof with GPS/timestamp of interaction or delivery.'
          : 'Screenshot or photo proof with GPS/timestamp of student interaction.',
        isPassed: !!(task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0),
        type: 'comm_proof',
        actionLabel: 'Upload Proof'
      });
    }

    // Gates for each SOP subtask
    nonCommSubtasks.forEach((st) => {
      const title = language === 'ar' ? (st.titleAr || st.titleEn) : st.titleEn;
      const isDone = !!(st.isCompleted || st.isSkipped);
      const hasProof = !!(st.media && st.media.length > 0);

      // Subtask Completion Gate
      gates.push({
        id: `gate-st-${st.id}`,
        title: `Step: ${title}`,
        description: st.isSkipped ? 'Subtask was skipped' : 'Milestone completed on-ground.',
        isPassed: isDone,
        type: 'subtask_complete',
        subTaskId: st.id,
        actionLabel: 'Mark Done'
      });

      // Subtask Visual Audit Proof Gate (Strictly required if st.requiresProof is true and not skipped)
      if (st.requiresProof && !st.isSkipped) {
        gates.push({
          id: `gate-proof-${st.id}`,
          title: `Visual Proof: ${title}`,
          description: 'Mandatory GPS-watermarked camera proof for this physical checkpoint.',
          isPassed: st.isCompleted ? hasProof : false,
          type: 'subtask_proof',
          subTaskId: st.id,
          actionLabel: 'Capture Photo'
        });
      }
    });

    // Final Gate: Compulsory Logistic Report
    gates.push({
      id: 'gate-logistic-report',
      title: t('logisticReportGateTitle') || 'Logistic Report Filled',
      description: t('logisticReportGateDesc') || 'Compulsory final operational summary required before finishing the task.',
      isPassed: hasValidLogisticReport(reportNote),
      type: 'logistic_report',
      actionLabel: t('logisticReport') || 'Logistic Report'
    });

    return gates;
  }, [includeCommunicationStep, isNonStudent, task.nonStudentContact, task.studentCommunicated, task.studentCommunicationMedia, nonCommSubtasks, language, reportNote, t]);

  const passedGatesCount = useMemo(() => validationGates.filter(g => g.isPassed).length, [validationGates]);
  const totalGatesCount = validationGates.length;
  const isAllValidationPassed = passedGatesCount === totalGatesCount;
  const unmetGates = useMemo(() => validationGates.filter(g => !g.isPassed), [validationGates]);

  // Total Proofs attached count
  const totalProofsCount = useMemo(() => {
    let count = (task.studentCommunicationMedia || []).length;
    (task.subTasks || []).forEach(st => {
      count += (st.media || []).length;
    });
    return count;
  }, [task.studentCommunicationMedia, task.subTasks]);

  // 60-second live tick for SLA countdown
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // SLA Tracking Calculations
  const slaInfo = useMemo(() => {
    return getTaskSlaInfo(task, nowMs);
  }, [task, nowMs]);

  // Duration formatter
  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '--';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMins = Math.floor((endTime - startTime) / 60000);
    if (diffMins < 0) return '0m';
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  };

  const effectiveStatus = normalizeTaskStatus(task);

  const handleNotesBlur = async (silentToast = false) => {
    const trimmedReport = reportNote.trim();
    if (trimmedReport !== reportNote) {
      setReportNote(trimmedReport);
    }
    if (trimmedReport === (task.notes || '').trim()) return;
    setIsSavingNotes(true);
    try {
      await updateTaskNotes(task.id, trimmedReport);
      if (!silentToast && effectiveStatus !== 'completed') toast.success('Report saved');
    } catch (e) {
      toast.error('Failed to save report note');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Definitive Complete Task Execution Handler
  const handleCompleteTask = async () => {
    const trimmedReport = reportNote.trim();
    if (!isAllValidationPassed || !hasValidLogisticReport(trimmedReport)) {
      setIsValidationModalOpen(true);
      setIsExpanded(true);
      if (!hasValidLogisticReport(trimmedReport) && unmetGates.length <= 1) {
        toast.error(t('logisticReportRequiredError') || 'Logistic Report is compulsory to fill before finishing the task.');
      } else {
        toast.error(`Cannot complete task: ${unmetGates.length} validation gate(s) require resolution.`);
      }
      return;
    }

    if (isCompletingRef.current || isSubmittingCompletion || completingTaskIds.has(task.id)) {
      return;
    }

    const trimmedEmail = taskEmail.trim().toLowerCase();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError(t('invalidEmail') || 'Please enter a valid email address.');
        toast.error(t('invalidEmail') || 'Please enter a valid email address.');
        return;
      }
    }
    setEmailError(null);

    isCompletingRef.current = true;
    setIsSubmittingCompletion(true);
    try {
      const pendingNotes = trimmedReport !== (task.notes || '') ? trimmedReport : undefined;

      const result = await updateTaskStatus(task.id, 'completed', {
        studentEmail: trimmedEmail || undefined,
        notes: pendingNotes
      });

      if (result?.queuedLocally && !result?.synced) {
        toast('Saved on device — waiting for internet to sync to cloud database', {
          icon: '📶',
          duration: 4000
        });
      } else {
        toast.success('🎉 Task completed successfully! Submissions and audit proofs logged.');
      }
      setIsValidationModalOpen(false);
    } catch (err: any) {
      console.error('Error completing task:', err);
      toast.error(err.message || 'Failed to complete task in Firestore.');
    } finally {
      setIsSubmittingCompletion(false);
      isCompletingRef.current = false;
    }
  };

  // Status Badge Helper (Canonical colors: in_progress=blue, pending=amber, completed=emerald, cancelled=rose)
  const renderStatusPill = () => {
    const isPendingSync = pendingTaskIds.has(task.id);
    const isCompleting = completingTaskIds.has(task.id);

    const statusBadge = (() => {
      switch (effectiveStatus) {
        case 'completed':
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs ${getTaskStatusBadgeClasses('completed')}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {t('completed')}
            </span>
          );
        case 'in_progress':
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs ${getTaskStatusBadgeClasses('in_progress')}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              {t('in_progress')}
            </span>
          );
        case 'cancelled':
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs ${getTaskStatusBadgeClasses('cancelled')}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              {t('cancelled') || 'Cancelled'}
            </span>
          );
        default:
          return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs ${getTaskStatusBadgeClasses('pending')}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {t('pending')}
            </span>
          );
      }
    })();

    if (!isCompleting && !isPendingSync) return statusBadge;

    return (
      <span className="inline-flex items-center gap-1.5">
        {statusBadge}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white border border-slate-700 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
          {isOnline ? 'Syncing...' : 'Sync Queued'}
        </span>
      </span>
    );
  };

  // SLA Pill Helper
  const renderSlaPill = () => {
    if (slaInfo.state === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
          <Clock size={11} className="shrink-0 text-amber-600" />
          <span>{slaInfo.text}</span>
        </span>
      );
    }
    if (slaInfo.state === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={11} className="shrink-0 text-emerald-600" />
          <span>{slaInfo.text}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={11} className="shrink-0 text-slate-400" />
        <span>{slaInfo.text}</span>
      </span>
    );
  };

  const taskCategory = getTaskCategory(task);
  const scheduleBucket = getTaskScheduleBucket(task);
  const displayName = getTaskSubjectName(task, students, language);
  const serviceLabel = getTaskServiceLabel(task, presets, language);
  const taskTitle = getTaskDisplayTitle(task, presets, language);
  const categoryBadgeLabel =
    taskCategory === 'non_student'
      ? (t('nonStudentCategory') || 'Non-Student')
      : taskCategory === 'student_custom'
        ? (t('studentCustomCategory') || 'Student Custom')
        : (t('studentPresetCategory') || 'Student SOP');

  const contactNumber = isNonStudent
    ? (task.nonStudentContact || '').trim()
    : (student?.contactInfo && !student.contactInfo.includes('@') ? student.contactInfo.trim() : '');
  const whatsappUrl = useMemo(() => formatWhatsAppUrl(contactNumber), [contactNumber]);

  const flightNo = (task.flightNumber || student?.flightDetails?.flightNumber || '').trim();
  const flightAirline = (student?.flightDetails?.airline || '').trim();
  const flightTerminal = (student?.flightDetails?.terminal || '').trim();
  const studentPackage = !isNonStudent ? (student?.package || (student as any)?.servicePackage) : undefined;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all overflow-hidden flex flex-col group relative">
        {/* Top Accent Stripe based on status */}
        <div className={`h-1 w-full ${getTaskStatusAccentClass(effectiveStatus)}`} />

        {/* 1. INFORMATION ARCHITECTURE: Top Header with High-Contrast Typography */}
        <div className="p-4 pb-3 bg-gradient-to-b from-slate-50/80 to-white dark:from-slate-900 dark:to-slate-900 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          {/* Preset SOP / Service Label, Category & Status Badges in Top Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wider shadow-2xs",
                isNonStudent ? "bg-purple-950 text-purple-100" : taskCategory === 'student_custom' ? "bg-teal-900 text-teal-50" : "bg-blue-950 text-white"
              )}>
                <span className={`w-1.5 h-1.5 rounded-full ${isNonStudent ? 'bg-purple-400' : taskCategory === 'student_custom' ? 'bg-teal-300' : 'bg-red-500'} shrink-0`}></span>
                <span className="truncate max-w-[200px] sm:max-w-xs">{serviceLabel}</span>
              </span>

              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border shadow-2xs",
                taskCategory === 'non_student'
                  ? "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-800"
                  : taskCategory === 'student_custom'
                  ? "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-800"
                  : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              )}>
                {categoryBadgeLabel}
              </span>

              {isOpenTask(task) && scheduleBucket === 'overdue' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800 shadow-2xs">
                  {t('overdue') || 'Overdue'}
                </span>
              )}

              {isOpenTask(task) && scheduleBucket === 'unscheduled' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800 shadow-2xs">
                  {t('unscheduled') || 'Unscheduled'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(task.feedbackSubmitted || task.feedback) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFeedbackDrawerOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 shadow-xs transition-all active:scale-95 cursor-pointer"
                  title="Inspect student feedback & survey answers"
                >
                  <Star size={12} className="fill-slate-950 text-slate-950" />
                  <span>Feedback Received</span>
                  <span className="bg-slate-950 text-amber-300 text-[10px] font-black px-1.5 py-0.2 rounded-md">
                    {task.feedback?.rating ?? 5}★
                  </span>
                </button>
              )}
              {renderSlaPill()}
              {renderStatusPill()}
            </div>
          </div>

          {/* Student / Beneficiary Full Name, One-Tap WhatsApp Contact & Assignee Headline */}
          <div className="flex items-start justify-between gap-2 mt-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 
                  onClick={() => !isNonStudent && setIsDossierOpen(true)}
                  className={cn(
                    "text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight line-clamp-1 transition-colors flex items-center gap-1.5",
                    !isNonStudent ? "hover:text-red-600 cursor-pointer" : ""
                  )}
                  title={!isNonStudent ? `View Dossier for ${displayName}` : displayName}
                >
                  <span>{displayName}</span>
                  {!isNonStudent && (
                    <span className="text-slate-300 text-xs font-normal group-hover:text-red-400 transition-colors">↗</span>
                  )}
                </h3>

                {/* Student Service Package Badge right next to Student Name */}
                {studentPackage && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border shadow-2xs",
                      studentPackage === '500$'
                        ? "bg-purple-50 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/60"
                        : studentPackage === '300$'
                        ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                        : studentPackage === '300$(Free)'
                        ? "bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800/60"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    )}
                    title={`Student Service Package: ${studentPackage}`}
                  >
                    <Sparkles
                      size={11}
                      className={cn(
                        "shrink-0",
                        studentPackage === '500$'
                          ? "text-purple-600"
                          : studentPackage === '300$'
                          ? "text-emerald-600"
                          : studentPackage === '300$(Free)'
                          ? "text-teal-600"
                          : "text-slate-500"
                      )}
                    />
                    <span>{studentPackage}</span>
                  </span>
                )}

                {/* Flight Number Badge right next to Student Name */}
                {flightNo && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-sky-50 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 shadow-2xs"
                    title={`Flight: ${flightAirline ? `${flightAirline} ` : ''}${flightNo}${flightTerminal ? ` (${flightTerminal})` : ''}`}
                  >
                    <Plane size={12} className="text-sky-600 shrink-0" />
                    <span>{flightAirline ? `${flightAirline} ` : ''}{flightNo}</span>
                    {flightTerminal && (
                      <span className="text-[10px] font-bold text-sky-600">• {flightTerminal}</span>
                    )}
                  </span>
                )}
              </div>

              {/* One-Tap WhatsApp Contact Pill */}
              {contactNumber && (
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/90 dark:border-emerald-800/70 shadow-2xs transition-all active:scale-95 cursor-pointer"
                      title={`Message ${displayName} on WhatsApp (${contactNumber})`}
                    >
                      <Phone size={12} className="text-emerald-600 shrink-0" />
                      <span className="font-mono">{contactNumber}</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
                        WhatsApp ↗
                      </span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-semibold">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">{contactNumber}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Officer Assignee Badge for Admin / Coord mode */}
            {!isFieldOfficer && assignee && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 shrink-0 bg-slate-100/80 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                <UserIcon size={12} className="text-slate-500" />
                <span className="font-semibold truncate max-w-[100px]">{assignee.name}</span>
              </div>
            )}
          </div>

          {/* Counselor Remarks Callout for Operations Coordinator (student tasks only) */}
          {!isNonStudent && student?.counselorRemarks && (
            <div className="mt-2.5 bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5 text-xs">
              <MessageSquare size={13} className="text-purple-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="font-bold text-purple-900 dark:text-purple-300 text-[10px] uppercase tracking-wider mr-1">
                  Counselor Note:
                </span>
                <span className="font-medium text-purple-950 dark:text-purple-200 line-clamp-1">{student.counselorRemarks}</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. ICONOGRAPHY FOR METADATA: Glanceable Badges Strip */}
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50/40 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
          {/* Location / University */}
          {student?.university && (
            <div className="flex items-center gap-1 truncate max-w-[240px]" title={student.university}>
              <MapPin size={13} className="text-red-500 shrink-0" />
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{student.university}</span>
            </div>
          )}

          {/* Hotel Location */}
          {task.hotel && (
            <div className="flex items-center gap-1 truncate max-w-[180px]" title={task.hotel}>
              <Hotel size={13} className="text-amber-600 shrink-0" />
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{task.hotel}</span>
            </div>
          )}

          {/* Flight Number in Metadata Strip */}
          {flightNo && (
            <div className="flex items-center gap-1" title={`Flight No: ${flightNo}`}>
              <Plane size={13} className="text-sky-600 shrink-0" />
              <span className="font-bold text-sky-800 dark:text-sky-300">{flightNo}</span>
            </div>
          )}

          {/* Scheduled Date */}
          {task.taskDate && (
            <div className="flex items-center gap-1">
              <Calendar size={13} className="text-blue-600 shrink-0" />
              <span className="font-medium text-slate-700 dark:text-slate-200">{formatDateDDMMYYYY(task.taskDate)}</span>
            </div>
          )}

          {/* Scheduled / Task Time */}
          {task.taskTime && (
            <div className="flex items-center gap-1">
              <Clock size={13} className="text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 dark:text-slate-200">{task.taskTime}</span>
            </div>
          )}

          {/* Vehicle */}
          {task.vehicleId && (
            <div className="flex items-center gap-1">
              <Car size={13} className="text-emerald-600 shrink-0" />
              <span className="font-medium text-slate-700 dark:text-slate-200">{vehicle?.name || task.vehicleId}</span>
            </div>
          )}

          {/* Started & Duration */}
          {task.startedAt && (
            <div className="flex items-center gap-1 text-slate-500">
              <Clock size={13} className="text-red-500 shrink-0" />
              <span>
                {new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="text-slate-400 font-mono ml-1">({formatDuration(task.startedAt, task.completedAt)})</span>
              </span>
            </div>
          )}

          {/* Feedback Received Badge in metadata strip */}
          {(task.feedbackSubmitted || task.feedback) && (
            <button
              type="button"
              onClick={() => setIsFeedbackDrawerOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              title="Click to inspect answers and feedback"
            >
              <Star size={12} className="fill-amber-500 text-amber-600" />
              <span>{task.feedback?.rating ?? 5}★ Feedback</span>
            </button>
          )}

          {/* Visual Audit Proofs count */}
          {totalProofsCount > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-md border border-red-200/60 dark:border-red-900/60 transition-colors cursor-pointer"
              title="View attached visual proofs"
            >
              <Camera size={12} className="shrink-0" />
              <span>{totalProofsCount} {totalProofsCount === 1 ? 'proof' : 'proofs'}</span>
            </button>
          )}

          {/* Task Expenses badge */}
          {taskExpensesTotal > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="View task expenses"
            >
              <Receipt size={12} className="text-red-600 shrink-0" />
              <span>{formatCurrency(taskExpensesTotal)}</span>
            </button>
          )}

          {/* Strictly Admin-Only QC Status Pill */}
          {isAdminQC && taskQCReview && (
            <button
              type="button"
              onClick={() => setIsQCModalOpen(true)}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md border transition-colors cursor-pointer',
                QC_GRADES[taskQCReview.grade].badgeClasses
              )}
              title="Admin-Only Quality Control Report"
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', QC_GRADES[taskQCReview.grade].dotClass)} />
              <span>QC: {getQCGradeLabel(taskQCReview.grade, language)}</span>
              {taskQCReview.needsUrgentCall && !taskQCReview.urgentCallResolved && (
                <PhoneCall size={10} className="text-rose-600 ml-0.5" />
              )}
            </button>
          )}

          {/* In-Progress Validation Gate Mini Indicator */}
          {isFieldOfficer && effectiveStatus === 'in_progress' && (
            <div 
              onClick={() => setIsValidationModalOpen(true)}
              className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors bg-white shadow-2xs hover:bg-slate-50"
              title="Click to check validation gates"
            >
              {isAllValidationPassed ? (
                <span className="text-emerald-600 flex items-center gap-1 font-bold">
                  <CheckCircle2 size={11} /> All Gates Passed
                </span>
              ) : (
                <span className="text-amber-700 flex items-center gap-1 font-semibold">
                  <AlertTriangle size={11} className="text-amber-500" /> {passedGatesCount}/{totalGatesCount} Gates
                </span>
              )}
            </div>
          )}
        </div>

        {/* Embedded Student Email Input Field directly on the card */}
        {effectiveStatus !== 'cancelled' && (
          <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Mail size={13} className="text-red-600 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hidden sm:inline">
                  {isNonStudent ? 'Recipient Email' : t('studentEmail')}:
                </span>
              </div>
              <div className="flex-1 relative min-w-0">
                <input
                  type="email"
                  value={taskEmail}
                  disabled={isAccountant || isSavingEmail || (effectiveStatus === 'completed' && task.feedbackSubmitted)}
                  readOnly={isAccountant}
                  onChange={(e) => {
                    if (isAccountant) return;
                    setTaskEmail(e.target.value);
                    setIsEmailDirty(true);
                    setEmailError(null);
                  }}
                  onBlur={() => {
                    if (!isAccountant && isEmailDirty) {
                      handleSaveEmail();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!isAccountant && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEmail();
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder={t('enterStudentEmail') || 'Student email (optional, for CSAT survey)...'}
                  className={cn(
                    "w-full text-xs px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all",
                    emailError 
                      ? "border-red-400 focus:ring-2 focus:ring-red-400/20 bg-red-50/30"
                      : isEmailSaved
                      ? "border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-emerald-50/20"
                      : "border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20",
                    (isAccountant || (effectiveStatus === 'completed' && task.feedbackSubmitted)) && "bg-slate-100/60 text-slate-500 border-slate-200 cursor-not-allowed"
                  )}
                />
                {isSavingEmail && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!isSavingEmail && isEmailSaved && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600 flex items-center gap-1" title="Saved to Firestore">
                    <Check size={14} className="stroke-[2.5]" />
                  </div>
                )}
              </div>
              {!isAccountant && isEmailDirty && !isSavingEmail && !(effectiveStatus === 'completed' && task.feedbackSubmitted) && (
                <button
                  type="button"
                  onClick={() => handleSaveEmail()}
                  className="px-2.5 py-1.5 text-[11px] font-bold bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  {t('save') || 'Save'}
                </button>
              )}
            </div>
            {emailError && (
              <p className="text-[11px] text-red-600 font-semibold flex items-center gap-1 pl-1 animate-in fade-in">
                <AlertCircle size={12} className="shrink-0" />
                <span>{emailError}</span>
              </p>
            )}
            {!task.studentEmail && student?.email && !isEmailDirty && (
              <span className="text-[10px] text-slate-400 pl-6">
                Auto-populated from linked student profile
              </span>
            )}

            {/* Feedback & Survey Actions for Completed Tasks - Admin & Coordinator */}
            {effectiveStatus === 'completed' && canResendFeedback && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 mt-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 min-w-0">
                  {task.feedbackEmailSent ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 truncate" title={`Sent at ${task.feedbackEmailSentAt || ''}`}>
                      <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Email sent {task.feedbackEmailSentAt ? format(new Date(task.feedbackEmailSentAt), 'MMM dd, HH:mm') : ''}</span>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <AlertCircle size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Feedback email not sent yet</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Direct Open Feedback Form in New Tab */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const feedbackUrl = `${window.location.origin}${window.location.pathname}?view=feedback&taskId=${task.id}`;
                      window.open(feedbackUrl, '_blank');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-[11px] font-bold rounded-lg border border-blue-200 dark:border-blue-800/80 transition-all shrink-0 cursor-pointer"
                    title="Open student feedback form in a new tab"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span>Open Form</span>
                  </button>

                  {/* Copy Feedback Direct Link to Clipboard */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const feedbackUrl = `${window.location.origin}${window.location.pathname}?view=feedback&taskId=${task.id}`;
                      navigator.clipboard.writeText(feedbackUrl);
                      toast.success('Feedback link copied to clipboard!');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-all shrink-0 cursor-pointer shadow-2xs active:scale-95"
                    title="Copy student feedback link to clipboard for WhatsApp"
                  >
                    <Copy size={11} className="shrink-0" />
                    <span>Copy Link</span>
                  </button>

                  {/* Send / Resend Feedback Email */}
                  <button
                    type="button"
                    disabled={isResendingEmail}
                    onClick={() => handleResendFeedbackEmail()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer disabled:opacity-50"
                    title="Dispatch CSAT survey email to recipient"
                  >
                    {isResendingEmail ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send size={11} className="shrink-0" />
                        <span>{task.feedbackEmailSent ? 'Resend Email' : 'Send Email'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Read-only feedback sent indicator for Field Officer / non-admin */}
            {effectiveStatus === 'completed' && !canResendFeedback && task.feedbackEmailSent && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                <span className="text-emerald-700 font-semibold flex items-center gap-1 truncate" title={`Sent at ${task.feedbackEmailSentAt || ''}`}>
                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                  <span>Email sent {task.feedbackEmailSentAt ? format(new Date(task.feedbackEmailSentAt), 'MMM dd, HH:mm') : ''}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3. PROGRESS SUMMARY: Fraction & Mini Progress Bar with Expandable Accordion Toggle */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0">
              {completedSubtasksCount}/{totalSubtasksCount} <span className="text-slate-400 font-normal">subtasks</span>
            </span>

            {/* Mini Progress Bar */}
            <div className="flex-1 max-w-[140px] sm:max-w-[180px] h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  progressPercentage === 100 ? 'bg-emerald-500' : 'bg-red-600'
                }`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
              {progressPercentage}%
            </span>
          </div>

          {/* Accordion Toggle Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border shrink-0 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-2xs active:scale-95 cursor-pointer"
            title={isExpanded ? 'Collapse checklist' : 'Expand full checklist'}
          >
            <span>{isExpanded ? 'Hide SOP' : 'View SOP'}</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* 4. EXPANDABLE ACCORDION: Granular Subtask Checklist, Proofs, Notes, Expenses & Validation Gate Section */}
        {isExpanded && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Student / Beneficiary Communication Checklist Item */}
            {includeCommunicationStep && (
            <div className={cn(
              "p-3 bg-blue-50/70 rounded-xl border border-blue-100 flex flex-col gap-2",
              isSubtaskReadOnly ? "cursor-default select-none" : ""
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isSubtaskReadOnly ? (
                    <div 
                      className="shrink-0 cursor-default select-none text-slate-400 pointer-events-none"
                      aria-hidden="true"
                    >
                      {task.studentCommunicated ? (
                        <CheckCircle2 size={20} className="text-green-600" />
                      ) : (
                        <Circle size={20} className="text-slate-300" />
                      )}
                    </div>
                  ) : (
                    <button 
                      type="button"
                      disabled={effectiveStatus === 'completed' || effectiveStatus === 'cancelled'}
                      onClick={async () => {
                        try {
                          await updateTaskCommunication(task.id, !task.studentCommunicated);
                          toast.success(task.studentCommunicated ? 'Communication marked pending' : 'Communication verified');
                        } catch (error) {
                          toast.error('Failed to update communication');
                        }
                      }}
                      className="shrink-0 hover:scale-110 transition-transform text-slate-400 hover:text-green-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {task.studentCommunicated ? (
                        <CheckCircle2 size={20} className="text-green-600" />
                      ) : (
                        <Circle size={20} className="text-slate-300" />
                      )}
                    </button>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-xs font-bold select-none",
                        isSubtaskReadOnly ? "cursor-default" : "",
                        task.studentCommunicated ? 'line-through text-slate-500' : 'text-blue-950'
                      )}>
                        {isNonStudent ? 'Communicate with Beneficiary' : 'Communicate with Student'}
                      </span>
                      {task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0 ? (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold select-none">Proof Attached</span>
                      ) : (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold select-none">Proof Required</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 select-none">
                      {isNonStudent ? 'Contact / coordinate & attach screenshot proof' : 'Contact via WhatsApp / Call & attach screenshot proof'}
                    </p>
                    {task.studentCommunicated && (
                      <span className="block text-[10px] text-slate-400 font-mono select-none mt-0.5">
                        ✓ {task.studentCommunicationMedia?.[0]?.timestamp 
                            ? new Date(task.studentCommunicationMedia[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : (task.startedAt ? new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      title={`Message ${displayName} on WhatsApp`}
                    >
                      <Phone size={12} />
                      <span className="text-[10px]">WhatsApp</span>
                    </a>
                  )}
                  {!isSubtaskReadOnly && isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => onUploadPhoto?.(task.id, undefined, true)}
                      className="p-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      title={isNonStudent ? 'Upload beneficiary communication proof' : 'Upload student communication proof'}
                    >
                      <Camera size={13} />
                      <span className="text-[10px]">Photo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Communication Proofs Thumbnails */}
              {task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-blue-100/60 dark:border-blue-900/40">
                  {task.studentCommunicationMedia.map((item, i) => (
                    <div 
                      key={i}
                      className="inline-flex items-center gap-1.5 p-1 bg-white dark:bg-slate-800/80 rounded-xl border border-blue-200 dark:border-blue-900/50 shadow-2xs"
                    >
                      {/* Unobstructed photo thumbnail */}
                      <button
                        type="button"
                        onClick={() => onViewProof?.({
                          url: item.url,
                          timestamp: item.timestamp,
                          location: item.location || 'Location unavailable',
                          title: `${isNonStudent ? 'Beneficiary' : 'Student'} Communication (${displayName})`,
                          taskId: task.id,
                          mediaIndex: i,
                          isCommunication: true
                        })}
                        className="group relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer border border-blue-200 dark:border-blue-800/60 hover:border-blue-500 transition-all shrink-0 active:scale-95"
                        title="Tap to inspect full photo proof"
                      >
                        <img src={item.url} alt="Communication Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[9px] font-bold">
                          View
                        </div>
                      </button>

                      {/* Separate outside discard button */}
                      {onDeleteProof && mode === 'field_officer' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('confirmDiscardProof') || 'Discard this photo proof?')) {
                              onDeleteProof(task.id, undefined, i, true);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer active:scale-95"
                          title={t('discardPhoto') || "Discard photo proof"}
                          aria-label="Discard photo proof"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Granular Subtasks List */}
            <div className={`space-y-2 ${!isSubtaskReadOnly && isFieldOfficer && (effectiveStatus === 'pending' || effectiveStatus === 'cancelled') ? 'opacity-60 pointer-events-none' : ''}`}>
              {nonCommSubtasks.map((st) => {
                const title = language === 'ar' ? (st.titleAr || st.titleEn) : st.titleEn;
                const hasProof = st.media && st.media.length > 0;
                return (
                  <div 
                    key={st.id} 
                    className={cn(
                      "p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex flex-col gap-2",
                      isSubtaskReadOnly ? "cursor-default select-none" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {isSubtaskReadOnly ? (
                          <div 
                            className="shrink-0 cursor-default select-none pointer-events-none"
                            aria-hidden="true"
                          >
                            {st.isCompleted ? (
                              <CheckCircle2 size={18} className="text-green-600" />
                            ) : (
                              <Circle size={18} className="text-slate-300" />
                            )}
                          </div>
                        ) : (
                          <button 
                            type="button"
                            disabled={effectiveStatus === 'completed' || effectiveStatus === 'cancelled'}
                            onClick={async () => {
                              // If trying to complete an uncompleted subtask that requires proof
                              if (!st.isCompleted && st.requiresProof && !hasProof) {
                                toast.error('Visual audit proof required! Capture a GPS-watermarked photo before checking off this milestone.');
                                onUploadPhoto?.(task.id, st.id, false);
                                return;
                              }

                              try {
                                await updateSubTaskStatus(task.id, st.id, !st.isCompleted, false);
                                toast.success(st.isCompleted ? 'Subtask marked pending' : 'Subtask completed');
                              } catch (error) {
                                toast.error('Failed to update subtask');
                              }
                            }}
                            className="shrink-0 hover:scale-110 transition-transform cursor-pointer"
                          >
                            {st.isCompleted ? (
                              <CheckCircle2 size={18} className="text-green-600" />
                            ) : (
                              <Circle size={18} className="text-slate-300" />
                            )}
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "text-xs font-semibold select-none",
                              isSubtaskReadOnly ? "cursor-default" : "",
                              st.isCompleted ? 'line-through text-slate-400' : 
                              st.isSkipped ? 'line-through text-red-400' : 
                              'text-slate-800'
                            )}>
                              {title}
                            </span>
                            {!st.isSkipped && (
                              st.requiresProof ? (
                                hasProof ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold inline-flex items-center gap-1 select-none">
                                    <Camera size={10} /> Proof Attached
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-[9px] font-bold inline-flex items-center gap-1 select-none">
                                    <Camera size={10} /> Photo Required
                                  </span>
                                )
                              ) : (
                                hasProof && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-medium inline-flex items-center gap-1 select-none">
                                    <Camera size={10} /> Proof Attached
                                  </span>
                                )
                              )
                            )}
                          </div>
                          {st.completedAt && (
                            <span className="block text-[10px] text-slate-400 font-mono select-none">
                              ✓ {new Date(st.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isSubtaskReadOnly && isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && !st.isCompleted && !st.isSkipped && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await updateSubTaskStatus(task.id, st.id, false, true);
                                toast.success('Subtask skipped');
                              } catch (e) {
                                toast.error('Failed to skip subtask');
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                            title="Skip this subtask"
                          >
                            <X size={14} />
                          </button>
                        )}

                        {!isSubtaskReadOnly && isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => onUploadPhoto?.(task.id, st.id, false)}
                            className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Capture GPS-watermarked proof"
                          >
                            <Camera size={13} />
                            <span className="text-[10px]">Proof</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subtask Attached Proofs */}
                    {st.media && st.media.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {st.media.map((item, i) => (
                          <div 
                            key={i}
                            className="inline-flex items-center gap-1.5 p-1 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs"
                          >
                            {/* Unobstructed photo thumbnail */}
                            <button
                              type="button"
                              onClick={() => onViewProof?.({
                                url: item.url,
                                timestamp: item.timestamp,
                                location: item.location || 'Location unavailable',
                                title: `${title} (${displayName})`,
                                taskId: task.id,
                                subTaskId: st.id,
                                mediaIndex: i,
                                isCommunication: false
                              })}
                              className="group relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-red-500 transition-all shrink-0 active:scale-95"
                              title="Tap to inspect full photo proof"
                            >
                              <img src={item.url} alt="Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[9px] font-bold">
                                View
                              </div>
                            </button>

                            {/* Separate outside discard button */}
                            {onDeleteProof && mode === 'field_officer' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(t('confirmDiscardProof') || 'Discard this photo proof?')) {
                                    onDeleteProof(task.id, st.id, i, false);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer active:scale-95"
                                title={t('discardPhoto') || "Discard photo proof"}
                                aria-label="Discard photo proof"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Coordinator Notes (if present) */}
            {(task.coordinatorNote1 || task.coordinatorNote2) && (
              <div className="space-y-2 pt-1">
                {task.coordinatorNote1 && (
                  <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-900 uppercase tracking-wider text-[9px] block">Coordinator Note 1</span>
                      <p className="text-amber-950 font-medium">{task.coordinatorNote1}</p>
                    </div>
                  </div>
                )}
                {task.coordinatorNote2 && (
                  <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-900 uppercase tracking-wider text-[9px] block">Coordinator Note 2</span>
                      <p className="text-amber-950 font-medium">{task.coordinatorNote2}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Counselor Remarks Expanded Section */}
            {student?.counselorRemarks && (
              <div className="bg-purple-50/80 border border-purple-200 p-3 rounded-xl text-xs flex items-start gap-2.5 shadow-2xs">
                <MessageSquare size={16} className="text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-purple-900 uppercase tracking-wider text-[10px] block mb-0.5">
                    Counselor Remarks (Live Context)
                  </span>
                  <p className="text-purple-950 font-medium leading-relaxed">{student.counselorRemarks}</p>
                </div>
              </div>
            )}

            {/* Logistic Report Section */}
            {(isFieldOfficer || task.notes) && (
              <div className="pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText size={13} className="text-red-600 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      {t('logisticReport')}
                    </span>
                    {isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                      <span className="text-red-600 font-black text-xs" title={t('logisticReportRequired') || 'Compulsory'}>*</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isSavingNotes ? (
                      <span className="text-[10px] text-red-600 animate-pulse font-medium">{t('saving') || 'Saving...'}</span>
                    ) : isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' ? (
                      <>
                        {task.notesUpdatedAt && (
                          <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                            {t('lastSaved') || 'Saved'} {format(new Date(task.notesUpdatedAt), 'HH:mm')}
                          </span>
                        )}
                        {hasValidLogisticReport(reportNote) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={10} />
                            <span>{t('logisticReportReady') || 'Filled'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <AlertCircle size={10} />
                            <span>{t('logisticReportRequired') || 'Compulsory'}</span>
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>

                {(() => {
                  const cardReportTimestamp = task.notesUpdatedAt || (task.status === 'completed' ? task.completedAt : undefined);
                  const formattedCardReportTime = (() => {
                    if (!cardReportTimestamp) return null;
                    try {
                      const d = new Date(cardReportTimestamp);
                      if (Number.isNaN(d.getTime())) return null;
                      return format(d, 'MMM dd, yyyy • HH:mm');
                    } catch {
                      return null;
                    }
                  })();

                  return isFieldOfficer ? (
                    <div>
                      <textarea
                        ref={reportTextareaRef}
                        value={reportNote}
                        onChange={e => setReportNote(e.target.value)}
                        onFocus={() => { isNoteFocusedRef.current = true; }}
                        onBlur={() => {
                          isNoteFocusedRef.current = false;
                          handleNotesBlur(false);
                        }}
                        disabled={effectiveStatus === 'completed' || effectiveStatus === 'cancelled'}
                        rows={2}
                        placeholder={t('logisticReportPlaceholder') || 'Compulsory: Enter final operational report / logistics summary before completion...'}
                        className={cn(
                          "w-full p-2.5 bg-white border rounded-xl text-xs focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-none transition-all disabled:opacity-75 disabled:bg-slate-100",
                          effectiveStatus === 'in_progress' && !hasValidLogisticReport(reportNote)
                            ? "border-amber-300"
                            : hasValidLogisticReport(reportNote) && effectiveStatus === 'in_progress'
                            ? "border-emerald-300"
                            : "border-slate-200"
                        )}
                      />
                      {(effectiveStatus === 'completed' || effectiveStatus === 'cancelled') && formattedCardReportTime && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-medium px-1">
                          <Clock size={10} className="text-slate-400 shrink-0" />
                          <span>{t('reportWritten') || 'Report written'}: {formattedCardReportTime}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                      <p className="text-xs text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">
                        {task.notes || 'No notes submitted.'}
                      </p>
                      {formattedCardReportTime && (
                        <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                          <Clock size={10} className="text-slate-400 shrink-0" />
                          <span>{t('reportWritten') || 'Report written'}: {formattedCardReportTime}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Operational Expenses Breakdown */}
            <div className="pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Receipt size={14} className="text-red-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    {t('taskExpenses')}
                  </span>
                  {taskExpensesTotal > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-extrabold bg-red-100 text-red-700 rounded-full">
                      {formatCurrency(taskExpensesTotal)}
                    </span>
                  )}
                </div>

                {isFieldOfficer && effectiveStatus !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => onOpenExpenseModal?.(task)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                  >
                    <Plus size={12} />
                    <span>{t('logExpense')}</span>
                  </button>
                )}
              </div>

              {taskExpenses.length > 0 ? (
                <div className="space-y-1.5">
                  {taskExpenses.map(exp => {
                    const expVeh = resolveExpenseVehicle(exp, vehicles);
                    const isExpSettled = Boolean(exp.isSettled);
                    return (
                    <div 
                      key={exp.id} 
                      className={cn(
                        "p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors",
                        isExpSettled
                          ? "bg-teal-50/90 border-teal-300 dark:bg-teal-950/60 dark:border-teal-700"
                          : "bg-white border-slate-200/80"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {exp.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => onViewReceipt?.(exp)}
                            className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0 hover:opacity-80"
                            title="View watermarked receipt"
                          >
                            <img src={exp.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 text-[11px]">{exp.category}</span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold border",
                                isExpSettled
                                  ? "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700"
                                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                              )}
                            >
                              {isExpSettled ? <CheckCircle2 size={9} /> : <Clock size={9} />}
                              <span>{isExpSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}</span>
                            </span>
                            {expVeh && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold">
                                <Car size={10} className="text-red-600 shrink-0" />
                                <span className="truncate">{expVeh.label}</span>
                              </span>
                            )}
                          </div>
                          {exp.notes && <span className="text-[10px] text-slate-500 block truncate">{exp.notes}</span>}
                        </div>
                      </div>

                      <span className="font-bold text-red-600 text-xs shrink-0">
                        {formatAmountWithSign(exp.amount, 'expense')}
                      </span>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic bg-white p-2 rounded-lg border border-slate-100">
                  {t('noExpensesLogged')}
                </p>
              )}
            </div>

            {/* Field Officer: Prominent In-Checklist Complete Action Bar */}
            {isFieldOfficer && effectiveStatus === 'in_progress' && (
              <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                {/* Validation Gate Progress Info Box */}
                <div className="p-3 bg-slate-100/90 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className={isAllValidationPassed ? "text-emerald-600" : "text-amber-500"} />
                    <div>
                      <span className="font-bold text-slate-800 block text-[11px]">
                        Task Completion Validation Gates
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {isAllValidationPassed 
                          ? '✓ All mandatory checkpoints, GPS proofs & Logistic Report verified.' 
                          : `${unmetGates.length} gate(s) require action before final submission.`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsValidationModalOpen(true)}
                    className="text-[11px] font-bold text-blue-900 bg-white hover:bg-blue-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                  >
                    {isAllValidationPassed ? 'Review (All Set)' : `Resolve (${unmetGates.length})`}
                  </button>
                </div>

                {/* Full Width Definitive Complete Task Button */}
                <button
                  type="button"
                  disabled={isSubmittingCompletion || completingTaskIds.has(task.id)}
                  onClick={handleCompleteTask}
                  className={`w-full py-3.5 px-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 cursor-pointer ${
                    isAllValidationPassed
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 shadow-slate-900/20'
                  }`}
                >
                  {isSubmittingCompletion || completingTaskIds.has(task.id) ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Logging Final Submissions to Firestore...</span>
                    </>
                  ) : isAllValidationPassed ? (
                    <>
                      <CheckCircle2 size={18} className="text-white" />
                      <span>Complete Task & Submit Report</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={17} className="text-amber-400" />
                      <span>Complete Task ({unmetGates.length} Gate{unmetGates.length > 1 ? 's' : ''} Remaining)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Student Feedback (if available) */}
            {task.feedback && (
              <div className="pt-2 border-t border-slate-200/80">
                <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-amber-500">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          size={14}
                          className={star <= task.feedback!.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
                        />
                      ))}
                      <span className="font-extrabold text-slate-900 text-xs ml-1">{task.feedback.rating} / 5</span>
                    </div>
                    {task.feedback.satisfaction && (
                      <span className="text-[10px] font-bold text-amber-950 bg-amber-200/80 px-2 py-0.5 rounded-full capitalize">
                        {task.feedback.satisfaction.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {task.feedback.comments && (
                    <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-xl border border-amber-100/80">
                      "{task.feedback.comments}"
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsFeedbackDrawerOpen(true)}
                    className="w-full py-2 px-3 bg-white hover:bg-amber-100/70 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
                  >
                    <span>Inspect Specific Answers & Feedback</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. UNIFIED STICKY ACTION ROW: Anchored at Bottom of Card */}
        <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 mt-auto">
          {/* Left Actions Group: Camera & Dossier & Expense */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Direct Canvas2D Photo Trigger Button */}
            {isFieldOfficer && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
              <button
                type="button"
                onClick={() => onUploadPhoto?.(task.id, undefined, false)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all active:scale-95 border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
                title="Capture GPS-watermarked photo proof"
              >
                <Camera size={14} className="text-red-600 dark:text-red-400 shrink-0" />
                <span className="hidden sm:inline">Photo</span>
              </button>
            )}

            {/* Student Dossier Button */}
            {!isNonStudent && (
              <button
                type="button"
                onClick={() => setIsDossierOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 hover:bg-blue-50 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-700 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-300 text-xs font-bold rounded-xl transition-all active:scale-95 border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
                title="View student dossier & arrival details"
              >
                <FileText size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Dossier</span>
              </button>
            )}

            {/* Quick Log Expense Button for Field Officers */}
            {isFieldOfficer && effectiveStatus !== 'cancelled' && (
              <button
                type="button"
                onClick={() => onOpenExpenseModal?.(task)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-red-700 dark:text-slate-200 dark:hover:text-red-400 text-xs font-bold rounded-xl transition-all active:scale-95 border border-slate-200 hover:border-red-200 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
                title="Log operational expense"
              >
                <Receipt size={14} className="text-red-600 dark:text-red-400 shrink-0" />
                <span className="hidden sm:inline">Expense</span>
              </button>
            )}
          </div>

          {/* Right Action: Status Modification / Start / Complete / Edit */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Field Officer: Start Task Button */}
            {isFieldOfficer && effectiveStatus === 'pending' && (
              <button
                type="button"
                disabled={isStartingTask}
                onClick={async () => {
                  if (isStartingTask || !onStartTask) return;
                  setIsStartingTask(true);
                  try {
                    await onStartTask(task);
                  } finally {
                    setIsStartingTask(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-red-600/30 active:scale-95 shrink-0 cursor-pointer"
              >
                <Play size={12} className="fill-white shrink-0" />
                <span>{isStartingTask ? '...' : t('startTask')}</span>
              </button>
            )}

            {/* Field Officer: Complete Task Button (Anchored) */}
            {isFieldOfficer && effectiveStatus === 'in_progress' && (
              <button
                type="button"
                disabled={isSubmittingCompletion || completingTaskIds.has(task.id)}
                onClick={handleCompleteTask}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all shadow-md active:scale-95 shrink-0 cursor-pointer ${
                  isAllValidationPassed
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30'
                    : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700'
                }`}
                title={isAllValidationPassed ? 'Submit report & complete task' : `Validation gates incomplete (${unmetGates.length} remaining)`}
              >
                {isSubmittingCompletion || completingTaskIds.has(task.id) ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></div>
                ) : isAllValidationPassed ? (
                  <CheckCircle2 size={13} className="text-white shrink-0" />
                ) : (
                  <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                )}
                <span>{isSubmittingCompletion || completingTaskIds.has(task.id) ? 'Syncing...' : isAllValidationPassed ? t('completeTask') : `Complete (${unmetGates.length})`}</span>
              </button>
            )}

            {/* Admin / Coord Mode: QC (Admin-only) & Edit Task & Delete Triggers */}
            {!isFieldOfficer && !isAccountant && (isAdminQC || onEditTask || (onDeleteTask && currentUser?.role === 'admin')) && (
              <div className="flex items-center gap-1.5 shrink-0">
                {isAdminQC && (
                  <button
                    type="button"
                    onClick={() => setIsQCModalOpen(true)}
                    className={cn(
                      'inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all border active:scale-95 cursor-pointer shadow-2xs shrink-0',
                      taskQCReview
                        ? QC_GRADES[taskQCReview.grade].badgeClasses
                        : 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
                    )}
                    title={t('qcReport') || 'Quality Control'}
                  >
                    <ShieldCheck size={13} className="shrink-0" />
                    <span>{t('qcReview') || 'QC'}</span>
                  </button>
                )}
                {onDeleteTask && currentUser?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-100/80 hover:bg-red-50 dark:bg-slate-800/80 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 text-xs font-semibold rounded-xl transition-all border border-slate-200/90 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/50 active:scale-95 cursor-pointer shadow-2xs shrink-0"
                    title={t('deleteTask') || 'Delete Task'}
                    aria-label={t('deleteTask') || 'Delete Task'}
                  >
                    <Trash2 size={13} className="shrink-0" />
                    <span className="hidden sm:inline">{t('delete') || 'Delete'}</span>
                  </button>
                )}
                {onEditTask && (
                  <button
                    type="button"
                    onClick={() => onEditTask(task)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs border border-transparent dark:border-slate-700 active:scale-95 cursor-pointer shrink-0"
                    title={t('editTaskDetails') || 'Edit Task Details'}
                  >
                    <Edit size={13} className="shrink-0 text-slate-300 dark:text-slate-400" />
                    <span className="hidden sm:inline">{t('editTaskDetails') || 'Edit Details'}</span>
                    <span className="sm:hidden">{t('edit') || 'Edit'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Gates Resolver Modal */}
      {isValidationModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div 
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 relative flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl text-white ${isAllValidationPassed ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                  {isAllValidationPassed ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg">Task Completion Validation Gates</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {passedGatesCount} of {totalGatesCount} Mandatory Requirements Verified
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsValidationModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Progress Bar */}
            <div className="h-1.5 w-full bg-slate-100 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${isAllValidationPassed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${totalGatesCount > 0 ? (passedGatesCount / totalGatesCount) * 100 : 100}%` }}
              />
            </div>

            {/* Modal Gate Checklist Content */}
            <div className="p-5 space-y-3 overflow-y-auto flex-1 bg-slate-50/50">
              <p className="text-xs text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                {t('logisticReportProtocolDesc') || 'Pioneer-4ss audit protocols require contact verification, GPS-watermarked visual audit proofs for required checkpoints, and a filled Logistic Report before finalizing a task.'}
              </p>

              <div className="space-y-2">
                {validationGates.map((gate) => {
                  if (gate.type === 'logistic_report') {
                    return (
                      <div
                        key={gate.id}
                        className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                          gate.isPassed
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : 'bg-white border-amber-300/80 shadow-2xs text-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="mt-0.5 shrink-0">
                              {gate.isPassed ? (
                                <CheckCircle2 size={18} className="text-emerald-600" />
                              ) : (
                                <AlertTriangle size={18} className="text-amber-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-xs block">{gate.title}</span>
                              <span className="text-[10px] text-slate-500 block leading-tight">{gate.description}</span>
                            </div>
                          </div>

                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                              gate.isPassed
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-amber-100 text-amber-800 border-amber-200"
                            )}
                          >
                            {gate.isPassed ? (t('logisticReportReady') || 'Filled') : (t('logisticReportRequired') || 'Compulsory')}
                          </span>
                        </div>

                        <textarea
                          value={reportNote}
                          onChange={e => setReportNote(e.target.value)}
                          onFocus={() => { isNoteFocusedRef.current = true; }}
                          onBlur={() => {
                            isNoteFocusedRef.current = false;
                            handleNotesBlur(true);
                          }}
                          disabled={effectiveStatus === 'completed' || effectiveStatus === 'cancelled'}
                          rows={3}
                          placeholder={t('logisticReportPlaceholder') || 'Compulsory: Enter final operational report / logistics summary before completion...'}
                          className={cn(
                            "w-full p-2.5 bg-white border rounded-xl text-xs focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-none transition-all",
                            gate.isPassed ? "border-emerald-300" : "border-amber-300"
                          )}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={gate.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        gate.isPassed
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-white border-amber-300/80 shadow-2xs text-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="mt-0.5 shrink-0">
                          {gate.isPassed ? (
                            <CheckCircle2 size={18} className="text-emerald-600" />
                          ) : (
                            <AlertTriangle size={18} className="text-amber-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs block truncate">{gate.title}</span>
                          <span className="text-[10px] text-slate-500 block leading-tight">{gate.description}</span>
                        </div>
                      </div>

                      {!gate.isPassed && (
                        <div className="shrink-0">
                          {gate.type === 'communication' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateTaskCommunication(task.id, true);
                                toast.success('Communication verified');
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                            >
                              Mark Contacted
                            </button>
                          )}

                          {gate.type === 'comm_proof' && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsValidationModalOpen(false);
                                onUploadPhoto?.(task.id, undefined, true);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            >
                              <Camera size={12} />
                              <span>Upload Proof</span>
                            </button>
                          )}

                          {gate.type === 'subtask_complete' && gate.subTaskId && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateSubTaskStatus(task.id, gate.subTaskId!, true, false);
                                toast.success('Subtask marked done');
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
                            >
                              Mark Done
                            </button>
                          )}

                          {gate.type === 'subtask_proof' && gate.subTaskId && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsValidationModalOpen(false);
                                onUploadPhoto?.(task.id, gate.subTaskId, false);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            >
                              <Camera size={12} />
                              <span>Take Photo</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsValidationModalOpen(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                disabled={!isAllValidationPassed || isSubmittingCompletion || completingTaskIds.has(task.id)}
                onClick={handleCompleteTask}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 ${
                  isAllValidationPassed && !isSubmittingCompletion && !completingTaskIds.has(task.id)
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-95 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmittingCompletion || completingTaskIds.has(task.id) ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Completing Task...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Confirm & Finalize Task Completion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Dossier Modal */}
      {!isNonStudent && student && (
        <StudentDossierModal
          student={student}
          isOpen={isDossierOpen}
          onClose={() => setIsDossierOpen(false)}
          onNavigateToFullProfile={onNavigateToStudent}
        />
      )}

      {/* Expandable Feedback Inspection Drawer */}
      {isFeedbackDrawerOpen && (task.feedbackSubmitted || task.feedback) && (
        <div 
          className="fixed inset-0 bg-slate-950/70 z-[70] flex justify-end backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsFeedbackDrawerOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 text-white flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                    CSAT Audit
                  </span>
                  <span className="text-xs text-slate-400">
                    {task.feedback?.submittedAt ? format(new Date(task.feedback.submittedAt), 'MMM d, yyyy h:mm a') : 'Recently Submitted'}
                  </span>
                </div>
                <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>Student Feedback</span>
                  <span className="text-amber-400 flex items-center">
                    <Star size={16} className="fill-amber-400 ml-1" />
                    <span className="ml-1 text-sm font-black">{task.feedback?.rating ?? 5}.0</span>
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 truncate max-w-xs">
                  {taskTitle} &bull; {displayName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsFeedbackDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                title="Close drawer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 p-5 space-y-5 overflow-y-auto bg-slate-50/50">
              {/* Rating Card */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Overall Experience
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={20}
                          className={star <= (task.feedback?.rating ?? 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
                        />
                      ))}
                    </div>
                    <span className="font-extrabold text-base text-slate-900 ml-1">
                      {task.feedback?.rating ?? 5} / 5
                    </span>
                  </div>
                </div>

                {task.feedback?.satisfaction && (
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Satisfaction
                    </span>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 capitalize">
                      {task.feedback.satisfaction.replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Student Metadata Card */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Student:</span>
                  <span className="font-bold text-slate-800">{displayName}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Email:</span>
                  <span className="font-bold text-slate-800 font-mono text-[11px]">
                    {task.feedback?.studentEmail || task.studentEmail || student?.email || 'N/A'}
                  </span>
                </div>
                {assignee && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Assigned Officer:</span>
                    <span className="font-bold text-slate-800">{assignee.name}</span>
                  </div>
                )}
                {task.completedAt && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Completed:</span>
                    <span className="font-medium text-slate-700">
                      {format(new Date(task.completedAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                )}
              </div>

              {/* Detailed Service Milestones & Subtask Ratings */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-red-100 text-red-700 rounded-lg">
                    <Sparkles size={14} />
                  </div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Service Milestones Breakdown
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {(() => {
                    // 1. Check if subtaskRatings object exists
                    const subRatings = task.feedback?.subtaskRatings;
                    if (subRatings && Object.keys(subRatings).length > 0) {
                      return Object.entries(subRatings).map(([qId, item]) => {
                        const questionText = language === 'ar' && item.questionAr ? item.questionAr : item.questionEn;
                        const score = item.score;
                        const isGood = score === 'Good' || score === 'Yes' || score === 5;
                        const isAcceptable = score === 'Acceptable' || score === 'Partially' || score === 3 || score === 4;
                        const isPoor = score === 'Poor' || score === 'No' || score === 1 || score === 2;

                        return (
                          <div key={qId} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1.5">
                            <p className="text-xs font-semibold text-slate-800 leading-snug">
                              {questionText}
                            </p>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-[10px] text-slate-400 font-medium uppercase">Milestone Rating:</span>
                              <span className={cn(
                                "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg border",
                                isGood && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                isAcceptable && "bg-amber-50 text-amber-700 border-amber-200",
                                isPoor && "bg-red-50 text-red-700 border-red-200",
                                !isGood && !isAcceptable && !isPoor && "bg-slate-100 text-slate-800 border-slate-200"
                              )}>
                                {typeof score === 'number' ? (
                                  <span className="flex items-center gap-1">
                                    {score} <Star size={11} className="fill-amber-400 text-amber-500 inline" />
                                  </span>
                                ) : isGood ? (
                                  <span className="flex items-center gap-1">
                                    <Check size={12} className="stroke-[3]" /> {score}
                                  </span>
                                ) : isPoor ? (
                                  <span className="flex items-center gap-1">
                                    <X size={12} className="stroke-[3]" /> {score}
                                  </span>
                                ) : (
                                  <span>{score}</span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    }

                    // 2. Check if structured answers exist on feedback
                    const structured = task.feedback?.answers || [];
                    if (structured.length > 0) {
                      return structured.map((ans, idx) => (
                        <div key={idx} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1.5">
                          <p className="text-xs font-semibold text-slate-800 leading-snug">
                            {language === 'ar' && ans.questionAr ? ans.questionAr : ans.question}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400 font-medium uppercase">Response:</span>
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-900 border border-slate-200">
                              {typeof ans.answer === 'boolean' ? (
                                ans.answer ? (
                                  <span className="text-emerald-700 flex items-center gap-1 font-bold">
                                    <Check size={12} className="stroke-[3]" /> Yes
                                  </span>
                                ) : (
                                  <span className="text-red-700 flex items-center gap-1 font-bold">
                                    <X size={12} className="stroke-[3]" /> No
                                  </span>
                                )
                              ) : typeof ans.answer === 'number' ? (
                                <span className="text-amber-700 font-extrabold flex items-center gap-1">
                                  {ans.answer} <Star size={11} className="fill-amber-400 text-amber-400 inline" />
                                </span>
                              ) : ans.answer === 'Yes' ? (
                                <span className="text-emerald-700 flex items-center gap-1 font-bold">
                                  <Check size={12} className="stroke-[3]" /> Yes
                                </span>
                              ) : ans.answer === 'No' ? (
                                <span className="text-red-700 flex items-center gap-1 font-bold">
                                  <X size={12} className="stroke-[3]" /> No
                                </span>
                              ) : (
                                String(ans.answer)
                              )}
                            </span>
                          </div>
                        </div>
                      ));
                    }

                    // 3. Fallback to dynamicAnswers map
                    const dynMap = task.feedback?.dynamicAnswers || {};
                    const fallbackQuestions = getServiceQuestions(preset, task);
                    return fallbackQuestions.map((q) => {
                      const val = dynMap[q.id];
                      return (
                        <div key={q.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1.5">
                          <p className="text-xs font-semibold text-slate-800 leading-snug">
                            {language === 'ar' ? q.questionAr : q.questionEn}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400 font-medium uppercase">Response:</span>
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-900 border border-slate-200">
                              {val === undefined ? (
                                <span className="text-slate-400">Not recorded</span>
                              ) : val === 'Yes' || val === true ? (
                                <span className="text-emerald-700 flex items-center gap-1 font-bold">
                                  <Check size={12} className="stroke-[3]" /> Yes
                                </span>
                              ) : val === 'No' || val === false ? (
                                <span className="text-red-700 flex items-center gap-1 font-bold">
                                  <X size={12} className="stroke-[3]" /> No
                                </span>
                              ) : typeof val === 'number' ? (
                                <span className="text-amber-700 font-extrabold flex items-center gap-1">
                                  {val} <Star size={11} className="fill-amber-400 text-amber-400 inline" />
                                </span>
                              ) : (
                                String(val)
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Written Comments */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block">
                  Student Comments & Remarks
                </span>
                {task.feedback?.comments ? (
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs relative">
                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      "{task.feedback.comments}"
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-white p-3 rounded-xl border border-slate-200">
                    No additional written remarks provided by student.
                  </p>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsFeedbackDrawerOpen(false)}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strictly Admin-Only Quality Control Modal */}
      {isAdminQC && isQCModalOpen && (
        <QCReviewModal
          isOpen={isQCModalOpen}
          onClose={() => setIsQCModalOpen(false)}
          task={task}
          existingReview={taskQCReview || null}
        />
      )}
    </>
  );
}

