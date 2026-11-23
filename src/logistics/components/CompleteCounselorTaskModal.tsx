import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  Upload,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { useAppContext } from '../context/AppContext';
import { CounselorTask, CounselorTaskAttachment } from '../types';
import { getCounselorTaskCountdown } from '../utils/counselorTaskTiming';
import { formatBytesCompact, normalizeSafeUrl } from './CreateCounselorTaskModal';
import { cn } from './layout/Layout';

interface CompleteCounselorTaskModalProps {
  isOpen: boolean;
  task: CounselorTask | null;
  onClose: () => void;
  onConfirm: (note: string, attachments: CounselorTaskAttachment[]) => Promise<void>;
}

export default function CompleteCounselorTaskModal({
  isOpen,
  task,
  onClose,
  onConfirm,
}: CompleteCounselorTaskModalProps) {
  const { currentUser, language, t } = useAppContext();
  const isRTL = language === 'ar';

  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<CounselorTaskAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const existingProg = currentUser ? task?.progressByCounselor?.[currentUser.id] : undefined;
    setNote(existingProg?.completionNote || '');
    setAttachments(existingProg?.completionAttachments ? [...existingProg.completionAttachments] : []);
    setShowLinkInput(false);
    setLinkTitle('');
    setLinkUrl('');
  }, [isOpen, task?.id, currentUser?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isUploading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, isUploading, onClose]);

  if (!isOpen || !task || !currentUser) return null;

  const countdown = getCounselorTaskCountdown({
    deadlineAt: task.deadlineAt,
    language,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploaded: CounselorTaskAttachment[] = [];
      for (const file of Array.from<File>(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(
            isRTL
              ? `الملف "${file.name}" يتجاوز 15 ميجابايت`
              : `File "${file.name}" exceeds 15 MB limit.`
          );
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `counselor_tasks/${task.id}/completions/${currentUser.id}/${Date.now()}_${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        uploaded.push({
          id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
        toast.success(isRTL ? 'تم إرفاق الملف بنجاح' : 'Attachment uploaded');
      }
    } catch (err: any) {
      console.error('Completion upload error:', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLink = () => {
    const normalized = normalizeSafeUrl(linkUrl);
    if (!normalized) {
      toast.error(isRTL ? 'الرابط غير صالح' : 'Please enter a valid https:// URL');
      return;
    }
    const displayName =
      linkTitle.trim() ||
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
        id: `complink-${Date.now()}`,
        name: displayName,
        url: normalized,
        type: 'link',
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.name,
        uploadedAt: new Date().toISOString(),
      },
    ]);
    setLinkTitle('');
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(note.trim(), attachments);
      onClose();
    } catch (err: any) {
      console.error('Complete counselor task failed:', err);
      toast.error(err?.message || 'Failed to complete task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayTitle = isRTL && task.titleAr ? task.titleAr : task.title;

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting && !isUploading) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        dir={isRTL ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold">{t('markDone')}</h3>
              <p className="text-xs text-emerald-100 truncate">{displayTitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting || isUploading}
            onClick={onClose}
            className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {countdown.state === 'overdue' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">{countdown.label}</div>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {isRTL
                    ? 'انتهى الموعد النهائي لهذه المهمة، ولكن يمكنك تسليمها الآن وسيتم تسجيلها كإنجاز متأخر.'
                    : 'The deadline has passed. You can still submit completion, and it will be recorded as completed late.'}
                </p>
              </div>
            </div>
          )}

          {task.deadlineAt && countdown.state !== 'overdue' && countdown.state !== 'none' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <Clock size={14} className="text-emerald-600 shrink-0" />
              <span>{countdown.label}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('completionNotes')}
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isRTL
                  ? 'أضف ملخصاً لما تم إنجازه أو أي ملاحظات للمدير (اختياري)...'
                  : 'Summarize outcome or add any follow-up notes for your manager (optional)...'
              }
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-none"
            />
          </div>

          {/* Optional Attachments / Proofs */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('attachments')} ({isRTL ? 'اختياري' : 'Optional'})
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  <span>{t('addAttachmentFile')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkInput(!showLinkInput)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  <LinkIcon size={12} />
                  <span>{t('addAttachmentLink')}</span>
                </button>
              </div>
            </div>

            {showLinkInput && (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder={isRTL ? 'عنوان الرابط' : 'Label'}
                  className="sm:col-span-2 px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="sm:col-span-2 px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg cursor-pointer"
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  >
                    {att.type === 'image' ? (
                      <ImageIcon size={12} className="text-blue-500" />
                    ) : att.type === 'link' ? (
                      <LinkIcon size={12} className="text-purple-500" />
                    ) : (
                      <FileText size={12} className="text-red-500" />
                    )}
                    <span className="truncate max-w-[160px] font-semibold text-slate-700 dark:text-slate-200">
                      {att.name}
                    </span>
                    {att.sizeBytes ? (
                      <span className="text-[10px] text-slate-400">
                        {formatBytesCompact(att.sizeBytes)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmitting || isUploading}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md shadow-emerald-600/25 transition-all cursor-pointer'
              )}
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              <span>{isRTL ? 'تأكيد وإتمام المهمة' : 'Submit & Mark Done'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
