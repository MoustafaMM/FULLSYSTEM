import React, { useState, useMemo } from 'react';
import {
  Pin,
  Clock,
  Users,
  UserCheck,
  ThumbsUp,
  Play,
  CheckCircle2,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  BellRing,
  Edit,
  Trash2,
  Eye,
  Megaphone,
  CheckSquare,
  Loader2,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';
import { CounselorTask } from '../types';
import {
  getCounselorTaskCountdown,
  getCounselorTaskMetrics,
  isCounselorProgressCompleted,
} from '../utils/counselorTaskTiming';
import {
  formatShortDateTime,
  getCategoryLabel,
  getCountdownBadgeStyle,
  getPriorityBadgeStyle,
} from './CounselorTaskDetailDrawer';
import { cn } from './layout/Layout';

interface CounselorTaskCardProps {
  key?: React.Key;
  task: CounselorTask;
  nowMs: number;
  onOpenDetail: (task: CounselorTask) => void;
  onOpenCompletionModal: (task: CounselorTask) => void;
  onEditTask: (task: CounselorTask) => void;
  onDeleteTask: (task: CounselorTask) => void;
  onPreviewImage: (media: { url: string; title?: string; timestamp?: string }) => void;
}

export default function CounselorTaskCard({
  task,
  nowMs,
  onOpenDetail,
  onOpenCompletionModal,
  onEditTask,
  onDeleteTask,
  onPreviewImage,
}: CounselorTaskCardProps) {
  const {
    users,
    currentUser,
    language,
    t,
    toggleCounselorTaskLike,
    updateCounselorTaskProgress,
    toggleCounselorSubTask,
    toggleCounselorTaskPin,
    nudgeCounselorTask,
  } = useAppContext();

  const isRTL = language === 'ar';
  const [isLiking, setIsLiking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isNudging, setIsNudging] = useState(false);
  const [togglingSubId, setTogglingSubId] = useState<string | null>(null);

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  const assignedIds = task.assignedCounselorIds || [];
  const targetNamesPreview = useMemo(() => {
    if (task.targetMode === 'all') {
      return `${t('allCounselors')} (${assignedIds.length})`;
    }
    const names = assignedIds.map((id) => userMap[id] || id);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [task.targetMode, assignedIds, userMap, t]);

  if (!currentUser) return null;

  const isManager = currentUser.role === 'counselor_manager' || currentUser.role === 'admin';
  const isAssignedCounselor =
    currentUser.role === 'counselor' && assignedIds.includes(currentUser.id);

  const metrics = getCounselorTaskMetrics(task, nowMs);
  const myAck = task.acknowledgments?.[currentUser.id];
  const myProgress = task.progressByCounselor?.[currentUser.id];
  const myCheckedSet = new Set(myProgress?.checkedSubTaskIds || []);

  const allCompletedByTeam =
    task.mode === 'notice'
      ? metrics.totalAssigned > 0 && metrics.unackedCount === 0
      : metrics.totalAssigned > 0 && metrics.completedCount === metrics.totalAssigned;

  let latestTeamCompletedAt: string | undefined;
  let maxCompletedMs = 0;
  if (task.mode === 'notice') {
    assignedIds.forEach((cid) => {
      const ack = task.acknowledgments?.[cid];
      if (ack?.acknowledgedAt) {
        const ms = new Date(ack.acknowledgedAt).getTime();
        if (!Number.isNaN(ms) && ms > maxCompletedMs) {
          maxCompletedMs = ms;
          latestTeamCompletedAt = ack.acknowledgedAt;
        }
      }
    });
  } else {
    assignedIds.forEach((cid) => {
      const p = task.progressByCounselor?.[cid];
      if (p?.completedAt) {
        const ms = new Date(p.completedAt).getTime();
        if (!Number.isNaN(ms) && ms > maxCompletedMs) {
          maxCompletedMs = ms;
          latestTeamCompletedAt = p.completedAt;
        }
      }
    });
  }

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

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLiking || !isAssignedCounselor) return;
    setIsLiking(true);
    try {
      const liked = await toggleCounselorTaskLike(task.id);
      if (liked) {
        toast.success(isRTL ? 'تم تأكيد المشاهدة بالإعجاب' : 'Liked & acknowledged!');
      } else {
        toast(isRTL ? 'تم إلغاء الإعجاب' : 'Like removed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update Like');
    } finally {
      setIsLiking(false);
    }
  };

  const handleStartWorking = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStarting) return;
    setIsStarting(true);
    try {
      await updateCounselorTaskProgress(task.id, 'in_progress');
      toast.success(isRTL ? 'قيد التنفيذ' : 'Started working on task');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    } finally {
      setIsStarting(false);
    }
  };

  const handleToggleSubtask = async (e: React.MouseEvent, subId: string, isChecked: boolean) => {
    e.stopPropagation();
    if (!isAssignedCounselor || task.mode !== 'action' || togglingSubId) return;
    setTogglingSubId(subId);
    try {
      await toggleCounselorSubTask(task.id, subId, !isChecked);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update checklist item');
    } finally {
      setTogglingSubId(null);
    }
  };

  const handleNudgeUnseen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isNudging) return;
    setIsNudging(true);
    try {
      const count = await nudgeCounselorTask(task.id, 'unacked');
      if (count === 0) {
        toast(isRTL ? 'الجميع شاهد المهمة بالفعل' : 'All counselors have already seen this task!');
      } else {
        toast.success(
          isRTL
            ? `تم إرسال تذكير إلى ${count} مستشار`
            : `Nudged ${count} unseen counselor${count === 1 ? '' : 's'}!`
        );
      }
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.startsWith('NUDGE_COOLDOWN:')) {
        const mins = err.message.split(':')[1] || '5';
        toast.error(
          isRTL
            ? `انتظر ${mins} دقيقة قبل إرسال تذكير جديد`
            : `Wait ${mins} min${mins === '1' ? '' : 's'} before nudging again.`
        );
      } else {
        toast.error(err?.message || 'Failed to send reminder');
      }
    } finally {
      setIsNudging(false);
    }
  };

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleCounselorTaskPin(task.id, !task.isPinned);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to toggle pin');
    }
  };

  const needsCounselorAttention = isAssignedCounselor && !myAck;
  const isCounselorDone = isAssignedCounselor && task.mode === 'action' && isCounselorProgressCompleted(myProgress);

  const visibleSubTasks = (task.subTasks || []).slice(0, 3);
  const extraSubTasksCount = Math.max(0, (task.subTasks || []).length - 3);
  const commentsCount = (task.comments || []).length;

  return (
    <div
      onClick={() => onOpenDetail(task)}
      className={cn(
        'group relative bg-white dark:bg-slate-900 rounded-2xl border shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden cursor-pointer',
        task.isPinned
          ? 'border-amber-300 dark:border-amber-700/80 ring-1 ring-amber-200/60 dark:ring-amber-900/40'
          : needsCounselorAttention
          ? 'border-blue-300 dark:border-blue-800/80 ring-1 ring-blue-200/70 dark:ring-blue-900/40'
          : 'border-slate-200 dark:border-slate-800'
      )}
    >
      {/* Top Priority / Pin Accent Strip */}
      <div
        className={cn(
          'h-1.5 w-full',
          task.priority === 'urgent'
            ? 'bg-red-600'
            : task.priority === 'high'
            ? 'bg-amber-500'
            : task.mode === 'notice'
            ? 'bg-indigo-500'
            : 'bg-blue-600'
        )}
      />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Row 1: Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800">
                <Pin size={10} />
                {t('pinned')}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                task.mode === 'notice'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                  : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
              )}
            >
              {task.mode === 'notice' ? <Megaphone size={10} /> : <CheckSquare size={10} />}
              {task.mode === 'notice' ? (isRTL ? 'إشعار' : 'Notice') : isRTL ? 'مهمة' : 'Task'}
            </span>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase',
                getPriorityBadgeStyle(task.priority)
              )}
            >
              {task.priority === 'urgent'
                ? t('priorityUrgent')
                : task.priority === 'high'
                ? t('priorityHigh')
                : t('priorityNormal')}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {getCategoryLabel(task.category, t)}
            </span>
          </div>

          {needsCounselorAttention && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
              {t('needsMyLike')}
            </span>
          )}
        </div>

        {/* Row 2: Title & Description */}
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
            {displayTitle}
          </h3>
          {task.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}
        </div>

        {/* Row 3: Deadline & Live Countdown */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
            {task.targetMode === 'all' ? <Users size={13} className="shrink-0 text-slate-400" /> : <UserCheck size={13} className="shrink-0 text-slate-400" />}
            <span className="truncate font-medium">{targetNamesPreview}</span>
          </div>

          {task.deadlineAt ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {formatShortDateTime(task.deadlineAt, language)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono',
                  getCountdownBadgeStyle(countdown.state)
                )}
              >
                <Clock size={11} />
                {countdown.label}
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
              <Clock size={10} />
              {t('noDeadline')}
            </span>
          )}
        </div>

        {/* Row 4: Subtasks Preview */}
        {visibleSubTasks.length > 0 && (
          <div
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {visibleSubTasks.map((st) => {
              const checked = isAssignedCounselor ? myCheckedSet.has(st.id) : false;
              const interactive = isAssignedCounselor && task.mode === 'action';
              return (
                <button
                  key={st.id}
                  type="button"
                  disabled={!interactive || togglingSubId === st.id}
                  onClick={(e) => handleToggleSubtask(e, st.id, checked)}
                  className={cn(
                    'w-full flex items-center gap-2 text-start text-xs',
                    interactive ? 'cursor-pointer hover:text-blue-600' : 'cursor-default',
                    checked ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
                  )}
                >
                  {interactive ? (
                    <span
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                        checked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                      )}
                    >
                      {togglingSubId === st.id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : checked ? (
                        <Check size={10} className="stroke-[3]" />
                      ) : null}
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  )}
                  <span className={cn('truncate', checked && 'line-through opacity-75')}>
                    {st.title}
                  </span>
                </button>
              );
            })}
            {extraSubTasksCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail(task);
                }}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {isRTL ? `+${extraSubTasksCount} خطوات أخرى` : `+${extraSubTasksCount} more items`}
              </button>
            )}
          </div>
        )}

        {/* Row 5: Attachments Preview */}
        {task.attachments && task.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {task.attachments.slice(0, 3).map((att) =>
              att.type === 'image' ? (
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer max-w-[160px]"
                >
                  <ImageIcon size={11} className="text-blue-600 shrink-0" />
                  <span className="truncate">{att.name}</span>
                </button>
              ) : (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-w-[160px]"
                >
                  {att.type === 'link' ? (
                    <LinkIcon size={11} className="text-indigo-600 shrink-0" />
                  ) : (
                    <FileText size={11} className="text-red-600 shrink-0" />
                  )}
                  <span className="truncate">{att.name}</span>
                </a>
              )
            )}
            {task.attachments.length > 3 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-500">
                <Paperclip size={10} />+{task.attachments.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Row 6: Manager Progress Bars */}
        {isManager && (
          <div className="space-y-1.5 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-500 dark:text-slate-400">
                  {isRTL ? 'الإعجاب / المشاهدة' : 'Seen (Liked)'}
                </span>
                <span className="text-blue-700 dark:text-blue-400">
                  {metrics.ackedCount} / {metrics.totalAssigned} ({metrics.ackRate}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${metrics.ackRate}%` }}
                />
              </div>
            </div>

            {task.mode === 'action' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-500 dark:text-slate-400">
                    {isRTL ? 'الإنجاز' : 'Completed'}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {metrics.completedCount} / {metrics.totalAssigned} ({metrics.completionRate}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${metrics.completionRate}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Footer Actions */}
      <div
        className="px-4 py-3 bg-slate-50/90 dark:bg-slate-800/50 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Like button + comments */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAssignedCounselor ? (
            <button
              type="button"
              disabled={isLiking || (Boolean(myAck) && task.mode === 'action' && (myProgress?.status === 'in_progress' || isCounselorProgressCompleted(myProgress)))}
              onClick={handleToggleLike}
              title={t('acknowledgeSeenTooltip')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border',
                myAck
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-xs disabled:opacity-95 disabled:cursor-default'
                  : 'bg-white dark:bg-slate-900 hover:bg-blue-50 text-amber-800 dark:text-amber-300 border-2 border-amber-400 dark:border-amber-500 shadow-2xs'
              )}
            >
              {isLiking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ThumbsUp size={14} className={myAck ? 'fill-current' : ''} />
              )}
              <span>{myAck ? t('likedSeen') : t('likeToAcknowledge')}</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-md text-[10px] font-extrabold',
                  myAck ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                )}
              >
                {metrics.ackedCount}/{metrics.totalAssigned}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenDetail(task)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer"
              title={t('accountabilityTracker')}
            >
              <ThumbsUp size={13} className="fill-current" />
              <span>
                {metrics.ackedCount}/{metrics.totalAssigned}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenDetail(task)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title={t('commentsThread')}
          >
            <MessageSquare size={13} />
            <span>{commentsCount}</span>
          </button>
        </div>

        {/* Right: Counselor Progress Actions OR Manager Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isAssignedCounselor && task.mode === 'action' && (
            <>
              {myProgress?.status !== 'in_progress' && !isCounselorProgressCompleted(myProgress) && (
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={handleStartWorking}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Play size={12} className="fill-current" />
                  <span>{t('startWorking')}</span>
                </button>
              )}

              {!isCounselorDone ? (
                <button
                  type="button"
                  onClick={() => onOpenCompletionModal(task)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs cursor-pointer"
                >
                  <CheckCircle2 size={13} />
                  <span>{t('markDone')}</span>
                </button>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border',
                    myProgress?.completedLate
                      ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                  )}
                >
                  <CheckCircle2 size={13} />
                  <span>{isRTL ? 'منجزة' : 'Done'}</span>
                </span>
              )}
            </>
          )}

          {isManager && (
            <>
              {metrics.unackedCount > 0 && (
                <button
                  type="button"
                  disabled={isNudging}
                  onClick={handleNudgeUnseen}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-60"
                  title={t('nudgeUnseen')}
                >
                  <BellRing size={12} />
                  <span className="hidden sm:inline">{t('nudgeUnseen')}</span>
                  <span>({metrics.unackedCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={handlePinToggle}
                className={cn(
                  'p-1.5 rounded-xl border transition-colors cursor-pointer',
                  task.isPinned
                    ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:text-amber-600'
                )}
                title={task.isPinned ? t('unpinTask') : t('pinTask')}
              >
                <Pin size={14} />
              </button>
              <button
                type="button"
                onClick={() => onEditTask(task)}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-500 hover:text-blue-600 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title={t('editCounselorTask')}
              >
                <Edit size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteTask(task)}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-500 hover:text-red-600 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title={isRTL ? 'حذف' : 'Delete'}
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => onOpenDetail(task)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white cursor-pointer"
                title={t('accountabilityTracker')}
              >
                <Eye size={13} />
                <span className="hidden sm:inline">{isRTL ? 'متابعة' : 'Track'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
