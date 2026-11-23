import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Student } from '../types';
import { X, Calendar, Clock, Send, Sparkles, FileText, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface RequestTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedStudentId?: string;
  counselorStudents?: Student[];
}

export default function RequestTaskModal({
  isOpen,
  onClose,
  preSelectedStudentId,
  counselorStudents
}: RequestTaskModalProps) {
  const { students, presets, currentUser, createTaskRequest, language } = useAppContext();

  const [studentId, setStudentId] = useState(preSelectedStudentId || '');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available students for counselor
  const availableStudents = counselorStudents && counselorStudents.length > 0 
    ? counselorStudents 
    : (currentUser?.role === 'counselor' 
        ? students.filter(s => s.counselorId === currentUser.id || s.counselor === currentUser.id)
        : students);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPresetId('');
      setCustomTitle('');
      setRequestedDate('');
      setRequestedTime('');
      setNotes('');
      setError(null);
      setIsSubmitting(false);
      return;
    }

    setError(null);
    if (preSelectedStudentId) {
      setStudentId(preSelectedStudentId);
    } else if (availableStudents.length > 0 && !studentId) {
      setStudentId(availableStudents[0].id);
    }
  }, [isOpen, preSelectedStudentId, availableStudents.length]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!studentId) {
      setError('Please select a student for this request.');
      return;
    }

    if (!selectedPresetId) {
      setError('Please choose a task type or custom request.');
      return;
    }

    if (selectedPresetId === 'custom' && !customTitle.trim()) {
      setError('Please enter a custom task description.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createTaskRequest({
        counselorId: currentUser?.id || 'counselor',
        counselorName: currentUser?.name || 'Academic Counselor',
        studentId,
        presetId: selectedPresetId === 'custom' ? undefined : selectedPresetId,
        customTitle: selectedPresetId === 'custom' ? customTitle.trim() : undefined,
        requestedDate: requestedDate || undefined,
        requestedTime: requestedTime || undefined,
        notes: notes.trim() || undefined
      });

      toast.success('Task request submitted to Operations Coordinator!');
      onClose();
      // Reset form
      setSelectedPresetId('');
      setCustomTitle('');
      setRequestedDate('');
      setRequestedTime('');
      setNotes('');
    } catch (err: any) {
      console.error('Error submitting task request:', err);
      setError(err.message || 'Failed to submit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div 
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Request Task from Coordinator</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit a field logistics service request for your assigned student
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 bg-white">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200 font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Student Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Student <span className="text-red-500">*</span>
            </label>
            <select
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white font-medium"
              required
            >
              <option value="">-- Choose Student --</option>
              {availableStudents.map(std => (
                <option key={std.id} value={std.id}>
                  {std.fullName} ({std.university || std.passportNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Task Type / Preset */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Requested Service / Task Type <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPresetId}
              onChange={e => setSelectedPresetId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white font-medium"
              required
            >
              <option value="">-- Choose Service Milestone --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {language === 'ar' ? (p.nameAr || p.nameEn) : p.nameEn}
                </option>
              ))}
              <option value="custom" className="font-bold text-purple-700">
                ✨ Custom Service Request
              </option>
            </select>
          </div>

          {/* Custom Task Description if selected */}
          {selectedPresetId === 'custom' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Service Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="e.g., Campus Tour, Document Collection, Medical Escort"
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white"
                required
              />
            </div>
          )}

          {/* Preferred Schedule: Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preferred Date
              </label>
              <input
                type="date"
                value={requestedDate}
                onChange={e => setRequestedDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preferred Time
              </label>
              <input
                type="time"
                value={requestedTime}
                onChange={e => setRequestedTime(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 bg-white font-medium"
              />
            </div>
          </div>

          {/* Notes for Coordinator */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Operational Notes & Context for Coordinator
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g., Student flight arrives 3pm at KLIA1, baggage includes 2 large suitcases. Needs university check-in."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 resize-none transition-all"
            />
          </div>

          {/* Footer Actions */}
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
              className="px-5 py-2.5 text-xs font-extrabold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}