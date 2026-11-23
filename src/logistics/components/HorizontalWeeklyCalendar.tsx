import React, { useMemo } from 'react';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  addWeeks, 
  subWeeks, 
  isSameDay, 
  isToday, 
  isSameMonth,
  startOfDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RotateCcw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface HorizontalWeeklyCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  taskCountsByDate?: Record<string, number>;
  className?: string;
}

export default function HorizontalWeeklyCalendar({
  selectedDate,
  onSelectDate,
  taskCountsByDate = {},
  className = '',
}: HorizontalWeeklyCalendarProps) {
  const { t, language } = useAppContext();
  const isRTL = language === 'ar';

  // Current viewing week's anchor (using selectedDate to derive week)
  const weekStart = useMemo(() => {
    return startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday start
  }, [selectedDate]);

  const weekEnd = useMemo(() => {
    return endOfWeek(weekStart, { weekStartsOn: 1 });
  }, [weekStart]);

  const daysInWeek = useMemo(() => {
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [weekStart, weekEnd]);

  const handlePrevWeek = () => {
    const prevWeekDate = subWeeks(selectedDate, 1);
    onSelectDate(prevWeekDate);
  };

  const handleNextWeek = () => {
    const nextWeekDate = addWeeks(selectedDate, 1);
    onSelectDate(nextWeekDate);
  };

  const handleTodayClick = () => {
    onSelectDate(startOfDay(new Date()));
  };

  // Header month/year title format (handles cross-month weeks like Aug - Sep 2026)
  const headerTitle = useMemo(() => {
    if (isSameMonth(weekStart, weekEnd)) {
      return format(weekStart, 'MMMM yyyy');
    }
    const startMonth = format(weekStart, 'MMM');
    const endMonth = format(weekEnd, 'MMM yyyy');
    return `${startMonth} - ${endMonth}`;
  }, [weekStart, weekEnd]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 sm:p-4 ${className}`}>
      {/* Calendar Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 pb-2.5 sm:pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-xs shrink-0">
            <CalendarIcon size={16} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-lg leading-tight">
              {headerTitle}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleTodayClick}
            disabled={isToday(selectedDate)}
            className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 cursor-pointer ${
              isToday(selectedDate)
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 shadow-xs active:scale-95'
            }`}
            title="Jump to Today"
          >
            <RotateCcw size={12} className={isToday(selectedDate) ? 'opacity-40' : 'text-red-600'} />
            <span>{t('today')}</span>
          </button>

          <div className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={isRTL ? handleNextWeek : handlePrevWeek}
              className="p-1 sm:p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-xs transition-all active:scale-95 cursor-pointer"
              title={t('previousWeek')}
              aria-label={t('previousWeek')}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={isRTL ? handlePrevWeek : handleNextWeek}
              className="p-1 sm:p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-xs transition-all active:scale-95 cursor-pointer"
              title={t('nextWeek')}
              aria-label={t('nextWeek')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Week Strip (7 Days) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2.5">
        {daysInWeek.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentDay = isToday(day);
          const dateKey = format(day, 'yyyy-MM-dd');
          const taskCount = taskCountsByDate[dateKey] || 0;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`group relative flex flex-col items-center justify-between p-1 sm:p-2.5 rounded-lg sm:rounded-2xl transition-all duration-200 focus:outline-none select-none cursor-pointer ${
                isSelected
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/25 ring-2 ring-red-600 ring-offset-1 sm:ring-offset-2 scale-[1.02] z-10'
                  : isCurrentDay
                  ? 'bg-red-50/60 border-2 border-red-300 text-slate-800 hover:bg-red-50 hover:border-red-400'
                  : 'bg-slate-50/70 border border-slate-200/80 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              {/* Day of Week Name (e.g. Mon, Tue) */}
              <span
                className={`text-[9px] sm:text-xs font-semibold tracking-wider uppercase mb-0.5 sm:mb-1 ${
                  isSelected
                    ? 'text-red-100 font-bold'
                    : isCurrentDay
                    ? 'text-red-600 font-bold'
                    : 'text-slate-500 group-hover:text-slate-800'
                }`}
              >
                {format(day, 'EEE')}
              </span>

              {/* Day of Month Number (e.g. 31, 1, 2) */}
              <span
                className={`text-xs sm:text-xl font-extrabold leading-none my-0.5 ${
                  isSelected
                    ? 'text-white'
                    : isCurrentDay
                    ? 'text-red-950 font-black'
                    : 'text-slate-800'
                }`}
              >
                {format(day, 'd')}
              </span>

              {/* Footer indicator: Today pill or Task count badge */}
              <div className="mt-1 min-h-[16px] sm:min-h-[18px] flex items-center justify-center gap-1">
                {isCurrentDay && !isSelected ? (
                  <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold text-red-600 uppercase tracking-tight bg-red-100/90 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-full">
                    <span>{t('today')}</span>
                    {taskCount > 0 && <span className="text-red-800">• {taskCount}</span>}
                  </span>
                ) : taskCount > 0 ? (
                  <span
                    className={`inline-flex items-center justify-center px-1 sm:px-1.5 py-0.2 text-[8px] sm:text-[10px] font-bold rounded-full ${
                      isSelected
                        ? 'bg-white text-red-600 shadow-xs'
                        : 'bg-slate-200/80 text-slate-700 group-hover:bg-slate-300'
                    }`}
                    title={`${taskCount} task${taskCount > 1 ? 's' : ''}`}
                  >
                    {taskCount}
                  </span>
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-red-300/40' : 'bg-transparent'
                    }`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
