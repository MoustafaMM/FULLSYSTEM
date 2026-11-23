import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Pin,
  Clock,
  Users,
  UserCheck,
  Search,
  Check,
  Paperclip,
  Link as LinkIcon,
  Upload,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  Sparkles,
  Megaphone,
  CheckSquare,
  Loader2,
  Calendar as CalendarIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { useAppContext } from '../context/AppContext';
import {
  CounselorTask,
  CounselorTaskAttachment,
  CounselorTaskCategory,
  CounselorTaskMode,
  CounselorTaskPriority,
  CounselorTaskSubTask,
} from '../types';
import { combineDeadlineIso, splitDeadlineIso } from '../utils/counselorTaskTiming';
import DatePicker from './DatePicker';
import { cn } from './layout/Layout';

interface CreateCounselorTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask?: CounselorTask | null;
}

const CATEGORY_OPTIONS: { value: CounselorTaskCategory; labelKey: string }[] = [
  { value: 'follow_up', labelKey: 'catFollowUp' },
  { value: 'sales_leads', labelKey: 'catSalesLeads' },
  { value: 'meeting', labelKey: 'catMeeting' },
  { value: 'admin', labelKey: 'catAdmin' },
  { value: 'training', labelKey: 'catTraining' },
  { value: 'notice', labelKey: 'catNotice' },
  { value: 'other', labelKey: 'catOther' },
];

