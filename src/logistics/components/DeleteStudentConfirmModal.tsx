import React from 'react';
import { Student } from '../types';
import { useAppContext } from '../context/AppContext';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  User, 
  GraduationCap, 
  MapPin, 
  ListTodo, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { splitFullName } from '../utils/nameUtils';

interface DeleteStudentConfirmModalProps {
  isOpen: boolean;
  students: Student[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export default function DeleteStudentConfirmModal({
  isOpen,
  students,
  onClose,
  onConfirm,
  isDeleting
}: DeleteStudentConfirmModalProps) {
  const { t, tasks, users, language } = useAppContext();

  if (!isOpen || !students || students.length === 0) return null;

  const isMultiple = students.length > 1;
  const singleStudent = !isMultiple ? students[0] : null;

  // Calculate total associated tasks
  const studentIds = new Set(students.map(s => s.id));
  const linkedTasks = tasks.filter(t => t.studentId && studentIds.has(t.studentId));
  const totalTasksCount = linkedTasks.length;

  const counselorUser = singleStudent ? users.find(u => u.id === singleStudent.counselor) : null;
  const counselorName = counselorUser ? counselorUser.name : singleStudent?.counselor;
  const nameParts = singleStudent ? splitFullName(singleStudent.fullName) : null;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Red Warning Accent */}
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between bg-red-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200 shadow-2xs">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {isMultiple 
                  ? (t('confirmDeleteMultipleStudentsTitle') || `Delete ${students.length} Student Profiles?`)
                  : (t('confirmDeleteStudentTitle') || 'Delete Student Profile?')}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isMultiple
                  ? (t('confirmDeleteMultipleStudentsDesc') || 'This action is permanent and cannot be undone.')
                  : (t('confirmDeleteStudentDesc') || 'This action is permanent and cannot be undone.')}
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

        {/* Content Section */}
        <div className="p-5 space-y-4 text-xs">
          {/* Single Student Detailed View */}
          {singleStudent && nameParts && (
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <User size={15} />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 leading-snug">
                      <span>{nameParts.line1}</span>
                      {nameParts.line2 && <span className="ml-1 text-slate-600">{nameParts.line2}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {singleStudent.passportNumber}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {singleStudent.arrivalCategory || 'Student'}
                  </span>
                  {(singleStudent.package || (singleStudent as any).servicePackage) && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      {singleStudent.package || (singleStudent as any).servicePackage}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">{singleStudent.university || 'No university'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <GraduationCap size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">{singleStudent.program || 'No program'}</span>
                </div>
                {counselorName && (
                  <div className="col-span-2 text-slate-500 text-[11px]">
                    Counselor: <strong className="text-slate-700">{counselorName}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Multiple Students List View */}
          {isMultiple && (
            <div className="space-y-2">
              <div className="text-slate-700 font-semibold flex items-center justify-between">
                <span>Selected Profiles ({students.length}):</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                {students.map(s => (
                  <div key={s.id} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{s.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{s.passportNumber} &bull; {s.university}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-slate-200 text-slate-700 shrink-0">
                      {s.arrivalCategory || 'Student'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operational Tasks Impact Warning */}
          {totalTasksCount > 0 ? (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800">
                <ListTodo size={14} className="text-amber-600 shrink-0" />
                <span>
                  Associated Operational Tasks ({totalTasksCount} {totalTasksCount === 1 ? 'task' : 'tasks'})
                </span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                All {totalTasksCount} operational {totalTasksCount === 1 ? 'task' : 'tasks'} linked to {isMultiple ? 'these students' : 'this student'} will be deleted. Any logged expenses will be safely preserved in officer wallet records.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-2 text-slate-600 text-[11px]">
              <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
              <span>No active operational tasks are linked to {isMultiple ? 'these profiles' : 'this profile'}.</span>
            </div>
          )}

          {/* Critical Security Disclaimer */}
          <div className="flex items-start gap-2 p-2.5 bg-red-50/60 rounded-xl border border-red-100 text-red-700 text-[11px]">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
            <p>
              <strong>Admin Only:</strong> Once deleted, {isMultiple ? 'these student records' : 'this student record'} cannot be recovered.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {t('cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>
              {isDeleting 
                ? 'Deleting...' 
                : isMultiple 
                  ? (t('deleteSelectedStudents') || `Delete ${students.length} Profiles`)
                  : (t('deleteStudentProfile') || 'Delete Student Profile')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
