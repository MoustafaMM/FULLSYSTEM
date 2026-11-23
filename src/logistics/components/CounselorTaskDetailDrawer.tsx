import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ThumbsUp,
  Clock,
  Pin,
  Users,
  UserCheck,
  CheckCircle2,
  Play,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  BellRing,
  Edit,
  Send,
  MessageSquare,
  AlertTriangle,
  Megaphone,
  CheckSquare,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { CounselorTask, CounselorTaskAttachment, Language } from '../types';
import {
  getCounselorTaskCountdown,
  getCounselorTaskMetrics,
  isCounselorProgressCompleted,
} from '../utils/counselorTaskTiming';
import { formatBytesCompact } from './CreateCounselorTaskModal';
import { cn } from './layout/Layout';

interface CounselorTaskDetailDrawerProps {
  task: CounselorTask | null;
  isOpen: boolean;
  onClose: () => void;
  nowMs: number;
  onOpenCompletionModal: (task: CounselorTask) => void;
  onOpenEditModal: (task: CounselorTask) => void;
  onPreviewImage: (media: { url: string; title?: string; timestamp?: string }) => void;
}

export function getCategoryLabel(category: CounselorTask['category'], t: (k: any) => string): string {
  switch (category) {
    case 'follow_up':
      return t('catFollowUp') || 'Follow-up';
    case 'meeting':
      return t('catMeeting') || 'Meeting';
    case 'admin':
      return t('catAdmin') || 'Admin';
    case 'training':
      return t('catTraining') || 'Training';
    case 'sales_leads':
      return t('catSalesLeads') || 'Sales / Leads';
    case 'notice':
      return t('catNotice') || 'Notice';
    default:
      return t('catOther') || 'Other';
  }
}

