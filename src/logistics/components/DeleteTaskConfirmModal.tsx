import React from 'react';
import { Task } from '../types';
import { useAppContext } from '../context/AppContext';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  User, 
  Calendar, 
  Clock, 
  Receipt, 
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import { getTaskDisplayTitle, getTaskSubjectName, getTaskStatusBadgeClasses, normalizeTaskStatus } from '../utils/taskClassification';

interface DeleteTaskConfirmModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onConfirm: (task: Task) => Promise<void>;
  isDeleting: boolean;
}

export default function DeleteTaskConfirmModal({
  isOpen,
  task,
  onClose,
  onConfirm,
  isDeleting
}: DeleteTaskConfirmModalProps) {
  const { t, students, users, presets, expenses, currentUser } = useAppContext();

  if (!isOpen || !task || currentUser?.role !== 'admin') return null;

  const officer = task.assigneeId ? users.find(u => u.id === task.assigneeId) : null;
  const student = !task.isNonStudentTask && task.studentId ? students.find(s => s.id === task.studentId) : null;

  const taskTitle = getTaskDisplayTitle(task, presets);
  const beneficiaryName = getTaskSubjectName(task, students);

  const linkedExpenses = expenses.filter(e => e.taskId === task.id);
  const totalSubtasks = task.subTasks?.length || 0;
  const completedSubtasks = task.subTasks?.filter(st => st.isCompleted)?.length || 0;
  const proofCount = task.subTasks?.reduce((acc, st) => acc + (st.media?.length || 0), 0) || 0;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Danger Accent */}
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200 shadow-2xs">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {t('confirmDeleteTaskTitle') || 'Delete Operational Task?'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {t('confirmDeleteTaskDesc') || 'This action will permanently delete this task from the operational log.'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-xl hover:bg-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content & Details */}
        <div className="p-5 space-y-4 text-xs">
          {/* Task Summary Card */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-extrabold text-sm text-slate-900 leading-snug">
                {taskTitle}
              </span>
              {(() => {
                const effectiveStatus = normalizeTaskStatus(task);
                return (
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shrink-0 ${getTaskStatusBadgeClasses(effectiveStatus)}`}>
                    {t(effectiveStatus) || effectiveStatus.replace('_', ' ')}
                  </span>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 text-slate-600">
              <User size={13} className="text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-800 truncate">{beneficiaryName}</span>
              {student?.passportNumber && (
                <span className="text-slate-400 font-mono text-[11px]">({student.passportNumber})</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px] pt-1 border-t border-slate-200/60">
              {(task.taskDate || task.createdAt) && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-red-500" />
                  <span>{formatDateDDMMYYYY(task.taskDate || task.createdAt)}</span>
                </span>
              )}
              {task.taskTime && (
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  <span>{task.taskTime}</span>
                </span>
              )}
              {officer && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Officer: <strong className="text-slate-700">{officer.name}</strong></span>
                </span>
              )}
            </div>
          </div>

          {/* Operational Progress Status */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="text-slate-500">Subtasks:</span>
              <span className="font-bold text-slate-800">{completedSubtasks} / {totalSubtasks}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="text-slate-500">Proof Photos:</span>
              <span className="font-bold text-slate-800">{proofCount}</span>
            </div>
          </div>

          {/* Linked Expenses Protection Notice */}
          {linkedExpenses.length > 0 ? (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800">
                <Receipt size={14} className="text-amber-600 shrink-0" />
                <span>Financial Safety Notice ({linkedExpenses.length} Linked {linkedExpenses.length === 1 ? 'Expense' : 'Expenses'})</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {t('deleteTaskExpensesNote') || 'Any expenses logged under this task will remain safely stored in the officer wallet records (unlinked from this task). Wallet balances and audit history will not be affected.'}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-2 text-slate-600 text-[11px]">
              <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
              <span>No financial expenses or deductions are attached to this task.</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(task)}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>{isDeleting ? 'Deleting...' : (t('deleteTask') || 'Delete Task')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
