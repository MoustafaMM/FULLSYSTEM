import React, { useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  Hotel, 
  Car, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  User, 
  Phone, 
  FileText, 
  MessageSquare, 
  Star, 
  Sparkles, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Camera,
  Plane,
  Tag,
  PhoneCall
} from 'lucide-react';
import { Task } from '../types';
import { useAppContext } from '../context/AppContext';
import { format } from 'date-fns';
import { getTaskSlaInfo } from '../utils/taskTiming';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import { getTaskAllProofs, getTaskStepMetrics } from '../utils/taskSteps';
import { QC_GRADES, getQCErrorTagLabel, getQCGradeLabel } from '../utils/qualityControl';
import QCReviewModal from './QCReviewModal';
import { cn } from './layout/Layout';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  hasPresetTemplate,
  isLegacyCopiedNonStudentCustomTitle,
  normalizeTaskStatus
} from '../utils/taskClassification';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onOpenLightbox?: (url: string, caption?: string, timestamp?: string, location?: string) => void;
  onViewStudentDossier?: (studentId: string) => void;
}

export default function TaskDetailModal({
  isOpen,
  onClose,
  task,
  onOpenLightbox,
  onViewStudentDossier
}: TaskDetailModalProps) {
  const { students, presets, users, vehicles, currentUser, qcReviews, t, language } = useAppContext();
  const [isQCModalOpen, setIsQCModalOpen] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;

  const isAdminQC = currentUser?.role === 'admin';
  const taskQCReview = isAdminQC ? qcReviews.find(r => r.taskId === task.id || r.id === task.id) : undefined;

  const isNonStudent = !!task.isNonStudentTask;
  const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
  const student = !isNonStudent && task.studentId ? students.find(s => s.id === task.studentId) : undefined;
  const assignee = users.find(u => u.id === task.assigneeId);
  const vehicle = vehicles.find(v => v.id === task.vehicleId);
  const slaInfo = getTaskSlaInfo(task);
  const taskCategory = getTaskCategory(task);
  const categoryLabel =
    taskCategory === 'non_student'
      ? (t('nonStudentCategory') || 'Non-Student')
      : taskCategory === 'student_custom'
        ? (t('studentCustomCategory') || 'Student Custom')
        : (t('studentPresetCategory') || 'Student SOP');

  // Use normalized steps and proofs
  const { steps: displaySteps, total: totalSteps, completed: completedSteps, percentage: progress } = getTaskStepMetrics(task);
  const allProofMedia = getTaskAllProofs(task);

  const taskTitle = getTaskDisplayTitle(task, presets, language);
  const serviceLabel = getTaskServiceLabel(task, presets, language);
  const showSecondaryArabicTitle = Boolean(
    task.customTitleAr &&
    language !== 'ar' &&
    !isLegacyCopiedNonStudentCustomTitle(task) &&
    task.customTitleAr.trim() !== taskTitle.trim()
  );

  const rawWhatsappDigits = (isNonStudent ? task.nonStudentContact : student?.contactInfo)?.replace(/[^0-9]/g, '');
  const studentWhatsappUrl = rawWhatsappDigits && rawWhatsappDigits.length >= 7
    ? `https://wa.me/${rawWhatsappDigits.startsWith('01') ? `6${rawWhatsappDigits}` : rawWhatsappDigits.startsWith('00') ? rawWhatsappDigits.slice(2) : rawWhatsappDigits}`
    : undefined;

  return (
    <>
    <div 
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative bg-white max-w-3xl w-full rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden my-0 sm:my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-400/30">
                {serviceLabel}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-slate-200 border border-white/15">
                {categoryLabel}
              </span>
              {(() => {
                const effectiveStatus = normalizeTaskStatus(task);
                return (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${getTaskStatusBadgeClasses(effectiveStatus, 'dark')}`}>
                    {t(effectiveStatus) || effectiveStatus.replace('_', ' ')}
                  </span>
                );
              })()}
              {slaInfo.text && (
                <span className="text-xs text-slate-300 font-medium">
                  • {slaInfo.text}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
              {taskTitle}
            </h2>
            {showSecondaryArabicTitle && (
              <p className="text-xs text-slate-400 font-arabic mt-0.5" dir="rtl">{task.customTitleAr}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 bg-slate-50/50">
          
          {/* Non-Student Beneficiary Banner */}
          {isNonStudent && !student && (
            <div className="bg-white rounded-2xl border border-purple-200 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 font-black text-xl flex items-center justify-center shrink-0 border border-purple-200">
                  {task.nonStudentTitle ? task.nonStudentTitle.charAt(0).toUpperCase() : <User size={20} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 text-base truncate">{task.nonStudentTitle || 'Non-Student Beneficiary'}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                      {t('nonStudentCategory') || 'Non-Student'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {task.nonStudentContact || 'General operational beneficiary'}
                    {preset ? ` • SOP: ${language === 'ar' ? (preset.nameAr || preset.nameEn) : preset.nameEn}` : ''}
                  </p>
                </div>
              </div>

              {studentWhatsappUrl && (
                <a
                  href={studentWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-colors shrink-0"
                  title="Open WhatsApp chat with beneficiary"
                >
                  <Phone size={13} className="text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          )}

          {/* Linked Student Card Banner */}
          {student && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 font-black text-xl flex items-center justify-center shrink-0 border border-red-200">
                    {student.fullName ? student.fullName.charAt(0).toUpperCase() : <User size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">{student.fullName}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                        {student.package || (student as any).servicePackage || 'Free'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap mt-0.5">
                      <span>{student.university}</span>
                      <span>•</span>
                      <span className="font-mono font-medium">{student.passportNumber}</span>
                      {student.nationality && (
                        <>
                          <span>•</span>
                          <span>{student.nationality}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {studentWhatsappUrl && (
                    <a
                      href={studentWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-colors"
                      title="Open WhatsApp chat with student"
                    >
                      <Phone size={13} className="text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {onViewStudentDossier && (
                    <button
                      type="button"
                      onClick={() => onViewStudentDossier(student.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      <FileText size={14} className="text-slate-500" />
                      <span>{t('dossierQuickView') || 'View Dossier'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Extra Flight & Accommodation Meta if available */}
              {(student.flightDetails || student.accommodationDetails) && (
                <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {student.flightDetails && (
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2">
                      <Plane size={14} className="text-blue-500 shrink-0" />
                      <span className="truncate">
                        <strong>Flight:</strong> {student.flightDetails.airline || ''} {student.flightDetails.flightNumber || ''} 
                        {student.flightDetails.terminal ? ` (Term. ${student.flightDetails.terminal})` : ''}
                      </span>
                    </div>
                  )}
                  {student.accommodationDetails && (
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-2">
                      <Hotel size={14} className="text-indigo-500 shrink-0" />
                      <span className="truncate">
                        <strong>Hotel:</strong> {student.accommodationDetails.hotelName || 'Pending'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Logistics Operations Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Schedule Date</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Calendar size={14} className="text-purple-600 shrink-0" />
                <span>{task.taskDate ? formatDateDDMMYYYY(task.taskDate) : 'Unscheduled'}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Schedule Time</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Clock size={14} className="text-blue-600 shrink-0" />
                <span>{task.taskTime || 'Pending'}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Field Officer</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 truncate" title={assignee?.name || 'Unassigned'}>
                <User size={14} className="text-emerald-600 shrink-0" />
                <span className="truncate">{assignee?.name || 'Unassigned'}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Assigned Vehicle</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 truncate" title={vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : 'None'}>
                <Car size={14} className="text-amber-600 shrink-0" />
                <span className="truncate">{vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : 'No Vehicle'}</span>
              </div>
            </div>
          </div>

          {/* Location & Hotel Details if available */}
          {task.hotel && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
                <Hotel size={18} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Hotel / Location</span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">{task.hotel}</span>
              </div>
            </div>
          )}

          {/* Subtasks Execution Checklist */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-purple-600" />
                  <span>SOP Subtasks Execution Checklist</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Step-by-step verified workflow milestones ({completedSteps} of {totalSteps} completed)
                </p>
              </div>
              <span className="text-xs font-extrabold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                {progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Checklist Items */}
            <div className="space-y-3 pt-1">
              {displaySteps.map((st) => (
                <div 
                  key={st.id} 
                  className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
                    st.isCompleted 
                      ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950' 
                      : st.isSkipped 
                      ? 'bg-red-50/40 border-red-200/80 text-red-950'
                      : 'bg-slate-50/70 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {st.isCompleted ? (
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      ) : st.isSkipped ? (
                        <X size={18} className="text-red-500 shrink-0" />
                      ) : (
                        <Circle size={18} className="text-slate-300 shrink-0" />
                      )}
                      
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={`text-xs sm:text-sm font-bold ${
                          st.isCompleted ? 'text-slate-800' : st.isSkipped ? 'line-through text-red-600' : 'text-slate-600'
                        }`}>
                          {language === 'ar' && st.titleAr ? st.titleAr : st.titleEn}
                        </span>

                        {st.isCommunicationStep && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                            {isNonStudent ? 'Beneficiary Contact' : 'Student Contact'}
                          </span>
                        )}

                        {st.requiresProof && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                            Proof Req
                          </span>
                        )}

                        {st.media && st.media.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            {st.media.length} {st.media.length === 1 ? 'Photo Attached' : 'Photos Attached'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs pl-7 sm:pl-0">
                      {st.completedAt && (
                        <span className="text-slate-400 font-medium">
                          {format(new Date(st.completedAt), 'HH:mm • MMM dd')}
                        </span>
                      )}

                      {st.media && st.media.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox?.(
                            st.media[0].url, 
                            st.titleEn, 
                            st.media[0].timestamp, 
                            st.media[0].location
                          )}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-800 bg-white px-2.5 py-1 rounded-lg border border-purple-200 shadow-2xs cursor-pointer"
                        >
                          <Camera size={13} />
                          <span>View Proof ({st.media.length})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step Photo Thumbnails Strip if photos exist */}
                  {st.media && st.media.length > 0 && (
                    <div className="flex items-center gap-2 pl-7 pt-1 overflow-x-auto">
                      {st.media.map((m, mIdx) => (
                        <div
                          key={mIdx}
                          onClick={() => onOpenLightbox?.(m.url, `${st.titleEn} (${student?.fullName || task.nonStudentTitle || 'Beneficiary'})`, m.timestamp, m.location)}
                          className="group relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 cursor-pointer shrink-0 hover:border-purple-400 shadow-2xs transition-all"
                          title="Click to view full photo"
                        >
                          <img src={m.url} alt="Step proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera size={14} className="text-white" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Photo Proof Gallery Strip */}
          {allProofMedia.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Camera size={16} className="text-purple-600" />
                  <span>Field Verification Photos ({allProofMedia.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">Click to expand high-res</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {allProofMedia.map((m, i) => (
                  <div 
                    key={i}
                    onClick={() => onOpenLightbox?.(m.url, m.caption, m.timestamp, m.location)}
                    className="group relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:shadow-md transition-all"
                  >
                    <img src={m.url} alt={m.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 p-2 flex flex-col justify-end text-white">
                      <span className="text-[10px] font-bold truncate">{m.caption}</span>
                      {m.timestamp && (
                        <span className="text-[9px] text-slate-300">
                          {format(new Date(m.timestamp), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coordinator Instructions Callouts */}
          {(task.coordinatorNote1 || task.coordinatorNote2) && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                Coordinator Instructions
              </span>
              {task.coordinatorNote1 && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-blue-800">Primary Instruction:</span>
                    <p className="mt-0.5 leading-relaxed">{task.coordinatorNote1}</p>
                  </div>
                </div>
              )}
              {task.coordinatorNote2 && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-amber-800">Secondary Note:</span>
                    <p className="mt-0.5 leading-relaxed">{task.coordinatorNote2}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Field Officer Closing Report */}
          {task.notes && (() => {
            const reportTimestamp = task.notesUpdatedAt || (task.status === 'completed' ? task.completedAt : undefined);
            const formattedReportTime = (() => {
              if (!reportTimestamp) return null;
              try {
                const d = new Date(reportTimestamp);
                if (Number.isNaN(d.getTime())) return null;
                return format(d, 'MMM dd, yyyy • HH:mm');
              } catch {
                return null;
              }
            })();

            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-red-600 shrink-0" />
                    <span>{t('logisticReport') || 'Field Officer Report & Notes'}</span>
                  </span>
                  {formattedReportTime && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/80">
                      <Clock size={11} className="text-slate-400 shrink-0" />
                      <span>{formattedReportTime}</span>
                    </span>
                  )}
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">
                    {task.notes}
                  </p>
                  {formattedReportTime && (
                    <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                      <Clock size={12} className="text-slate-400 shrink-0" />
                      <span>
                        {t('reportWritten') || 'Report written'}: {formattedReportTime}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Student CSAT / Feedback Section */}
          {task.feedbackSubmitted && task.feedback && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <Star size={18} className="fill-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-emerald-950 text-sm">Student CSAT Feedback Received</h4>
                    <span className="text-xs text-emerald-700 font-medium">Submitted directly by student</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-emerald-200 shadow-2xs">
                  <Star size={15} className="text-amber-400 fill-amber-400" />
                  <span className="text-sm font-black text-slate-900">{task.feedback.rating} / 5</span>
                </div>
              </div>

              {(task.feedback.comments || (task.feedback as any).comment) && (
                <div className="bg-white p-3 rounded-xl border border-emerald-100 text-xs sm:text-sm text-slate-700 italic">
                  "{task.feedback.comments || (task.feedback as any).comment}"
                </div>
              )}
            </div>
          )}

          {/* Strictly Admin-Only Quality Control Report Section */}
          {isAdminQC && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-red-600" />
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{t('qcReport')}</h4>
                    <span className="text-[11px] text-slate-400">{t('qcAdminOnlyNotice')}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQCModalOpen(true)}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  {taskQCReview ? (language === 'ar' ? 'تعديل تقرير الجودة' : 'Edit QC Report') : (language === 'ar' ? 'كتابة تقرير جودة' : 'Write QC Report')}
                </button>
              </div>

              {taskQCReview ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border', QC_GRADES[taskQCReview.grade].badgeClasses)}>
                      <span className={cn('w-2 h-2 rounded-full', QC_GRADES[taskQCReview.grade].dotClass)} />
                      <span>{getQCGradeLabel(taskQCReview.grade, language)}</span>
                    </span>
                    {taskQCReview.needsUrgentCall && (
                      <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold', taskQCReview.urgentCallResolved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-600 text-white')}>
                        <PhoneCall size={11} />
                        <span>{taskQCReview.urgentCallResolved ? t('qcUrgentCallResolved') : (language === 'ar' ? 'مطلوب اتصال ضروري' : 'Urgent Call Needed')}</span>
                      </span>
                    )}
                  </div>

                  {((taskQCReview.errorTags?.length || 0) > 0 || (taskQCReview.customTags?.length || 0) > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {(taskQCReview.errorTags || []).map(tagId => (
                        <span key={tagId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                          <Tag size={10} />
                          <span>{getQCErrorTagLabel(tagId, language)}</span>
                        </span>
                      ))}
                      {(taskQCReview.customTags || []).map(ct => (
                        <span key={ct} className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
                          #{ct}
                        </span>
                      ))}
                    </div>
                  )}

                  {taskQCReview.comment && (
                    <p className="text-xs sm:text-sm text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">
                      {taskQCReview.comment}
                    </p>
                  )}

                  {taskQCReview.evidenceMedia && taskQCReview.evidenceMedia.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {taskQCReview.evidenceMedia.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onOpenLightbox?.(m.url, m.caption || m.name || 'QC Evidence', m.uploadedAt)}
                          className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 hover:border-purple-400 cursor-pointer"
                          title={m.caption || 'QC Screenshot'}
                        >
                          <img src={m.url} alt={m.caption || 'QC Evidence'} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {language === 'ar' ? 'لم يتم إضافة تقرير كواليتي كنترول لهذه المهمة بعد.' : 'No Quality Control review logged for this task yet.'}
                </p>
              )}
            </div>
          )}

        </div>

        {/* Modal Bottom Close Bar */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            Close Audit View
          </button>
        </div>
      </div>
    </div>

    {isAdminQC && isQCModalOpen && (
      <QCReviewModal
        isOpen={isQCModalOpen}
        onClose={() => setIsQCModalOpen(false)}
        task={task}
        existingReview={taskQCReview || null}
      />
    )}
  </>
  );
}
