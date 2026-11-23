import React, { useEffect } from 'react';
import { X, ArrowLeft, MapPin, Clock, Download, ExternalLink, Trash2, User, DollarSign, Car } from 'lucide-react';
import { format } from 'date-fns';

export interface PhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  caption?: string;
  title?: string;
  timestamp?: string;
  location?: string;
  studentName?: string;
  amount?: number;
  vehicleLabel?: string;
  onDelete?: () => Promise<void> | void;
  deleteLabel?: string;
  isDeleting?: boolean;
}

export default function PhotoLightboxModal({
  isOpen,
  onClose,
  imageUrl,
  caption,
  title,
  timestamp,
  location,
  studentName,
  amount,
  vehicleLabel,
  onDelete,
  deleteLabel = 'Discard Proof',
  isDeleting = false
}: PhotoLightboxModalProps) {
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

  if (!isOpen || !imageUrl) return null;

  const displayTitle = title || caption || 'Visual Audit Proof';

  const formattedDate = timestamp ? (() => {
    try {
      return format(new Date(timestamp), 'MMM dd, yyyy • HH:mm:ss');
    } catch {
      return timestamp;
    }
  })() : null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl lg:max-w-5xl flex flex-col bg-slate-900 sm:rounded-3xl border-0 sm:border border-slate-700/60 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Mobile-Friendly Top Action Bar */}
        <div className="w-full px-3.5 sm:px-6 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-white shrink-0 pt-safe">
          {/* Left: Mobile Back Button + Title */}
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0"
              title="Go back"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <div className="min-w-0 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 hidden sm:inline-block"></span>
              <h4 className="text-xs sm:text-sm font-bold truncate text-slate-200">
                {displayTitle}
              </h4>
            </div>
          </div>

          {/* Right: Quick actions + Large X button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              title="Open full size in new tab"
            >
              <ExternalLink size={18} />
            </a>
            <a
              href={imageUrl}
              download="proof-photo.jpg"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors hidden sm:inline-flex"
              title="Download image"
            >
              <Download size={18} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-red-600/80 rounded-xl transition-all active:scale-95 cursor-pointer ml-1"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* High-Res Image Viewport (Fits remaining screen space) */}
        <div className="flex-1 w-full flex items-center justify-center bg-black/80 p-2 sm:p-4 min-h-0 overflow-hidden relative">
          <img 
            src={imageUrl} 
            alt={displayTitle} 
            className="max-h-full max-w-full object-contain rounded-lg sm:rounded-xl shadow-2xl select-none"
          />
        </div>

        {/* Bottom Details Footer & Actions */}
        <div className="w-full px-4 sm:px-6 py-3 bg-slate-900/95 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs text-slate-400 shrink-0 pb-safe">
          <div className="space-y-1 sm:space-y-0 sm:flex sm:items-center sm:gap-4 sm:flex-wrap min-w-0">
            {formattedDate && (
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Clock size={14} className="text-purple-400 shrink-0" />
                <span className="font-mono text-[11px] sm:text-xs">{formattedDate}</span>
              </div>
            )}

            {location && (
              <div className="flex items-center gap-1.5 text-slate-300 font-medium truncate">
                <MapPin size={14} className="text-red-400 shrink-0" />
                <span className="truncate max-w-xs sm:max-w-md">{location}</span>
              </div>
            )}

            {studentName && (
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <User size={14} className="text-blue-400 shrink-0" />
                <span>Student: <strong className="text-white">{studentName}</strong></span>
              </div>
            )}

            {amount !== undefined && (
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <DollarSign size={14} className="text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-bold font-mono">RM {amount.toFixed(2)}</span>
              </div>
            )}

            {vehicleLabel && (
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Car size={14} className="text-amber-400 shrink-0" />
                <span className="text-white font-semibold">{vehicleLabel}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
            {onDelete && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>{deleteLabel}</span>
              </button>
            )}

            {/* Mobile explicit bottom close button */}
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              <X size={14} />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