export function getPriorityBadgeStyle(priority: CounselorTask['priority']) {
  switch (priority) {
    case 'urgent':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900/50';
    case 'high':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/50';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
}

export function getCountdownBadgeStyle(state: ReturnType<typeof getCounselorTaskCountdown>['state']) {
  switch (state) {
    case 'overdue':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/70 dark:text-red-300 dark:border-red-900/60';
    case 'critical':
      return 'bg-red-50 text-red-700 border-red-300 animate-pulse dark:bg-red-950/50 dark:text-red-300 dark:border-red-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/50';
    case 'normal':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50';
    case 'completed_on_time':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/50';
    case 'completed_late':
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900/50';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

export function formatShortDateTime(iso?: string, language: Language = 'en'): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return language === 'ar'
      ? d.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : format(d, 'MMM dd, HH:mm');
  } catch {
    return iso;
  }
}

export default function CounselorTaskDetailDrawer({
  task,
  isOpen,
  onClose,
  nowMs,
  onOpenCompletionModal,
  onOpenEditModal,
  onPreviewImage,
}: CounselorTaskDetailDrawerProps) {
  const {
    users,
    currentUser,
    language,
    t,
    toggleCounselorTaskLike,
    updateCounselorTaskProgress,
    toggleCounselorSubTask,
    addCounselorTaskComment,
    nudgeCounselorTask,
    toggleCounselorTaskPin,
  } = useAppContext();

  const isRTL = language === 'ar';
  const [rosterTab, setRosterTab] = useState<'unacked' | 'active' | 'completed'>('unacked');
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isNudging, setIsNudging] = useState(false);
  const [togglingSubId, setTogglingSubId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (task && rosterTab === 'completed' && task.mode === 'notice') {
      setRosterTab('unacked');
    }
  }, [task?.id, task?.mode, rosterTab]);

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  const latestTeamCompletedAt = useMemo(() => {
    if (!task) return undefined;
    const assigned = task.assignedCounselorIds || [];
    let maxIso: string | undefined;
    let maxMs = 0;
    if (task.mode === 'notice') {
      assigned.forEach((cid) => {
        const ack = task.acknowledgments?.[cid];
        if (ack?.acknowledgedAt) {
          const ms = new Date(ack.acknowledgedAt).getTime();
          if (!Number.isNaN(ms) && ms > maxMs) {
            maxMs = ms;
            maxIso = ack.acknowledgedAt;
          }
        }
      });
    } else {
      assigned.forEach((cid) => {
        const p = task.progressByCounselor?.[cid];
        if (p?.completedAt) {
          const ms = new Date(p.completedAt).getTime();
          if (!Number.isNaN(ms) && ms > maxMs) {
            maxMs = ms;
            maxIso = p.completedAt;
          }
        }
      });
    }
    return maxIso;
  }, [task?.mode, task?.assignedCounselorIds, task?.acknowledgments, task?.progressByCounselor]);

  if (!isOpen || !task || !currentUser) return null;

  const isManager = currentUser.role === 'counselor_manager' || currentUser.role === 'admin';
  const isAssignedCounselor =
    currentUser.role === 'counselor' && (task.assignedCounselorIds || []).includes(currentUser.id);

  const metrics = getCounselorTaskMetrics(task, nowMs);
  const myAck = task.acknowledgments?.[currentUser.id];
  const myProgress = task.progressByCounselor?.[currentUser.id];
  const myCheckedSet = new Set(myProgress?.checkedSubTaskIds || []);

  // Determine deadline countdown tailored to viewer role
  const allCompletedByTeam =
    task.mode === 'notice'
      ? metrics.totalAssigned > 0 && metrics.unackedCount === 0
      : metrics.totalAssigned > 0 && metrics.completedCount === metrics.totalAssigned;

  const countdown = isAssignedCounselor
    ? getCounselorTaskCountdown({
        deadlineAt: task.deadlineAt,
        nowMs,
        isCompleted:
          task.mode === 'notice'
            ? Boolean(myAck)
            : isCounselorProgressCompleted(myProgress),
        completedAt:
          task.mode === 'notice'
            ? myAck?.acknowledgedAt
            : myProgress?.completedAt,
        language,
      })
    : getCounselorTaskCountdown({
        deadlineAt: task.deadlineAt,
        nowMs,
        isCompleted: allCompletedByTeam,
        completedAt: latestTeamCompletedAt,
        language,
      });

  const displayTitle = isRTL && task.titleAr ? task.titleAr : task.title;
  const secondaryTitle = isRTL && task.titleAr && task.titleAr !== task.title ? task.title : (!isRTL && task.titleAr ? task.titleAr : null);

  // Categorized counselor lists for Manager Accountability Tracker
  const assignedIds = task.assignedCounselorIds || [];
  const unackedList = assignedIds.filter((cid) => !task.acknowledgments?.[cid]);
  const seenActiveList = assignedIds.filter((cid) => {
    const acked = Boolean(task.acknowledgments?.[cid]);
    const prog = task.progressByCounselor?.[cid];
    if (task.mode === 'notice') return acked;
    return (acked || prog?.status === 'in_progress') && !isCounselorProgressCompleted(prog);
  });
  const completedList = assignedIds.filter((cid) =>
    isCounselorProgressCompleted(task.progressByCounselor?.[cid])
  );

  const handleToggleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      const liked = await toggleCounselorTaskLike(task.id);
      if (liked) {
        toast.success(isRTL ? 'تم تسجيل إعجابك ومعرفتك بالمهمة' : 'Marked as seen & acknowledged!');
      } else {
        toast(isRTL ? 'تم إلغاء التأكيد' : 'Acknowledgment removed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update acknowledgment');
    } finally {
      setIsLiking(false);
    }
  };

  const handleStartWorking = async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await updateCounselorTaskProgress(task.id, 'in_progress');
      toast.success(isRTL ? 'تم بدء العمل على المهمة' : 'Task marked In Progress');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start task');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleReopenTask = async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await updateCounselorTaskProgress(task.id, 'in_progress');
      toast.success(isRTL ? 'تمت إعادة فتح المهمة' : 'Task reopened to In Progress');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reopen task');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleToggleSubtask = async (subId: string, currentlyChecked: boolean) => {
    if (!isAssignedCounselor || task.mode !== 'action') return;
    setTogglingSubId(subId);
    try {
      await toggleCounselorSubTask(task.id, subId, !currentlyChecked);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update checklist');
    } finally {
      setTogglingSubId(null);
    }
  };

  const handleNudge = async (scope: 'unacked' | 'incomplete') => {
    if (isNudging) return;
    setIsNudging(true);
    try {
      const count = await nudgeCounselorTask(task.id, scope);
      if (count === 0) {
        toast(isRTL ? 'لا يوجد مستشارون بحاجة لتذكير' : 'Everyone in this group is already up to date!');
      } else {
        toast.success(
          isRTL
            ? `تم إرسال تذكير إلى ${count} مستشار`
            : `Reminder sent to ${count} counselor${count === 1 ? '' : 's'}!`
        );
      }
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.startsWith('NUDGE_COOLDOWN:')) {
        const mins = err.message.split(':')[1] || '5';
        toast.error(
          isRTL
            ? `يرجى الانتظار ${mins} دقيقة قبل إرسال تذكير آخر`
            : `Please wait ${mins} min${mins === '1' ? '' : 's'} before sending another reminder.`
        );
      } else {
        toast.error(err?.message || 'Failed to send reminder');
      }
    } finally {
      setIsNudging(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isPostingComment) return;
    setIsPostingComment(true);
    try {
      await addCounselorTaskComment(task.id, commentText);
      setCommentText('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send comment');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleRenderAttachment = (att: CounselorTaskAttachment) => {
    if (att.type === 'image') {
      return (
        <button
          key={att.id}
          type="button"
          onClick={() =>
            onPreviewImage({
              url: att.url,
              title: att.name,
              timestamp: att.uploadedAt,
            })
          }
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <ImageIcon size={14} className="text-blue-600 shrink-0" />
          <span className="truncate max-w-[180px]">{att.name}</span>
          {att.sizeBytes && <span className="text-[10px] text-slate-400">{formatBytesCompact(att.sizeBytes)}</span>}
        </button>
      );
    }

    return (
      <a
        key={att.id}
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
      >
        {att.type === 'link' ? (
          <LinkIcon size={14} className="text-indigo-600 shrink-0" />
        ) : (
          <FileText size={14} className="text-red-600 shrink-0" />
        )}
        <span className="truncate max-w-[180px]">{att.name}</span>
        {att.sizeBytes && <span className="text-[10px] text-slate-400">{formatBytesCompact(att.sizeBytes)}</span>}
        <ExternalLink size={12} className="text-slate-400 shrink-0" />
      </a>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150"
      dir={isRTL ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl border-s border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70 shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.isPinned && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800">
                  <Pin size={11} />
                  {t('pinned')}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border',
                  task.mode === 'notice'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                    : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                )}
              >
                {task.mode === 'notice' ? <Megaphone size={11} /> : <CheckSquare size={11} />}
                {task.mode === 'notice' ? t('noticeMode') : t('actionTaskMode')}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider',
                  getPriorityBadgeStyle(task.priority)
                )}
              >
                {task.priority === 'urgent'
                  ? t('priorityUrgent')
                  : task.priority === 'high'
                  ? t('priorityHigh')
                  : t('priorityNormal')}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {getCategoryLabel(task.category, t)}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white leading-snug">
              {displayTitle}
            </h2>
            {secondaryTitle && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {secondaryTitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {isRTL ? 'بواسطة' : 'By'}{' '}
                <strong className="text-slate-700 dark:text-slate-200">{task.createdByName}</strong>
              </span>
              <span>• {formatShortDateTime(task.createdAt, language)}</span>
              <span className="inline-flex items-center gap-1">
                {task.targetMode === 'all' ? <Users size={13} /> : <UserCheck size={13} />}
                {task.targetMode === 'all'
                  ? `${t('allCounselors')} (${metrics.totalAssigned})`
                  : `${metrics.totalAssigned} ${isRTL ? 'مستشار' : 'counselors'}`}
              </span>
            </div>

            {task.deadlineAt ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {formatShortDateTime(task.deadlineAt, language)}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border font-mono',
                    getCountdownBadgeStyle(countdown.state)
                  )}
                >
                  <Clock size={12} />
                  {countdown.label}
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                <Clock size={11} />
                {t('noDeadline')}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Assigned Counselor Primary Interaction Panel */}
          {isAssignedCounselor && (
            <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Like (Acknowledgment) Button */}
                <button
                  type="button"
                  disabled={isLiking || (Boolean(myAck) && task.mode === 'action' && (myProgress?.status === 'in_progress' || isCounselorProgressCompleted(myProgress)))}
                  onClick={handleToggleLike}
                  title={t('acknowledgeSeenTooltip')}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 border',
                    myAck
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm shadow-blue-600/25 disabled:opacity-90 disabled:cursor-default'
                      : 'bg-white dark:bg-slate-900 hover:bg-blue-50 text-amber-800 dark:text-amber-300 border-2 border-amber-400 dark:border-amber-500 shadow-xs'
                  )}
                >
                  {isLiking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ThumbsUp size={16} className={myAck ? 'fill-current' : ''} />
                  )}
                  <span>
                    {myAck
                      ? `${t('likedSeen')} • ${formatShortDateTime(myAck.acknowledgedAt, language)}`
                      : t('likeToAcknowledge')}
                  </span>
                </button>

                {/* Action Task Execution Buttons */}
                {task.mode === 'action' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {myProgress?.status !== 'in_progress' && !isCounselorProgressCompleted(myProgress) && (
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={handleStartWorking}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                      >
                        <Play size={14} className="fill-current" />
                        {t('startWorking')}
                      </button>
                    )}

                    {!isCounselorProgressCompleted(myProgress) ? (
                      <button
                        type="button"
                        onClick={() => onOpenCompletionModal(task)}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm shadow-emerald-600/25 cursor-pointer"
                      >
                        <CheckCircle2 size={15} />
                        {t('markDone')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border',
                            myProgress?.completedLate
                              ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                          )}
                        >
                          <CheckCircle2 size={14} />
                          {myProgress?.completedLate
                            ? isRTL
                              ? 'منجزة متأخراً'
                              : 'Done Late'
                            : isRTL
                            ? 'منجزة في الوقت'
                            : 'Completed On Time'}
                        </span>
                        <button
                          type="button"
                          disabled={isUpdatingStatus}
                          onClick={handleReopenTask}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
                          title={isRTL ? 'إعادة فتح المهمة' : 'Reopen task'}
                        >
                          <RotateCcw size={13} />
                          <span>{isRTL ? 'إعادة فتح' : 'Reopen'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Counselor completion note preview */}
              {isCounselorProgressCompleted(myProgress) &&
                (myProgress?.completionNote || (myProgress?.completionAttachments && myProgress.completionAttachments.length > 0)) && (
                  <div className="pt-2.5 border-t border-blue-200/70 dark:border-blue-900/40 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {isRTL ? 'ملخص الإنجاز الخاص بك' : 'Your Completion Submission'}
                    </p>
                    {myProgress?.completionNote && (
                      <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 whitespace-pre-wrap">
                        {myProgress.completionNote}
                      </p>
                    )}
                    {myProgress?.completionAttachments && myProgress.completionAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {myProgress.completionAttachments.map(handleRenderAttachment)}
                      </div>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isRTL ? 'التفاصيل' : 'Details & Instructions'}
              </h4>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {task.description}
              </div>
            </div>
          )}

          {/* Task Attachments */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Paperclip size={13} />
                {t('attachments')} ({task.attachments.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {task.attachments.map(handleRenderAttachment)}
              </div>
            </div>
          )}

          {/* Subtasks Checklist */}
          {task.subTasks && task.subTasks.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {isRTL ? 'قائمة الخطوات' : 'Checklist'} ({task.subTasks.length})
                </h4>
                {isAssignedCounselor && (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {task.subTasks.filter((s) => myCheckedSet.has(s.id)).length} / {task.subTasks.length}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {task.subTasks.map((st) => {
                  const isChecked = isAssignedCounselor ? myCheckedSet.has(st.id) : false;
                  const canToggle = isAssignedCounselor && task.mode === 'action';
                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!canToggle || togglingSubId === st.id}
                      onClick={() => handleToggleSubtask(st.id, isChecked)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-colors',
                        isChecked
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
                        canToggle ? 'hover:bg-blue-50/50 cursor-pointer' : 'cursor-default'
                      )}
                    >
                      {canToggle ? (
                        <span
                          className={cn(
                            'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                          )}
                        >
                          {togglingSubId === st.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : isChecked ? (
                            <CheckCircle2 size={13} />
                          ) : null}
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                      )}
                      <span className={cn('text-sm font-medium', isChecked && 'line-through opacity-75')}>
                        {st.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manager / Admin Accountability Tracker */}
          {isManager && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users size={16} className="text-red-600" />
                    {t('accountabilityTracker')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isRTL
                      ? `الإعجاب: ${metrics.ackedCount}/${metrics.totalAssigned} (${metrics.ackRate}%)`
                      : `Acknowledged: ${metrics.ackedCount}/${metrics.totalAssigned} (${metrics.ackRate}%)`}
                    {task.mode === 'action' && (
                      <>
                        {' • '}
                        {isRTL
                          ? `الإنجاز: ${metrics.completedCount}/${metrics.totalAssigned} (${metrics.completionRate}%)`
                          : `Completed: ${metrics.completedCount}/${metrics.totalAssigned} (${metrics.completionRate}%)`}
                      </>
                    )}
                  </p>
                </div>

                {/* Manager Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCounselorTaskPin(task.id, !task.isPinned)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer',
                      task.isPinned
                        ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <Pin size={12} />
                    {task.isPinned ? t('unpinTask') : t('pinTask')}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenEditModal(task)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Edit size={12} />
                    {isRTL ? 'تعديل' : 'Edit'}
                  </button>

                  {metrics.unackedCount > 0 && (
                    <button
                      type="button"
                      disabled={isNudging}
                      onClick={() => handleNudge('unacked')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                    >
                      <BellRing size={12} />
                      {t('nudgeUnseen')} ({metrics.unackedCount})
                    </button>
                  )}

                  {task.mode === 'action' && metrics.incompleteIds.length > 0 && (
                    <button
                      type="button"
                      disabled={isNudging}
                      onClick={() => handleNudge('incomplete')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                    >
                      <BellRing size={12} />
                      {t('nudgeIncomplete')} ({metrics.incompleteIds.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Roster Tabs */}
              <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setRosterTab('unacked')}
                  className={cn(
                    'flex-1 min-w-[100px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    rosterTab === 'unacked'
                      ? 'bg-white dark:bg-slate-800 text-red-700 dark:text-red-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  )}
                >
                  {t('notSeenYet')} ({unackedList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRosterTab('active')}
                  className={cn(
                    'flex-1 min-w-[100px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    rosterTab === 'active'
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  )}
                >
                  {t('seenActive')} ({seenActiveList.length})
                </button>
                {task.mode === 'action' && (
                  <button
                    type="button"
                    onClick={() => setRosterTab('completed')}
                    className={cn(
                      'flex-1 min-w-[100px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                      rosterTab === 'completed'
                        ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                  >
                    {t('completedTab')} ({completedList.length})
                  </button>
                )}
              </div>

              {/* Roster List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {rosterTab === 'unacked' &&
                  (unackedList.length > 0 ? (
                    unackedList.map((cid) => (
                      <div
                        key={cid}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center font-bold">
                            {(userMap[cid] || '?').charAt(0)}
                          </div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {userMap[cid] || cid}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <AlertTriangle size={11} />
                          {t('notSeenYet')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      {isRTL ? 'جميع المستشارين ضغطوا إعجاب وشاهدوا المهمة!' : 'All assigned counselors have liked & seen this task!'}
                    </p>
                  ))}

                {rosterTab === 'active' &&
                  (seenActiveList.length > 0 ? (
                    seenActiveList.map((cid) => {
                      const ack = task.acknowledgments?.[cid];
                      const prog = task.progressByCounselor?.[cid];
                      const subTotal = task.subTasks?.length || 0;
                      const subDone = prog?.checkedSubTaskIds?.length || 0;
                      return (
                        <div
                          key={cid}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold shrink-0">
                              {(userMap[cid] || ack?.counselorName || '?').charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {userMap[cid] || ack?.counselorName || cid}
                              </p>
                              {ack && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {t('likedSeen')}: {formatShortDateTime(ack.acknowledgedAt, language)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {subTotal > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {subDone}/{subTotal}
                              </span>
                            )}
                            {task.mode === 'action' && prog?.status === 'in_progress' && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                {isRTL ? 'قيد التنفيذ' : 'In Progress'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      {isRTL ? 'لا يوجد مستشارون في هذه القائمة حالياً' : 'No counselors in this list yet.'}
                    </p>
                  ))}

                {rosterTab === 'completed' &&
                  task.mode === 'action' &&
                  (completedList.length > 0 ? (
                    completedList.map((cid) => {
                      const ack = task.acknowledgments?.[cid];
                      const prog = task.progressByCounselor?.[cid];
                      return (
                        <div
                          key={cid}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
                                {(userMap[cid] || ack?.counselorName || '?').charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {userMap[cid] || ack?.counselorName || cid}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {isRTL ? 'أنجزت في' : 'Done'}: {formatShortDateTime(prog?.completedAt, language)}
                                  {ack ? ` • ${t('likedSeen')}: ${formatShortDateTime(ack.acknowledgedAt, language)}` : ''}
                                </p>
                              </div>
                            </div>

                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 border',
                                prog?.completedLate
                                  ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                              )}
                            >
                              {prog?.completedLate
                                ? isRTL
                                  ? 'متأخر'
                                  : 'Late'
                                : isRTL
                                ? 'في الوقت'
                                : 'On Time'}
                            </span>
                          </div>

                          {prog?.completionNote && (
                            <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700 whitespace-pre-wrap">
                              {prog.completionNote}
                            </p>
                          )}

                          {prog?.completionAttachments && prog.completionAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {prog.completionAttachments.map(handleRenderAttachment)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      {isRTL ? 'لم يُنجز أي مستشار هذه المهمة بعد' : 'No counselor has completed this task yet.'}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* Discussion & Comments Thread */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <MessageSquare size={14} />
              {t('commentsThread')} ({(task.comments || []).length})
            </h4>

            <div className="space-y-2.5">
              {(task.comments || []).length > 0 ? (
                (task.comments || []).map((c) => {
                  const isOwn = c.authorId === currentUser.id;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'p-3 rounded-2xl border text-xs sm:text-sm space-y-1',
                        isOwn
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {c.authorName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {t(c.authorRole as any) || c.authorRole.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatShortDateTime(c.createdAt, language)}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                        {c.text}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  {isRTL ? 'لا توجد تعليقات بعد. ابدأ النقاش أدناه.' : 'No comments yet. Start a discussion below.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Comment Composer Footer */}
        {(isManager || isAssignedCounselor) && (
          <form
            onSubmit={handlePostComment}
            className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 shrink-0 flex items-end gap-2"
          >
            <textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePostComment(e);
                }
              }}
              placeholder={t('addCommentPlaceholder')}
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-none"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || isPostingComment}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isPostingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{t('postComment')}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