export function normalizeSafeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function formatBytesCompact(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreateCounselorTaskModal({
  isOpen,
  onClose,
  editingTask,
}: CreateCounselorTaskModalProps) {
  const { users, currentUser, createCounselorTask, updateCounselorTask, language, t } = useAppContext();
  const isRTL = language === 'ar';

  const counselors = useMemo(
    () =>
      users
        .filter((u) => u.role === 'counselor')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [users]
  );

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<CounselorTaskMode>('action');
  const [category, setCategory] = useState<CounselorTaskCategory>('follow_up');
  const [priority, setPriority] = useState<CounselorTaskPriority>('normal');
  const [isPinned, setIsPinned] = useState(false);

  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<string[]>([]);
  const [counselorSearch, setCounselorSearch] = useState('');

  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('17:00');

  const [subTasks, setSubTasks] = useState<CounselorTaskSubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');

  const [attachments, setAttachments] = useState<CounselorTaskAttachment[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkTitleInput, setLinkTitleInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftPrefixRef = useRef<string>(`draft_${Date.now()}`);

  useEffect(() => {
    if (!isOpen) return;
    draftPrefixRef.current = editingTask?.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setFormError(null);
    setCounselorSearch('');
    setNewSubTaskTitle('');
    setLinkUrlInput('');
    setLinkTitleInput('');
    setShowLinkInput(false);

    if (editingTask) {
      setTitle(editingTask.title || '');
      setTitleAr(editingTask.titleAr || '');
      setDescription(editingTask.description || '');
      setMode(editingTask.mode || 'action');
      setCategory(editingTask.category || 'follow_up');
      setPriority(editingTask.priority || 'normal');
      setIsPinned(Boolean(editingTask.isPinned));
      setTargetMode(editingTask.targetMode || 'specific');
      setSelectedCounselorIds(editingTask.assignedCounselorIds || []);
      if (editingTask.deadlineAt) {
        setHasDeadline(true);
        const { date, time } = splitDeadlineIso(editingTask.deadlineAt);
        setDeadlineDate(date);
        setDeadlineTime(time);
      } else {
        setHasDeadline(false);
        setDeadlineDate('');
        setDeadlineTime('17:00');
      }
      setSubTasks(editingTask.subTasks ? [...editingTask.subTasks] : []);
      setAttachments(editingTask.attachments ? [...editingTask.attachments] : []);
    } else {
      setTitle('');
      setTitleAr('');
      setDescription('');
      setMode('action');
      setCategory('follow_up');
      setPriority('normal');
      setIsPinned(false);
      setTargetMode('all');
      setSelectedCounselorIds([]);
      setHasDeadline(false);
      setDeadlineDate('');
      setDeadlineTime('17:00');
      setSubTasks([]);
      setAttachments([]);
    }
  }, [isOpen, editingTask]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isUploadingFile) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, isUploadingFile, onClose]);

  const filteredCounselors = useMemo(() => {
    const q = counselorSearch.trim().toLowerCase();
    if (!q) return counselors;
    return counselors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.username || '').toLowerCase().includes(q)
    );
  }, [counselors, counselorSearch]);

  if (!isOpen) return null;

  const toggleCounselorId = (id: string) => {
    setSelectedCounselorIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleQuickDeadline = (daysOffset: number, time = '17:00') => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const pad = (n: number) => String(n).padStart(2, '0');
    setHasDeadline(true);
    setDeadlineDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setDeadlineTime(time);
  };

  const handleAddSubTask = () => {
    const clean = newSubTaskTitle.trim();
    if (!clean) return;
    setSubTasks((prev) => [
      ...prev,
      {
        id: `cst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: clean,
      },
    ]);
    setNewSubTaskTitle('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentUser) return;

    setIsUploadingFile(true);
    try {
      const uploaded: CounselorTaskAttachment[] = [];
      for (const file of Array.from<File>(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(
            isRTL
              ? `الملف "${file.name}" يتجاوز الحد الأقصى (15 ميجابايت)`
              : `File "${file.name}" exceeds 15 MB limit.`
          );
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `counselor_tasks/${draftPrefixRef.current}/${Date.now()}_${safeName}`;
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        uploaded.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          url,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          uploadedBy: currentUser.id,
          uploadedByName: currentUser.name,
          uploadedAt: new Date().toISOString(),
        });
      }

      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded]);
        toast.success(
          isRTL
            ? `تم رفع ${uploaded.length} مرفق بنجاح`
            : `Uploaded ${uploaded.length} attachment${uploaded.length > 1 ? 's' : ''}`
        );
      }
    } catch (err: any) {
      console.error('Counselor task upload error:', err);
      toast.error(err?.message || (isRTL ? 'فشل رفع الملف' : 'Failed to upload file'));
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLink = () => {
    if (!currentUser) return;
    const normalized = normalizeSafeUrl(linkUrlInput);
    if (!normalized) {
      toast.error(
        isRTL
          ? 'يرجى إدخال رابط إلكتروني صحيح (يبدأ بـ https://)'
          : 'Please enter a valid URL (e.g. https://example.com)'
      );
      return;
    }

    const displayName =
      linkTitleInput.trim() ||
      (() => {
        try {
          return new URL(normalized).hostname.replace(/^www\./, '');
        } catch {
          return normalized;
        }
      })();

    setAttachments((prev) => [
      ...prev,
      {
        id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: displayName,
        url: normalized,
        type: 'link',
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.name,
        uploadedAt: new Date().toISOString(),
      },
    ]);
    setLinkUrlInput('');
    setLinkTitleInput('');
    setShowLinkInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError(isRTL ? 'يرجى إدخال عنوان المهمة.' : 'Please enter a task title.');
      return;
    }

    const effectiveCounselorIds =
      targetMode === 'all'
        ? counselors.map((c) => c.id)
        : selectedCounselorIds.filter((id) => counselors.some((c) => c.id === id));

    if (effectiveCounselorIds.length === 0) {
      setFormError(
        targetMode === 'all'
          ? isRTL
            ? 'لا يوجد مستشارون مسجلون في النظام حالياً.'
            : 'No counselor accounts exist in the system yet.'
          : isRTL
          ? 'يرجى اختيار مستشار واحد على الأقل.'
          : 'Please select at least one counselor.'
      );
      return;
    }

    let deadlineIso: string | undefined = undefined;
    if (hasDeadline) {
      if (!deadlineDate) {
        setFormError(
          isRTL
            ? 'يرجى تحديد تاريخ الموعد النهائي أو إلغاء خيار الموعد النهائي.'
            : 'Please pick a deadline date or turn off the deadline option.'
        );
        return;
      }
      deadlineIso = combineDeadlineIso(deadlineDate, deadlineTime || '17:00');
      if (!deadlineIso) {
        setFormError(isRTL ? 'تاريخ أو وقت الموعد النهائي غير صالح.' : 'Invalid deadline date or time.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const cleanedSubTasks = mode === 'action' ? subTasks.filter((s) => s.title.trim()) : [];

      if (editingTask) {
        await updateCounselorTask(
          editingTask.id,
          {
            title: title.trim(),
            titleAr: titleAr.trim() || undefined,
            description: description.trim() || undefined,
            category,
            priority,
            mode,
            isPinned,
            targetMode,
            assignedCounselorIds: effectiveCounselorIds,
            deadlineAt: deadlineIso,
            subTasks: cleanedSubTasks,
            attachments,
          },
          !hasDeadline
        );
        toast.success(isRTL ? 'تم تحديث مهمة المستشارين بنجاح' : 'Counselor task updated');
      } else {
        await createCounselorTask({
          title: title.trim(),
          titleAr: titleAr.trim() || undefined,
          description: description.trim() || undefined,
          category,
          priority,
          mode,
          isPinned,
          targetMode,
          assignedCounselorIds: effectiveCounselorIds,
          deadlineAt: deadlineIso,
          subTasks: cleanedSubTasks,
          attachments,
        });
        toast.success(
          isRTL
            ? `تم نشر المهمة وإشعار ${effectiveCounselorIds.length} مستشار`
            : `Task published & ${effectiveCounselorIds.length} counselor${effectiveCounselorIds.length > 1 ? 's' : ''} notified!`
        );
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to save counselor task:', err);
      setFormError(err?.message || (isRTL ? 'حدث خطأ أثناء حفظ المهمة' : 'Failed to save task.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting && !isUploadingFile) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] my-auto"
        dir={isRTL ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
              {mode === 'notice' ? <Megaphone size={20} /> : <CheckSquare size={20} />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                {editingTask ? t('editCounselorTask') : t('newCounselorTask')}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isRTL
                  ? 'مهام وتوجيهات داخلية للمستشارين (منفصلة تماماً عن اللوجستيات)'
                  : 'Internal counselor assignments & announcements (separate from logistics)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting || isUploadingFile}
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Mode Switcher: Actionable Task vs Announcement Notice */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {isRTL ? 'نوع التكليف' : 'Task Mode'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setMode('action')}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-2xl border text-start transition-all cursor-pointer',
                    mode === 'action'
                      ? 'bg-red-50/70 dark:bg-red-950/30 border-red-500 ring-2 ring-red-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                      mode === 'action'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <CheckSquare size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('actionTaskMode')}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {isRTL
                        ? 'يتطلب تأكيد المشاهدة (إعجاب) + تنفيذ وإتمام المهمة'
                        : 'Counselors click Like (Seen) and complete / submit done'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('notice')}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-2xl border text-start transition-all cursor-pointer',
                    mode === 'notice'
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                      mode === 'notice'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    <Megaphone size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('noticeMode')}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {isRTL
                        ? 'تعميم للقراءة وتأكيد المشاهدة بزر الإعجاب فقط'
                        : 'Broadcast / FYI — requires Like (Seen) acknowledgment only'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Title (EN + Optional AR) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRTL ? 'عنوان المهمة (بالإنجليزية / الأساسي)' : 'Task Title'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isRTL ? 'مثال: تحديث ملفات المتقدمين لهذا الأسبوع' : 'e.g., Follow up with pending applicants'}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRTL ? 'العنوان بالعربية (اختياري)' : 'Arabic Title (Optional)'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="عنوان المهمة بالعربية..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-right"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRTL ? 'التفاصيل والتعليمات (اختياري)' : 'Description & Instructions (Optional)'}
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isRTL
                    ? 'اكتب تفاصيل المهمة أو التوجيهات المطلوبة من المستشارين...'
                    : 'Provide context, goals, or specific expectations for the counselors...'
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-y"
              />
            </div>

            {/* Category, Priority, Pin */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRTL ? 'التصنيف' : 'Category'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CounselorTaskCategory)}
                  className="w-full px-3 py-2.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey as any)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRTL ? 'الأولوية' : 'Priority'}
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { val: 'normal', label: t('priorityNormal'), active: 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs' },
                      { val: 'high', label: t('priorityHigh'), active: 'bg-amber-500 text-white shadow-2xs' },
                      { val: 'urgent', label: t('priorityUrgent'), active: 'bg-red-600 text-white shadow-2xs' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setPriority(p.val)}
                      className={cn(
                        'py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate',
                        priority === p.val
                          ? p.active
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer',
                    isPinned
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  )}
                >
                  <Pin size={14} className={isPinned ? 'fill-white' : ''} />
                  <span>{isPinned ? t('pinned') : t('pinTask')}</span>
                </button>
              </div>
            </div>

            {/* Target Counselors Selector */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Users size={14} className="text-red-600" />
                    <span>{t('targetAudience')}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isRTL
                      ? 'اختر جميع المستشارين أو حدد مستشارين بعينهم لهذه المهمة'
                      : 'Broadcast to all counselors or pick specific individuals'}
                  </p>
                </div>

                <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTargetMode('all')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                      targetMode === 'all'
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    )}
                  >
                    <Users size={13} />
                    <span>
                      {t('allCounselors')} ({counselors.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('specific')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                      targetMode === 'specific'
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    )}
                  >
                    <UserCheck size={13} />
                    <span>
                      {t('specificCounselors')}
                      {targetMode === 'specific' && selectedCounselorIds.length > 0
                        ? ` (${selectedCounselorIds.length})`
                        : ''}
                    </span>
                  </button>
                </div>
              </div>

              {targetMode === 'all' ? (
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                      {counselors.length}
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-100 block">
                        {isRTL
                          ? `سيتم إسناد المهمة وإشعار جميع المستشارين (${counselors.length})`
                          : `Will assign and notify all ${counselors.length} counselors`}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {counselors.map((c) => c.name).slice(0, 5).join(', ')}
                        {counselors.length > 5 ? ` +${counselors.length - 5}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Search & Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search
                        size={14}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 text-slate-400',
                          isRTL ? 'right-3' : 'left-3'
                        )}
                      />
                      <input
                        type="text"
                        value={counselorSearch}
                        onChange={(e) => setCounselorSearch(e.target.value)}
                        placeholder={isRTL ? 'ابحث باسم المستشار...' : 'Search counselor name...'}
                        className={cn(
                          'w-full py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-red-500',
                          isRTL ? 'pr-8 pl-3' : 'pl-8 pr-3'
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCounselorIds(counselors.map((c) => c.id))}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {isRTL ? 'تحديد الكل' : 'Select All'}
                    </button>
                    {selectedCounselorIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCounselorIds([])}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-red-50 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-red-600 cursor-pointer"
                      >
                        {isRTL ? 'مسح الاختيار' : 'Clear'}
                      </button>
                    )}
                  </div>

                  {/* Checklist Grid */}
                  {counselors.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                      {isRTL ? 'لا يوجد مستشارون مضافون في النظام.' : 'No counselor accounts found in Staff Management.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1">
                      {filteredCounselors.map((c) => {
                        const checked = selectedCounselorIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCounselorId(c.id)}
                            className={cn(
                              'flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-all cursor-pointer text-start',
                              checked
                                ? 'bg-red-50 dark:bg-red-950/50 border-red-400 dark:border-red-700 text-red-900 dark:text-red-200 font-bold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  'w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0',
                                  checked
                                    ? 'bg-red-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                )}
                              >
                                {c.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate">{c.name}</div>
                                {c.username && (
                                  <div className="text-[10px] text-slate-400 font-mono truncate">
                                    @{c.username}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              className={cn(
                                'w-4 h-4 rounded-md border flex items-center justify-center shrink-0',
                                checked
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              )}
                            >
                              {checked && <Check size={11} strokeWidth={3} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional Deadline Section */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-red-600" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    {t('deadlineOptional')}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setHasDeadline(false)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer',
                      !hasDeadline
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                    )}
                  >
                    {t('noDeadline')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasDeadline(true);
                      if (!deadlineDate) {
                        handleQuickDeadline(0, '17:00');
                      }
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1',
                      hasDeadline
                        ? 'bg-red-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                    )}
                  >
                    <CalendarIcon size={11} />
                    <span>{t('hasDeadline')}</span>
                  </button>
                </div>
              </div>

              {hasDeadline && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickDeadline(0, '17:00')}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-red-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {isRTL ? 'اليوم 5:00 م' : 'Today 5:00 PM'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDeadline(1, '17:00')}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-red-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {isRTL ? 'غداً 5:00 م' : 'Tomorrow 5:00 PM'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDeadline(3, '17:00')}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-red-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {isRTL ? 'بعد 3 أيام' : 'In 3 Days'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {isRTL ? 'تاريخ الموعد النهائي' : 'Deadline Date'}
                      </label>
                      <DatePicker
                        value={deadlineDate}
                        onChange={setDeadlineDate}
                        placeholder={isRTL ? 'اختر التاريخ' : 'Select date'}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        {isRTL ? 'الوقت (افتراضي 5:00 م)' : 'Deadline Time (Default 17:00)'}
                      </label>
                      <input
                        type="time"
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Checklist Builder (Actionable Tasks Only) */}
            {mode === 'action' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-red-600" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      {isRTL ? 'قائمة خطوات فرعية (اختياري)' : 'Checklist Steps (Optional)'}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {subTasks.length} {isRTL ? 'خطوات' : 'steps'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubTaskTitle}
                    onChange={(e) => setNewSubTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubTask();
                      }
                    }}
                    placeholder={isRTL ? 'أضف خطوة جديدة للمهمة...' : 'Add a checklist item and press Enter...'}
                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubTask}
                    disabled={!newSubTaskTitle.trim()}
                    className="px-3 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus size={14} />
                    <span>{t('add')}</span>
                  </button>
                </div>

                {subTasks.length > 0 && (
                  <div className="space-y-1.5">
                    {subTasks.map((st, idx) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={st.title}
                            onChange={(e) => {
                              const next = [...subTasks];
                              next[idx] = { ...st, title: e.target.value };
                              setSubTasks(next);
                            }}
                            className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none font-medium"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubTasks((prev) => prev.filter((item) => item.id !== st.id))}
                          className="p-1 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                          title={t('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Attachments & Reference Links */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-red-600" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    {t('attachments')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    disabled={isUploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingFile ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    <span>{t('addAttachmentFile')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkInput(!showLinkInput)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <LinkIcon size={13} />
                    <span>{t('addAttachmentLink')}</span>
                  </button>
                </div>
              </div>

              {showLinkInput && (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    value={linkTitleInput}
                    onChange={(e) => setLinkTitleInput(e.target.value)}
                    placeholder={isRTL ? 'اسم الرابط (اختياري)' : 'Link label (optional)'}
                    className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-red-500"
                  />
                  <input
                    type="url"
                    value={linkUrlInput}
                    onChange={(e) => setLinkUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {t('add')}
                  </button>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs max-w-full"
                    >
                      {att.type === 'image' ? (
                        <ImageIcon size={13} className="text-blue-600 shrink-0" />
                      ) : att.type === 'link' ? (
                        <LinkIcon size={13} className="text-purple-600 shrink-0" />
                      ) : (
                        <FileText size={13} className="text-red-600 shrink-0" />
                      )}
                      <span className="truncate max-w-[180px] font-semibold text-slate-700 dark:text-slate-200">
                        {att.name}
                      </span>
                      {att.sizeBytes ? (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatBytesCompact(att.sizeBytes)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                        className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/95 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isSubmitting || isUploadingFile}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploadingFile}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md shadow-red-600/25 transition-all cursor-pointer"
            >
              {isSubmitting && <Loader2 size={15} className="animate-spin" />}
              <span>
                {editingTask
                  ? t('save')
                  : isRTL
                  ? 'نشر المهمة وإرسال الإشعار'
                  : 'Publish & Notify'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
