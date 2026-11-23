import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Tag,
  Plus,
  Camera,
  Upload,
  Trash2,
  PhoneCall,
  Phone,
  Star,
  Clock,
  User as UserIcon,
  FileText,
  Eye,
  MessageSquare,
  Sparkles,
  Check,
  Loader2,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import { storage } from '../config/firebase';
import { useAppContext } from '../context/AppContext';
import {
  QCErrorTagId,
  QCEvidenceMedia,
  QCGrade,
  QCTaskReview,
  Task,
} from '../types';
import {
  getTaskDisplayTitle,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  normalizeTaskStatus,
} from '../utils/taskClassification';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import { QC_ERROR_TAGS, QC_GRADES, getEffectiveTaskDate } from '../utils/qualityControl';
import { formatWhatsAppUrl } from './CompactTaskCard';
import PhotoLightboxModal from './PhotoLightboxModal';
import { cn } from './layout/Layout';

export interface QCReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  existingReview?: QCTaskReview | null;
  onInspectTask?: (task: Task) => void;
}

function formatDurationCompact(start?: string, end?: string, isRTL = false): string {
  if (!start) return '--';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return '--';
  const mins = Math.round((e - s) / 60000);
  if (mins < 60) return isRTL ? `${mins} د` : `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return isRTL ? `${h} س ${m} د` : `${h}h ${m}m`;
}

export default function QCReviewModal({
  isOpen,
  onClose,
  task,
  existingReview,
  onInspectTask,
}: QCReviewModalProps) {
  const {
    currentUser,
    students,
    users,
    presets,
    qcReviews,
    saveQCReview,
    deleteQCReview,
    language,
    t,
  } = useAppContext();

  const isRTL = language === 'ar';

  const resolvedExisting =
    existingReview !== undefined
      ? existingReview
      : task
        ? qcReviews.find((r) => r.taskId === task.id || r.id === task.id) || null
        : null;

  const [grade, setGrade] = useState<QCGrade>('green');
  const [internalScore, setInternalScore] = useState<number | undefined>(undefined);
  const [errorTags, setErrorTags] = useState<QCErrorTagId[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [comment, setComment] = useState('');
  const [evidenceMedia, setEvidenceMedia] = useState<QCEvidenceMedia[]>([]);
  const [needsUrgentCall, setNeedsUrgentCall] = useState(false);
  const [urgentCallReason, setUrgentCallReason] = useState('');
  const [urgentCallResolved, setUrgentCallResolved] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<{ url: string; caption?: string; timestamp?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !task) return;
    setConfirmDelete(false);
    if (resolvedExisting) {
      setGrade(resolvedExisting.grade);
      setInternalScore(resolvedExisting.internalScore);
      setErrorTags(resolvedExisting.errorTags || []);
      setCustomTags(resolvedExisting.customTags || []);
      setComment(resolvedExisting.comment || '');
      setEvidenceMedia(resolvedExisting.evidenceMedia || []);
      setNeedsUrgentCall(Boolean(resolvedExisting.needsUrgentCall));
      setUrgentCallReason(resolvedExisting.urgentCallReason || '');
      setUrgentCallResolved(Boolean(resolvedExisting.urgentCallResolved));
    } else {
      setGrade('green');
      setInternalScore(undefined);
      setErrorTags([]);
      setCustomTags([]);
      setComment('');
      setEvidenceMedia([]);
      setNeedsUrgentCall(false);
      setUrgentCallReason('');
      setUrgentCallResolved(false);
    }
    setCustomTagInput('');
  }, [isOpen, task?.id, resolvedExisting?.id, resolvedExisting?.updatedAt]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lightboxItem) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightboxItem, onClose]);

  const uploadImageFiles = async (files: File[]) => {
    if (!task || !currentUser || files.length === 0) return;
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error(isRTL ? 'يرجى اختيار ملفات صور فقط.' : 'Please select image files only.');
      return;
    }

    setIsUploading(true);
    try {
      const uploaded: QCEvidenceMedia[] = [];
      for (const file of imageFiles) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(
            isRTL
              ? `الصورة "${file.name}" تتجاوز الحد الأقصى 15 ميجابايت`
              : `Image "${file.name}" exceeds 15 MB limit.`
          );
          continue;
        }
        const safeName = (file.name || 'screenshot.png').replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `qc_evidence/${task.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        uploaded.push({
          id: `qcev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url,
          name: file.name || 'Chat Screenshot',
          caption: '',
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser.id,
        });
      }

      if (uploaded.length > 0) {
        setEvidenceMedia((prev) => [...prev, ...uploaded]);
        toast.success(
          isRTL
            ? `تم رفع ${uploaded.length} صورة إثبات بنجاح`
            : `Uploaded ${uploaded.length} evidence screenshot${uploaded.length > 1 ? 's' : ''}`
        );
      }
    } catch (err: any) {
      console.error('QC evidence upload error:', err);
      toast.error(err?.message || (isRTL ? 'فشل رفع الصورة' : 'Failed to upload screenshot'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Support pasting screenshots directly into the modal (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (blob) pastedFiles.push(blob);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      await uploadImageFiles(pastedFiles);
    }
  };

  // Strict Admin-only guard
  if (!isOpen || !task || currentUser?.role !== 'admin') return null;

  const isNonStudent = Boolean(task.isNonStudentTask);
  const student = !isNonStudent && task.studentId ? students.find((s) => s.id === task.studentId) : undefined;
  const officer = users.find((u) => u.id === task.assigneeId);
  const taskTitle = getTaskDisplayTitle(task, presets, language);
  const serviceLabel = getTaskServiceLabel(task, presets, language);
  const effectiveStatus = normalizeTaskStatus(task);
  const contactPhone = isNonStudent ? task.nonStudentContact : student?.contactInfo;
  const whatsappUrl = formatWhatsAppUrl(contactPhone);

  const toggleErrorTag = (tagId: QCErrorTagId) => {
    setErrorTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleAddCustomTag = () => {
    const clean = customTagInput.trim();
    if (!clean) return;
    if (!customTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setCustomTags((prev) => [...prev, clean]);
    }
    setCustomTagInput('');
  };

  const handleRemoveCustomTag = (tag: string) => {
    setCustomTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleUpdateEvidenceCaption = (id: string, caption: string) => {
    setEvidenceMedia((prev) => prev.map((m) => (m.id === id ? { ...m, caption } : m)));
  };

  const handleRemoveEvidence = (id: string) => {
    setEvidenceMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grade !== 'green' && !comment.trim() && errorTags.length === 0 && customTags.length === 0) {
      toast.error(
        isRTL
          ? 'يرجى كتابة ملاحظة أو اختيار تاج خطأ على الأقل عند التقييم الأصفر أو الأحمر.'
          : 'Please add a QC comment or select at least one error tag for Yellow/Red grades.'
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveQCReview({
        taskId: task.id,
        officerId: task.assigneeId,
        studentId: task.studentId,
        taskDate: getEffectiveTaskDate(task),
        grade,
        internalScore,
        errorTags,
        customTags,
        comment,
        evidenceMedia,
        needsUrgentCall,
        urgentCallReason,
        urgentCallResolved,
      });
      toast.success(isRTL ? 'تم حفظ تقرير الكواليتي كنترول بنجاح' : 'Quality Control report saved');
      onClose();
    } catch (err: any) {
      console.error('Failed to save QC review:', err);
      toast.error(err?.message || (isRTL ? 'فشل حفظ التقرير' : 'Failed to save QC report'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resolvedExisting) return;
    setIsDeleting(true);
    try {
      await deleteQCReview(task.id);
      toast.success(isRTL ? 'تم حذف تقرير الجودة' : 'QC report deleted');
      onClose();
    } catch (err: any) {
      console.error('Failed to delete QC review:', err);
      toast.error(err?.message || 'Failed to delete QC report');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={onClose}
        onPaste={handlePaste}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div
          className="relative bg-white dark:bg-slate-900 w-full max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94dvh] sm:max-h-[92vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-200 border border-red-400/30">
                  <ShieldCheck size={12} />
                  <span>{t('qcReport')}</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/15">
                  {t('qcAdminOnlyNotice')}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight truncate">{taskTitle}</h2>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                {serviceLabel} • {student?.fullName || task.nonStudentTitle || (isRTL ? 'مهمة عامة' : 'General Task')}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/70 dark:bg-slate-950/60">
            {/* Task & Officer Context Summary */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className={cn('px-2.5 py-0.5 rounded-full font-bold border uppercase text-[10px]', getTaskStatusBadgeClasses(effectiveStatus))}>
                    {t(effectiveStatus) || effectiveStatus}
                  </span>
                  {task.taskDate && (
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                      <Calendar size={13} className="text-purple-500" />
                      {formatDateDDMMYYYY(task.taskDate)} {task.taskTime ? `• ${task.taskTime}` : ''}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                    <UserIcon size={13} className="text-blue-500" />
                    {officer?.name || (isRTL ? 'غير معين' : 'Unassigned')}
                  </span>
                  {task.startedAt && (
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                      <Clock size={13} className="text-emerald-500" />
                      {format(new Date(task.startedAt), 'HH:mm')}
                      {task.completedAt ? ` → ${format(new Date(task.completedAt), 'HH:mm')}` : ''}
                      {' '}({formatDurationCompact(task.startedAt, task.completedAt, isRTL)})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold transition-colors"
                    >
                      <Phone size={12} />
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {onInspectTask && (
                    <button
                      type="button"
                      onClick={() => onInspectTask(task)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Eye size={12} />
                      <span>{isRTL ? 'تفاصيل وصور المهمة' : 'Inspect Proofs'}</span>
                    </button>
                  )}
                </div>
              </div>

              {(task.notes || task.feedback) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {task.notes && (() => {
                    const qcReportTs = task.notesUpdatedAt || (task.status === 'completed' ? task.completedAt : undefined);
                    const formattedQcReportTime = (() => {
                      if (!qcReportTs) return null;
                      try {
                        const d = new Date(qcReportTs);
                        return Number.isNaN(d.getTime()) ? null : format(d, 'MMM dd, yyyy • HH:mm');
                      } catch {
                        return null;
                      }
                    })();

                    return (
                      <div className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/70 space-y-1.5">
                        <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <FileText size={11} />
                            {t('fieldOfficerReport') || 'Field Officer Report'}
                          </span>
                          {formattedQcReportTime && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <Clock size={10} />
                              <span>{formattedQcReportTime}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-3 leading-relaxed">
                          {task.notes}
                        </p>
                      </div>
                    );
                  })()}
                  {task.feedback && (
                    <div className="bg-amber-50/70 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/70 dark:border-amber-800/50">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1 mb-1">
                        <Star size={11} className="fill-amber-500 text-amber-500" />
                        {isRTL ? `تقييم الطالب: ${task.feedback.rating}/5` : `Student CSAT: ${task.feedback.rating}/5`}
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-3 italic">
                        {task.feedback.comments ? `"${task.feedback.comments}"` : task.feedback.satisfaction?.replace('_', ' ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 1. 3-Grade Severity Selector */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('qcGrade')} *
                </label>

                {/* Optional 1-5 Internal Score */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {t('qcInternalRating')}:
                  </span>
                  <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setInternalScore(internalScore === star ? undefined : star)}
                        className="p-0.5 transition-transform hover:scale-110 cursor-pointer"
                        title={`${star}/5`}
                      >
                        <Star
                          size={15}
                          className={
                            internalScore && star <= internalScore
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 dark:text-slate-600'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(['green', 'yellow', 'red'] as QCGrade[]).map((g) => {
                  const meta = QC_GRADES[g];
                  const isSelected = grade === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      className={cn(
                        'p-3.5 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-2.5',
                        isSelected
                          ? meta.cardActiveClasses
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {g === 'green' ? (
                          <CheckCircle2 size={18} className={isSelected ? 'text-emerald-600' : 'text-slate-400'} />
                        ) : g === 'yellow' ? (
                          <AlertTriangle size={18} className={isSelected ? 'text-amber-600' : 'text-slate-400'} />
                        ) : (
                          <AlertOctagon size={18} className={isSelected ? 'text-red-600' : 'text-slate-400'} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black leading-tight">
                          {isRTL ? meta.labelAr : meta.labelEn}
                        </div>
                        <div className="text-[10.5px] opacity-80 mt-0.5 leading-snug">
                          {isRTL ? meta.descAr : meta.descEn}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Error Classification Tags */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Tag size={14} className="text-red-600" />
                  <span>{t('qcErrorTags')}</span>
                </label>
                {errorTags.length + customTags.length > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                    {errorTags.length + customTags.length} {isRTL ? 'محدد' : 'selected'}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {QC_ERROR_TAGS.map((tag) => {
                  const active = errorTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleErrorTag(tag.id)}
                      title={isRTL ? tag.descAr : tag.descEn}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                        active
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-300'
                      )}
                    >
                      {active && <Check size={12} />}
                      <span>{isRTL ? tag.labelAr : tag.labelEn}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Tags */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                    placeholder={t('qcAddCustomTag')}
                    className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>{t('add')}</span>
                  </button>
                </div>

                {customTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customTags.map((ct) => (
                      <span
                        key={ct}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 text-xs font-bold"
                      >
                        <span>#{ct}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomTag(ct)}
                          className="text-purple-500 hover:text-red-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. QC Report / Comment */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <MessageSquare size={14} className="text-blue-600" />
                <span>{t('qcCommentLabel')}</span>
              </label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('qcCommentPlaceholder')}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-y"
              />
            </div>

            {/* 4. Chat Screenshots & Evidence Upload */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Camera size={14} className="text-purple-600" />
                    <span>{t('qcEvidenceScreenshots')}</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('qcEvidenceHint')} {isRTL ? '(يمكنك أيضاً لصق الصورة مباشرة بـ Ctrl+V)' : '(You can also paste screenshots with Ctrl+V)'}
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from<File>(e.target.files) : [];
                    uploadImageFiles(list);
                  }}
                />
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{isUploading ? (t('uploading') || 'Uploading...') : t('qcUploadEvidence')}</span>
                </button>
              </div>

              {evidenceMedia.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {evidenceMedia.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxItem({
                            url: item.url,
                            caption: item.caption || item.name || 'QC Evidence Screenshot',
                            timestamp: item.uploadedAt,
                          })
                        }
                        className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 relative group cursor-pointer bg-slate-200"
                        title="Click to expand"
                      >
                        <img src={item.url} alt={item.caption || 'QC Evidence'} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Eye size={14} />
                        </div>
                      </button>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <input
                          type="text"
                          value={item.caption || ''}
                          onChange={(e) => handleUpdateEvidenceCaption(item.id, e.target.value)}
                          placeholder={isRTL ? 'وصف الصورة (مثال: سكرين شوت تأخير الرد)...' : 'Caption (e.g., Late WhatsApp reply)...'}
                          className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                        />
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="truncate">{item.name || 'Screenshot'}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEvidence(item.id)}
                            className="text-red-500 hover:text-red-700 font-bold inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Trash2 size={11} />
                            <span>{t('delete')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Urgent Follow-up Call Flag */}
            <div
              className={cn(
                'rounded-2xl border p-4 shadow-2xs transition-colors space-y-3',
                needsUrgentCall
                  ? urgentCallResolved
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              )}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={needsUrgentCall}
                    onChange={(e) => setNeedsUrgentCall(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-600 cursor-pointer"
                  />
                  <div className="flex items-center gap-2">
                    <PhoneCall
                      size={16}
                      className={needsUrgentCall ? (urgentCallResolved ? 'text-emerald-600' : 'text-rose-600 animate-pulse') : 'text-slate-400'}
                    />
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      {t('qcUrgentCallFlag')}
                    </span>
                  </div>
                </label>

                {needsUrgentCall && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={urgentCallResolved}
                      onChange={(e) => setUrgentCallResolved(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                    <span className={urgentCallResolved ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}>
                      {t('qcUrgentCallResolved')}
                    </span>
                  </label>
                )}
              </div>

              {needsUrgentCall && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={urgentCallReason}
                    onChange={(e) => setUrgentCallReason(e.target.value)}
                    placeholder={t('qcUrgentCallReason')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/70 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  {contactPhone && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                      <span>{isRTL ? 'رقم التواصل:' : 'Contact:'}</span>
                      <a
                        href={`tel:${contactPhone}`}
                        className="font-mono font-bold text-blue-700 dark:text-blue-400 underline"
                      >
                        {contactPhone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Footer Action Bar */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <div>
              {resolvedExisting && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting ? '...' : (isRTL ? 'تأكيد الحذف' : 'Confirm Delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>{t('qcDeleteReview')}</span>
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving || isUploading}
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-red-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={15} />}
                <span>{isSaving ? t('saving') : t('qcSaveReview')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <PhotoLightboxModal
        isOpen={!!lightboxItem}
        onClose={() => setLightboxItem(null)}
        imageUrl={lightboxItem?.url || null}
        title={lightboxItem?.caption}
        timestamp={lightboxItem?.timestamp}
      />
    </>
  );
}
