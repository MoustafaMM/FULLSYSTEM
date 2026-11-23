import React, { useState, useEffect, useMemo } from 'react';
import { Task, SubTask } from '../types';
import { useAppContext } from '../context/AppContext';
import { 
  X, 
  Trash2, 
  User, 
  Car, 
  Calendar, 
  Clock, 
  Building2, 
  CheckCircle2, 
  Phone, 
  FileText,
  AlertCircle,
  Plus,
  Camera,
  Check,
  ShieldCheck,
  Layers,
  Sparkles,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from './layout/Layout';
import {
  hasPresetTemplate,
  isLegacyCopiedNonStudentCustomTitle,
  normalizeTaskStatus
} from '../utils/taskClassification';
import { hasValidLogisticReport } from '../utils/taskCompletion';

interface EditTaskModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
  onRequestDelete?: (task: Task) => void;
}

export default function EditTaskModal({
  isOpen,
  task,
  onClose,
  onTaskUpdated,
  onRequestDelete
}: EditTaskModalProps) {
  const { 
    t, 
    tasks,
    students, 
    presets, 
    users, 
    vehicles, 
    currentUser,
    updateTask, 
    language 
  } = useAppContext();

  // Basic task attributes
  const [isNonStudent, setIsNonStudent] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [nonStudentTitle, setNonStudentTitle] = useState('');
  const [nonStudentContact, setNonStudentContact] = useState('');
  
  // Preset & Custom Title
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customTitleAr, setCustomTitleAr] = useState('');
  
  // Assignment & Logistics
  const [assigneeId, setAssigneeId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [status, setStatus] = useState<Task['status']>('pending');
  const [openedStatus, setOpenedStatus] = useState<Task['status']>('pending');
  const [hotel, setHotel] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  
  // Notes & Instructions
  const [notes, setNotes] = useState('');
  const [initialNotes, setInitialNotes] = useState('');
  const [coordinatorNote1, setCoordinatorNote1] = useState('');
  const [coordinatorNote2, setCoordinatorNote2] = useState('');

  // Subtasks
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subTasksDirty, setSubTasksDirty] = useState(false);
  const [newSubTaskEn, setNewSubTaskEn] = useState('');
  const [newSubTaskAr, setNewSubTaskAr] = useState('');
  const [newSubTaskProof, setNewSubTaskProof] = useState(false);

  // Search & Form Status
  const [studentSearch, setStudentSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const liveTask = useMemo(
    () => (task ? tasks.find(item => item.id === task.id) : undefined),
    [tasks, task]
  );
  const liveStatus = useMemo(
    () => (liveTask ? normalizeTaskStatus(liveTask) : openedStatus),
    [liveTask, openedStatus]
  );

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  // Synchronize state when target task opens
  useEffect(() => {
    setFormError(null);
    setIsSubmitting(false);
    setStudentSearch('');
    setNewSubTaskEn('');
    setNewSubTaskAr('');
    setNewSubTaskProof(false);
    setSubTasksDirty(false);

    if (task && isOpen) {
      const normalizedStatus = normalizeTaskStatus(task);
      const rawNotes = task.notes || '';
      setIsNonStudent(!!task.isNonStudentTask);
      setStudentId(task.studentId || '');
      setStudentEmail(task.studentEmail || '');
      setNonStudentTitle(task.nonStudentTitle || '');
      setNonStudentContact(task.nonStudentContact || '');
      
      setSelectedPresetId(hasPresetTemplate(task) ? task.presetId! : 'custom');
      setCustomTitle(isLegacyCopiedNonStudentCustomTitle(task) ? '' : (task.customTitle || ''));
      setCustomTitleAr(task.customTitleAr || '');
      
      setAssigneeId(task.assigneeId || '');
      setVehicleId(task.vehicleId || '');
      setTaskDate(task.taskDate || '');
      setTaskTime(task.taskTime || '');
      setStatus(normalizedStatus);
      setOpenedStatus(normalizedStatus);
      setHotel(task.hotel || '');
      setFlightNumber(task.flightNumber || '');
      
      setNotes(rawNotes);
      setInitialNotes(rawNotes);
      setCoordinatorNote1(task.coordinatorNote1 || '');
      setCoordinatorNote2(task.coordinatorNote2 || '');
      
      setSubTasks(task.subTasks ? JSON.parse(JSON.stringify(task.subTasks)) : []);
    }
  }, [task, isOpen]);

  // When student selection changes, prefill student email if empty
  const handleStudentSelect = (id: string) => {
    setStudentId(id);
    const selectedStd = students.find(s => s.id === id);
    if (selectedStd && (!studentEmail || studentEmail === '')) {
      setStudentEmail(selectedStd.email || '');
    }
  };

  // Subtasks Handlers
  const handleAddSubTask = () => {
    if (!newSubTaskEn.trim()) return;
    const newSt: SubTask = {
      id: `st-${Date.now()}-${subTasks.length}`,
      titleEn: newSubTaskEn.trim(),
      titleAr: newSubTaskAr.trim() || newSubTaskEn.trim(),
      isCompleted: false,
      requiresProof: newSubTaskProof
    };
    setSubTasks(prev => [...prev, newSt]);
    setSubTasksDirty(true);
    setNewSubTaskEn('');
    setNewSubTaskAr('');
    setNewSubTaskProof(false);
  };

  const handleRemoveSubTask = (idx: number) => {
    setSubTasks(prev => prev.filter((_, i) => i !== idx));
    setSubTasksDirty(true);
  };

  const handleToggleProof = (idx: number) => {
    setSubTasks(prev => prev.map((st, i) => i === idx ? { ...st, requiresProof: !st.requiresProof } : st));
    setSubTasksDirty(true);
  };

  const handleToggleSubTaskCompleted = (idx: number) => {
    setSubTasks(prev => prev.map((st, i) => {
      if (i === idx) {
        const nextState = !st.isCompleted;
        return {
          ...st,
          isCompleted: nextState,
          completedAt: nextState ? new Date().toISOString() : undefined
        };
      }
      return st;
    }));
    setSubTasksDirty(true);
  };

  const handleSubTaskTitleChange = (idx: number, lang: 'en' | 'ar', value: string) => {
    setSubTasks(prev => prev.map((st, i) => {
      if (i === idx) {
        return lang === 'en' ? { ...st, titleEn: value } : { ...st, titleAr: value };
      }
      return st;
    }));
    setSubTasksDirty(true);
  };

  // Filter students for searchable dropdown
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase().trim();
    return students.filter(s => 
      s.fullName?.toLowerCase().includes(q) ||
      s.passportNumber?.toLowerCase().includes(q) ||
      s.university?.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isNonStudent && !studentId) {
      setFormError('Please select a student for this task.');
      return;
    }

    if (isNonStudent && !nonStudentTitle.trim()) {
      setFormError('Please enter a Task Title / Beneficiary Name.');
      return;
    }

    if (!assigneeId) {
      setFormError('Please assign a Field Operations Officer.');
      return;
    }

    if (subTasks.length === 0) {
      setFormError('Task must have at least one milestone or subtask.');
      return;
    }

    // Prevent stale open status from accidentally reverting a task that finished while modal was open
    if (
      openedStatus !== 'completed' &&
      openedStatus !== 'cancelled' &&
      (liveStatus === 'completed' || liveStatus === 'cancelled') &&
      (status === 'pending' || status === 'in_progress')
    ) {
      setFormError(
        'This task was just completed or cancelled in the background while you were editing. Please close and reopen this modal before making changes.'
      );
      return;
    }

    const effectiveNotesForCompletion =
      notes !== initialNotes ? notes : (liveTask?.notes ?? notes);

    if (status === 'completed' && openedStatus !== 'completed' && !hasValidLogisticReport(effectiveNotesForCompletion)) {
      setFormError(t('logisticReportRequiredError') || 'Logistic Report is compulsory to fill before finishing the task.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isCustom = selectedPresetId === 'custom';
      const statusWasExplicitlyChanged = status !== openedStatus;
      const updates: Partial<Task> = {
        isNonStudentTask: isNonStudent,
        studentId: isNonStudent ? undefined : studentId,
        studentEmail: !isNonStudent && studentEmail.trim() ? studentEmail.trim().toLowerCase() : undefined,
        nonStudentTitle: isNonStudent ? nonStudentTitle.trim() : undefined,
        nonStudentContact: isNonStudent && nonStudentContact.trim() ? nonStudentContact.trim() : undefined,
        presetId: isCustom ? undefined : selectedPresetId,
        customTitle: customTitle.trim() || undefined,
        customTitleAr: customTitleAr.trim() || undefined,
        assigneeId,
        vehicleId: vehicleId || undefined,
        taskDate: taskDate || undefined,
        taskTime: taskTime || undefined,
        ...(statusWasExplicitlyChanged ? { status } : {}),
        hotel: hotel.trim() || undefined,
        flightNumber: flightNumber.trim() || undefined,
        ...(notes !== initialNotes
          ? {
              notes: notes.trim() || undefined,
              notesUpdatedAt: notes.trim() ? new Date().toISOString() : undefined
            }
          : {}),
        coordinatorNote1: coordinatorNote1.trim() || undefined,
        coordinatorNote2: coordinatorNote2.trim() || undefined,
        ...(subTasksDirty ? { subTasks } : {})
      };

      await updateTask(task.id, updates);
      toast.success(t('taskUpdatedSuccess') || 'Task updated successfully!');
      onTaskUpdated?.({ ...(liveTask || task), ...updates } as Task);
      onClose();
    } catch (err: any) {
      console.error('Error updating task in detail:', err);
      setFormError(err.message || 'Failed to update task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 my-0 sm:my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">
                {t('editTaskDetails') || 'Edit Task Details'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Live Mission Control • Task #{task.id.slice(-6)}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {openedStatus !== 'completed' && liveStatus === 'completed' && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200 animate-in fade-in">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              <span>This task was just completed while open. Close and reopen before editing to avoid stale updates.</span>
            </div>
          )}

          {formError && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100 animate-in fade-in">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Task Type Switch: Student vs Non-Student */}
          <div className="bg-slate-50 p-1.5 rounded-2xl flex border border-slate-200/80">
            <button
              type="button"
              onClick={() => setIsNonStudent(false)}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2",
                !isNonStudent 
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <User size={14} className={!isNonStudent ? "text-red-600" : ""} />
              <span>Student Logistics Task</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNonStudent(true)}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2",
                isNonStudent 
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Building2 size={14} className={isNonStudent ? "text-red-600" : ""} />
              <span>General / Non-Student Task</span>
            </button>
          </div>

          {/* 2. Beneficiary Section */}
          {!isNonStudent ? (
            <div className="space-y-3 p-4 bg-slate-50/60 rounded-2xl border border-slate-200/70">
              <label className="block text-xs font-bold text-slate-700">
                Assigned Student <span className="text-red-500">*</span>
              </label>

              {/* Searchable Student Select */}
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student by name, passport, or university..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>
                <select
                  value={studentId}
                  onChange={e => handleStudentSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs font-medium"
                >
                  <option value="">-- Choose Student --</option>
                  {filteredStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.passportNumber}) - {s.university || 'University not set'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Student Email for CSAT */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Student Email (for CSAT Feedback & Notifications)
                </label>
                <input
                  type="email"
                  value={studentEmail}
                  onChange={e => setStudentEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-slate-50/60 rounded-2xl border border-slate-200/70">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Task Title / Beneficiary Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nonStudentTitle}
                  onChange={e => setNonStudentTitle(e.target.value)}
                  placeholder="e.g. VIP Corporate Delegation Transfer, Office Supplies..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Beneficiary Contact Phone
                </label>
                <input
                  type="text"
                  value={nonStudentContact}
                  onChange={e => setNonStudentContact(e.target.value)}
                  placeholder="+60 12-345 6789"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
                />
              </div>
            </div>
          )}

          {/* 3. Preset / Service Title Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Service Preset / Type
              </label>
              <select
                value={selectedPresetId}
                onChange={e => setSelectedPresetId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              >
                <option value="custom">Custom Service / Custom Title</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.nameEn} ({p.nameAr})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Title (English)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="Custom English title override"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Title (Arabic)
              </label>
              <input
                type="text"
                value={customTitleAr}
                onChange={e => setCustomTitleAr(e.target.value)}
                placeholder="عنوان مخصص باللغة العربية"
                dir="rtl"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs font-sans text-right"
              />
            </div>
          </div>

          {/* 4. Assignment, Vehicle & Operational Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Field Officer <span className="text-red-500">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              >
                <option value="">-- Choose Officer --</option>
                {fieldOfficers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Assigned Vehicle
              </label>
              <select
                value={vehicleId}
                onChange={e => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              >
                <option value="">-- None / Unassigned --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Task Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs font-bold"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* 5. Schedule & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Scheduled Date
              </label>
              <input
                type="date"
                value={taskDate}
                onChange={e => setTaskDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Scheduled Time
              </label>
              <input
                type="time"
                value={taskTime}
                onChange={e => setTaskTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Hotel / Location
              </label>
              <input
                type="text"
                value={hotel}
                onChange={e => setHotel(e.target.value)}
                placeholder="Hotel name or meeting point"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Flight No.
              </label>
              <input
                type="text"
                value={flightNumber}
                onChange={e => setFlightNumber(e.target.value)}
                placeholder={(!isNonStudent && students.find(s => s.id === studentId)?.flightDetails?.flightNumber) || "e.g., QR 844"}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
              />
            </div>
          </div>

          {/* 6. Notes & Coordinator Directives */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  {t('logisticReport') || 'Logistic Report'} / Operational Notes
                  {status === 'completed' && openedStatus !== 'completed' && (
                    <span className="text-red-600 ml-1">*</span>
                  )}
                </label>
                {status === 'completed' && openedStatus !== 'completed' && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                    hasValidLogisticReport(notes)
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  )}>
                    {hasValidLogisticReport(notes) ? (t('logisticReportReady') || 'Filled') : (t('logisticReportRequired') || 'Compulsory')}
                  </span>
                )}
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder={status === 'completed' ? 'Compulsory: Enter closing Logistic Report before saving as completed...' : 'Closing Logistic Report / field officer report notes...'}
                className={cn(
                  "w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs",
                  status === 'completed' && openedStatus !== 'completed' && !hasValidLogisticReport(notes)
                    ? "border-amber-300"
                    : "border-slate-300"
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Coordinator Directive 1
                </label>
                <input
                  type="text"
                  value={coordinatorNote1}
                  onChange={e => setCoordinatorNote1(e.target.value)}
                  placeholder="e.g. Ensure SIM card has 20GB data active"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Coordinator Directive 2
                </label>
                <input
                  type="text"
                  value={coordinatorNote2}
                  onChange={e => setCoordinatorNote2(e.target.value)}
                  placeholder="e.g. Confirm passport returned to student safely"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* 7. Milestones & Subtasks Editor */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                  {t('milestonesAndSubtasks') || 'Milestones & Subtasks'} ({subTasks.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Manage the sequence of required operational checkpoints.
                </p>
              </div>
            </div>

            {/* Existing Subtasks List */}
            <div className="space-y-2">
              {subTasks.map((st, idx) => (
                <div 
                  key={st.id || idx}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggleSubTaskCompleted(idx)}
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer border",
                        st.isCompleted 
                          ? "bg-emerald-600 text-white border-emerald-600" 
                          : "bg-white text-transparent border-slate-300 hover:border-slate-400"
                      )}
                      title={st.isCompleted ? "Mark incomplete" : "Mark completed"}
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={st.titleEn}
                        onChange={e => handleSubTaskTitleChange(idx, 'en', e.target.value)}
                        placeholder="Milestone Title (English)"
                        className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-red-600 focus:outline-none transition-colors"
                      />
                      <input
                        type="text"
                        value={st.titleAr || ''}
                        onChange={e => handleSubTaskTitleChange(idx, 'ar', e.target.value)}
                        placeholder="عنوان المرحلة (عربي)"
                        dir="rtl"
                        className="w-full text-[11px] text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-red-600 focus:outline-none transition-colors text-right"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleProof(idx)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border",
                        st.requiresProof 
                          ? "bg-red-50 text-red-700 border-red-200" 
                          : "bg-white text-slate-400 border-slate-200 hover:text-slate-700"
                      )}
                      title="Toggle mandatory photo proof requirement"
                    >
                      <Camera size={11} />
                      <span>{st.requiresProof ? 'Proof Required' : 'No Proof'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveSubTask(idx)}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title="Remove milestone"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Subtask Inline Card */}
            <div className="p-3.5 bg-slate-100/70 rounded-2xl border border-dashed border-slate-300 space-y-2.5">
              <span className="text-xs font-bold text-slate-700 block">
                {t('addSubtask') || 'Add New Milestone'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newSubTaskEn}
                  onChange={e => setNewSubTaskEn(e.target.value)}
                  placeholder="New milestone title (English)"
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
                <input
                  type="text"
                  value={newSubTaskAr}
                  onChange={e => setNewSubTaskAr(e.target.value)}
                  placeholder="عنوان المرحلة الجديدة (عربي)"
                  dir="rtl"
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-right"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={newSubTaskProof}
                    onChange={e => setNewSubTaskProof(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-600 border-slate-300"
                  />
                  <span>Require mandatory photo proof</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddSubTask}
                  disabled={!newSubTaskEn.trim()}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Milestone</span>
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Sticky Footer with Delete & Save actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between sticky bottom-0 z-10 shrink-0">
          {onRequestDelete && currentUser?.role === 'admin' ? (
            <button
              type="button"
              onClick={() => onRequestDelete(task)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 active:scale-95 rounded-xl transition-colors cursor-pointer border border-red-200"
            >
              <Trash2 size={14} />
              <span>{t('deleteTask') || 'Delete Task'}</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
