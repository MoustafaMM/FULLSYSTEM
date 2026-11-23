import React from 'react';
import { 
  X, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Plane, 
  Hotel, 
  GraduationCap, 
  Calendar, 
  CheckCircle2, 
  ShieldCheck, 
  Copy, 
  ExternalLink,
  Globe,
  BookOpen,
  Sparkles
} from 'lucide-react';
import { cn } from './layout/Layout';
import { Student } from '../types';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

interface StudentDossierModalProps {
  key?: React.Key;
  student: Student | null | undefined;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFullProfile?: (studentId: string) => void;
}

export default function StudentDossierModal({
  student,
  isOpen,
  onClose,
  onNavigateToFullProfile
}: StudentDossierModalProps) {
  const { users, t } = useAppContext();

  if (!isOpen || !student) return null;

  const counselorUser = users.find(u => u.id === student.counselor);
  const counselorName = counselorUser ? counselorUser.name : student.counselor;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusBadge = () => {
    switch (student.status) {
      case 'completed':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Completed
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            In Progress
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Pending
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-0 sm:my-6 relative flex flex-col max-h-[92dvh] sm:max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with High-Contrast Navy Gradient */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 text-white p-5 sm:p-6 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
            title="Close dossier"
          >
            <X size={18} />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <div className="w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center font-bold text-xl shrink-0 shadow-inner">
              {student.fullName ? student.fullName.charAt(0).toUpperCase() : <User size={24} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-red-600/30 text-red-300 border border-red-500/40 rounded-md">
                  Student Dossier
                </span>
                <span className={cn(
                  "text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1",
                  (student.arrivalCategory || (student as any).studentType) === 'Tourism'
                    ? "bg-amber-500/25 text-amber-200 border-amber-500/40"
                    : "bg-blue-500/25 text-blue-200 border-blue-500/40"
                )}>
                  {(student.arrivalCategory || (student as any).studentType) === 'Tourism' ? <Plane size={11} /> : <GraduationCap size={11} />}
                  {(student.arrivalCategory || (student as any).studentType) === 'Tourism' ? 'Tourism Visa' : 'Student Visa'}
                </span>
                {(student.package || (student as any).servicePackage) && (
                  <span className={cn(
                    "text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1",
                    (student.package || (student as any).servicePackage) === '500$' ? "bg-purple-500/25 text-purple-200 border-purple-500/40" :
                    (student.package || (student as any).servicePackage) === '300$' ? "bg-emerald-500/25 text-emerald-200 border-emerald-500/40" :
                    (student.package || (student as any).servicePackage) === '300$(Free)' ? "bg-teal-500/25 text-teal-200 border-teal-500/40" :
                    "bg-slate-500/25 text-slate-200 border-slate-500/40"
                  )}>
                    <Sparkles size={11} />
                    {(student.package || (student as any).servicePackage)} Pkg
                  </span>
                )}
                {getStatusBadge()}
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate" title={student.fullName}>
                {student.fullName}
              </h3>

              <div className="flex items-center gap-2 text-xs text-slate-300 mt-1 font-mono">
                <ShieldCheck size={14} className="text-red-400 shrink-0" />
                <span>Passport: {student.passportNumber}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(student.passportNumber, 'Passport number')}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy passport"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body with Dossier Sections */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/50">
          {/* Demographics & Program Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
                <Globe size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Nationality</span>
                <span className="text-xs font-bold text-slate-900 truncate block">{student.nationality || 'Not specified'}</span>
              </div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl shrink-0">
                <GraduationCap size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Program</span>
                <span className="text-xs font-bold text-slate-900 truncate block">{student.program || 'Not specified'}</span>
              </div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2.5">
              <div className="p-2 bg-purple-50 text-purple-700 rounded-xl shrink-0">
                <Calendar size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Study Intake</span>
                <span className="text-xs font-bold text-slate-900 truncate block">{student.studyIntake || 'Not specified'}</span>
              </div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2.5">
              <div className="p-2 bg-amber-50 text-amber-700 rounded-xl shrink-0">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Package</span>
                <span className="text-xs font-bold text-slate-900 truncate block">{(student.package || (student as any).servicePackage) || 'Free'}</span>
              </div>
            </div>
          </div>

          {/* Quick Contact & University Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* University */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl shrink-0 mt-0.5">
                <GraduationCap size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  University / Campus
                </span>
                <span className="text-sm font-bold text-slate-900 line-clamp-2">
                  {student.university || 'Not specified'}
                </span>
              </div>
            </div>

            {/* Academic Counselor */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
              <div className="p-2 bg-purple-50 text-purple-700 rounded-xl shrink-0 mt-0.5">
                <User size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Academic Counselor
                </span>
                <span className="text-sm font-bold text-slate-900 truncate block">
                  {counselorName || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* Phone / Contact */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl shrink-0 mt-0.5">
                <Phone size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Phone / WhatsApp
                </span>
                {student.contactInfo ? (
                  <div className="flex items-center justify-between gap-1">
                    {(() => {
                      let digits = student.contactInfo.replace(/[^\d+]/g, '');
                      if (digits.startsWith('+')) digits = digits.slice(1);
                      else if (digits.startsWith('00')) digits = digits.slice(2);
                      else if (digits.startsWith('01')) digits = `6${digits}`;
                      const cleanDigits = digits.replace(/\D/g, '');
                      const waUrl = cleanDigits.length >= 7 ? `https://wa.me/${cleanDigits}` : `tel:${student.contactInfo}`;
                      return (
                        <a 
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-emerald-700 hover:underline truncate flex items-center gap-1.5"
                          title="Open WhatsApp chat"
                        >
                          <span>{student.contactInfo}</span>
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800 rounded">
                            WhatsApp ↗
                          </span>
                        </a>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(student.contactInfo, 'Contact number')}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Copy phone"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No contact provided</span>
                )}
              </div>
            </div>

            {/* Email Address */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-700 rounded-xl shrink-0 mt-0.5">
                <Mail size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Student Email
                </span>
                {student.email || (student.contactInfo?.includes('@') ? student.contactInfo : null) ? (
                  <div className="flex items-center justify-between gap-1">
                    <a 
                      href={`mailto:${student.email || student.contactInfo}`}
                      className="text-sm font-bold text-red-700 hover:underline truncate"
                    >
                      {student.email || student.contactInfo}
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(student.email || student.contactInfo || '', 'Email address')}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Copy email"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No email recorded</span>
                )}
              </div>
            </div>
          </div>

          {/* Flight Details Section */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                <Plane size={16} />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Flight & Arrival Information
              </h4>
            </div>

            {student.flightDetails ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Airline</span>
                  <span className="font-bold text-slate-900">{student.flightDetails.airline || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Flight No</span>
                  <span className="font-bold text-slate-900">{student.flightDetails.flightNumber || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Terminal</span>
                  <span className="font-bold text-slate-900">{student.flightDetails.terminal || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Scheduled Time</span>
                  <span className="font-bold text-slate-900">
                    {student.flightDetails.date ? `${student.flightDetails.date} ` : ''}
                    {student.flightDetails.time || student.arrivalDate || '--'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-500 py-1">
                <span>Arrival Date: <strong className="text-slate-800">{student.arrivalDate || 'Not set'}</strong></span>
                <span className="text-slate-400 italic">Detailed flight info not recorded</span>
              </div>
            )}
          </div>

          {/* Accommodation / Hotel Section */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Hotel size={16} />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Accommodation Details
              </h4>
            </div>

            {student.accommodationDetails ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Hotel / Residence</span>
                  <span className="font-bold text-slate-900">{student.accommodationDetails.hotelName || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Room Type</span>
                  <span className="font-bold text-slate-900">{student.accommodationDetails.roomType || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Check In / Out</span>
                  <span className="font-bold text-slate-900">
                    {student.accommodationDetails.checkInDate || '--'} → {student.accommodationDetails.checkOutDate || '--'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-1">
                No specific accommodation details recorded for this student.
              </p>
            )}
          </div>

          {/* Counselor Remarks Section */}
          {student.counselorRemarks && (
            <div className="bg-purple-50/70 rounded-2xl border border-purple-200/90 p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-purple-100">
                <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                  <User size={16} />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900">
                  Counselor Remarks
                </h4>
              </div>
              <p className="text-xs text-purple-950 font-medium leading-relaxed bg-white/80 p-3 rounded-xl border border-purple-100">
                "{student.counselorRemarks}"
              </p>
            </div>
          )}

          {/* Completed Stages Checklist */}
          {student.completedStages && student.completedStages.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2.5 flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" />
                Completed Logistics Milestones ({student.completedStages.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {student.completedStages.map((stage, idx) => (
                  <span 
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold"
                  >
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    {stage}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          {onNavigateToFullProfile ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToFullProfile(student.id);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-blue-900 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors"
            >
              <ExternalLink size={14} />
              <span>Full Profile Page</span>
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}
