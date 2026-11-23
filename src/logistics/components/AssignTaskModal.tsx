import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  X, 
  Sparkles, 
  Plus, 
  Trash2, 
  User, 
  Car, 
  Calendar, 
  Clock, 
  Building2, 
  CheckCircle2, 
  Phone, 
  FileText,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface AssignTaskInitialData {
  studentId?: string;
  isNonStudentTask?: boolean;
  nonStudentTitle?: string;
  nonStudentContact?: string;
  presetId?: string;
  customTitle?: string;
  customTitleAr?: string;
  taskDate?: string;
  taskTime?: string;
  notes?: string;
  hotel?: string;
  vehicleId?: string;
  assigneeId?: string;
  requestId?: string;
}

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: AssignTaskInitialData;
  onTaskCreated?: (taskId: string) => void;
}

export default function AssignTaskModal({
  isOpen,
  onClose,
  initialData,
  onTaskCreated
}: AssignTaskModalProps) {
  const { 
    t, 
    students, 
    presets, 
    users, 
    vehicles, 
    assignTask, 
    updateTaskRequestStatus, 
    language 
  } = useAppContext();

  const [isNonStudent, setIsNonStudent] = useState(initialData?.isNonStudentTask || false);
  const [selectedStudentId, setSelectedStudentId] = useState(initialData?.studentId || '');
  const [nonStudentTitle, setNonStudentTitle] = useState(initialData?.nonStudentTitle || '');
  const [nonStudentContact, setNonStudentContact] = useState(initialData?.nonStudentContact || '');
  
  const [selectedPresetId, setSelectedPresetId] = useState(initialData?.presetId || '');
  const [customTitle, setCustomTitle] = useState(initialData?.customTitle || '');
  const [customTitleAr, setCustomTitleAr] = useState(initialData?.customTitleAr || '');
  const [customSubTasks, setCustomSubTasks] = useState<{ titleEn: string; titleAr: string; requiresProof?: boolean }[]>([]);
  
  const [newSubTaskEn, setNewSubTaskEn] = useState('');
  const [newSubTaskAr, setNewSubTaskAr] = useState('');
  const [newSubTaskProof, setNewSubTaskProof] = useState(false);

  const [assigneeId, setAssigneeId] = useState(initialData?.assigneeId || '');
  const [vehicleId, setVehicleId] = useState(initialData?.vehicleId || '');
  const [taskDate, setTaskDate] = useState(initialData?.taskDate || '');
  const [taskTime, setTaskTime] = useState(initialData?.taskTime || '');
  const [hotel, setHotel] = useState(initialData?.hotel || '');
  const [flightNumber, setFlightNumber] = useState('');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fieldOfficers = users.filter(u => u.role === 'field_officer');

  // Synchronize when modal opens/closes or initialData changes
  useEffect(() => {
    setFormError(null);
    setIsSubmitting(false);
    setCustomSubTasks([]);
    setNewSubTaskEn('');
    setNewSubTaskAr('');
    setNewSubTaskProof(false);
    setFlightNumber('');

    if (initialData) {
      setIsNonStudent(Boolean(initialData.isNonStudentTask));
      setSelectedStudentId(initialData.studentId || '');
      setNonStudentTitle(initialData.nonStudentTitle || '');
      setNonStudentContact(initialData.nonStudentContact || '');
      setSelectedPresetId(initialData.presetId || '');
      setCustomTitle(initialData.customTitle || '');
      setCustomTitleAr(initialData.customTitleAr || '');
      setTaskDate(initialData.taskDate || '');
      setTaskTime(initialData.taskTime || '');
      setNotes(initialData.notes || '');
      setHotel(initialData.hotel || '');
      setVehicleId(initialData.vehicleId || '');
      setAssigneeId(initialData.assigneeId || '');
    } else {
      setIsNonStudent(false);
      setSelectedStudentId('');
      setNonStudentTitle('');
      setNonStudentContact('');
      setSelectedPresetId('');
      setCustomTitle('');
      setCustomTitleAr('');
      setTaskDate('');
      setTaskTime('');
      setNotes('');
      setHotel('');
      setVehicleId('');
      setAssigneeId('');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddCustomSubTask = () => {
    if (!newSubTaskEn.trim()) return;
    setCustomSubTasks(prev => [
      ...prev,
      {
        titleEn: newSubTaskEn.trim(),
        titleAr: newSubTaskAr.trim() || newSubTaskEn.trim(),
        requiresProof: newSubTaskProof
      }
    ]);
    setNewSubTaskEn('');
    setNewSubTaskAr('');
    setNewSubTaskProof(false);
  };

  const handleRemoveCustomSubTask = (idx: number) => {
    setCustomSubTasks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isNonStudent && !selectedStudentId) {
      setFormError('Please select a student for this task.');
      return;
    }

    if (isNonStudent && !nonStudentTitle.trim()) {
      setFormError('Please enter a Task Title / Beneficiary Name.');
      return;
    }

    if (!selectedPresetId) {
      setFormError('Please select a Task Preset or Custom Task.');
      return;
    }

    if (selectedPresetId === 'custom' && !customTitle.trim()) {
      setFormError('Please enter a custom task title.');
      return;
    }

    if (!assigneeId) {
      setFormError('Please assign a Field Operations Officer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const preset = presets.find(p => p.id === selectedPresetId);
      const isCustom = selectedPresetId === 'custom';

      let subTasksToUse: any[] = [];
      if (isCustom) {
        if (customSubTasks.length > 0) {
          subTasksToUse = customSubTasks.map((st, i) => ({
            id: `st-${Date.now()}-${i}`,
            titleEn: st.titleEn,
            titleAr: st.titleAr || st.titleEn,
            isCompleted: false,
            requiresProof: !!st.requiresProof
          }));
        } else {
          subTasksToUse = [
            {
              id: `st-${Date.now()}-1`,
              titleEn: 'Execute Service Milestone',
              titleAr: 'تنفيذ مرحلة الخدمة',
              isCompleted: false,
              requiresProof: true
            }
          ];
        }
      } else if (preset) {
        subTasksToUse = preset.defaultSubTasks.map((st, i) => ({
          id: `st-${Date.now()}-${i}`,
          titleEn: st.titleEn,
          titleAr: st.titleAr || st.titleEn,
          isCompleted: false,
          requiresProof: !!st.requiresProof
        }));
      }

      // Resolve student email for CSAT feedback if it's a student task
      const targetStudent = !isNonStudent ? students.find(s => s.id === selectedStudentId) : undefined;

      const createdTaskId = await assignTask({
        studentId: isNonStudent ? undefined : selectedStudentId,
        isNonStudentTask: isNonStudent,
        nonStudentTitle: isNonStudent ? nonStudentTitle.trim() : undefined,
        nonStudentContact: isNonStudent && nonStudentContact.trim() ? nonStudentContact.trim() : undefined,
        presetId: isCustom ? undefined : selectedPresetId,
        customTitle: isCustom ? customTitle.trim() : undefined,
        customTitleAr: isCustom && customTitleAr.trim() ? customTitleAr.trim() : undefined,
        assigneeId,
        vehicleId: vehicleId || undefined,
        status: 'pending',
        taskDate: taskDate || undefined,
        taskTime: taskTime || undefined,
        hotel: hotel.trim() || undefined,
        flightNumber: flightNumber.trim() || targetStudent?.flightDetails?.flightNumber || undefined,
        coordinatorNote1: notes.trim() || undefined,
        studentEmail: !isNonStudent ? (targetStudent?.email || undefined) : undefined,
        subTasks: subTasksToUse
      });

      // If approved from counselor request, update status in Firestore
      if (initialData?.requestId) {
        await updateTaskRequestStatus(initialData.requestId, 'approved', { assignedTaskId: createdTaskId });
      }

      toast.success(isNonStudent ? 'Non-student task dispatched!' : 'Task assigned successfully!');
      onTaskCreated?.(createdTaskId);
      onClose();
    } catch (err: any) {
      console.error('Error assigning task:', err);
      setFormError(err.message || 'Failed to dispatch task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div 
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 my-0 sm:my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {initialData?.requestId ? 'Approve & Dispatch Task' : 'Assign / Create New Task'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {initialData?.requestId 
                ? 'Review counselor request, select officer & vehicle to dispatch'
                : 'Schedule an on-ground logistics mission for student or general operational request'}
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 bg-white">
          {formError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200 font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. TASK BENEFICIARY TOGGLE: Student Task vs Non-Student Task */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Task Classification <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setIsNonStudent(false)}
                className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  !isNonStudent 
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🎓 Student Task</span>
              </button>
              <button
                type="button"
                onClick={() => setIsNonStudent(true)}
                className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  isNonStudent 
                    ? 'bg-purple-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📦 Non-Student / General</span>
              </button>
            </div>
          </div>

          {/* 2. BENEFICIARY DETAILS */}
          {!isNonStudent ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Linked Student <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
              >
                <option value="">-- Choose Student --</option>
                {students.map(std => (
                  <option key={std.id} value={std.id}>
                    {std.fullName} ({std.university || std.passportNumber || 'Student'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 uppercase tracking-wider">
                <FileText size={14} className="text-purple-600" />
                <span>General Task / Beneficiary Info</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Task Title / Beneficiary Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nonStudentTitle}
                  onChange={e => setNonStudentTitle(e.target.value)}
                  placeholder="e.g., Office Document Delivery, VIP Guest Pickup, Embassy Run"
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white"
                  required={isNonStudent}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Person / Phone (Optional)
                </label>
                <input
                  type="text"
                  value={nonStudentContact}
                  onChange={e => setNonStudentContact(e.target.value)}
                  placeholder="e.g., Mr. Ahmad (+60 12-345 6789) or contact@office.com"
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white"
                />
              </div>
            </div>
          )}

          {/* 3. TASK TYPE / SOP PRESET */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Task Preset / SOP Template <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPresetId}
              onChange={e => {
                const nextPreset = e.target.value;
                setSelectedPresetId(nextPreset);
                if (nextPreset !== 'custom') {
                  setCustomTitle('');
                  setCustomTitleAr('');
                  setCustomSubTasks([]);
                  setNewSubTaskEn('');
                  setNewSubTaskAr('');
                  setNewSubTaskProof(false);
                }
              }}
              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
            >
              <option value="">-- Select Preset SOP --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {language === 'ar' ? (p.nameAr || p.nameEn) : p.nameEn}
                </option>
              ))}
              <option value="custom" className="font-bold text-red-600">
                ✨ Custom Task / Custom Subtasks
              </option>
            </select>
          </div>

          {/* Custom Task Fields */}
          {selectedPresetId === 'custom' && (
            <div className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-2xl space-y-3">
              <div className="flex items-center gap-1.5 text-red-800 font-bold text-xs uppercase tracking-wider">
                <Sparkles size={14} className="text-red-600" />
                <span>Custom Task Configuration</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Task Title (English) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  placeholder="e.g., Campus Orientation & Registration"
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Task Title (Arabic - Optional)
                </label>
                <input
                  type="text"
                  value={customTitleAr}
                  onChange={e => setCustomTitleAr(e.target.value)}
                  placeholder="عنوان المهمة بالعربية"
                  dir="rtl"
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-right"
                />
              </div>

              {/* Subtasks Builder */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Milestones / Subtasks ({customSubTasks.length})
                </label>
                {customSubTasks.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {customSubTasks.map((st, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 text-xs">
                        <span className="font-semibold text-slate-800 truncate">{i + 1}. {st.titleEn}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {st.requiresProof && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 font-bold rounded">Proof Required</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomSubTask(i)}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubTaskEn}
                    onChange={e => setNewSubTaskEn(e.target.value)}
                    placeholder="Add step milestone..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 bg-white"
                  />
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white border border-slate-300 px-2 py-1 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSubTaskProof}
                      onChange={e => setNewSubTaskProof(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span>Proof</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddCustomSubTask}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. DISPATCH ASSIGNMENT: Field Officer & Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Assign Field Officer <span className="text-red-500">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
                required
              >
                <option value="">-- Choose Officer --</option>
                {fieldOfficers.map(fo => (
                  <option key={fo.id} value={fo.id}>
                    {fo.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Assign Fleet Vehicle (Optional)
              </label>
              <select
                value={vehicleId}
                onChange={e => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
              >
                <option value="">-- No Vehicle Assigned --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. SCHEDULE: Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Execution Date
              </label>
              <input
                type="date"
                value={taskDate}
                onChange={e => setTaskDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estimated Time
              </label>
              <input
                type="time"
                value={taskTime}
                onChange={e => setTaskTime(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
              />
            </div>
          </div>

          {/* 6. LOCATION / HOTEL, FLIGHT NO & OPERATIONAL NOTES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Destination / Hotel / Drop-off
              </label>
              <input
                type="text"
                value={hotel}
                onChange={e => setHotel(e.target.value)}
                placeholder="e.g., Grand Hyatt KL, KLIA2, EMGS"
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Flight No. (Optional)
              </label>
              <input
                type="text"
                value={flightNumber}
                onChange={e => setFlightNumber(e.target.value)}
                placeholder={(!isNonStudent && students.find(s => s.id === selectedStudentId)?.flightDetails?.flightNumber) || "e.g., QR 844, EK 346"}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Coordinator Instructions & Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Instructions for field officer, student flight details, baggage info..."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-red-600/20 focus:border-red-600 resize-none transition-all"
            />
          </div>

          {/* Modal Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white z-10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Dispatching Task...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>{initialData?.requestId ? 'Approve & Dispatch' : 'Assign Task'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}