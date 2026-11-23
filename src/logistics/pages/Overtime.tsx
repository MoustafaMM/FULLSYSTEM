import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { OvertimeLog, SubTask, MediaItem, Task } from '../types';
import { 
  Clock, Calendar, Users, Filter, Plus, Search, Download, 
  Trash2, Pencil, CheckCircle2, CheckSquare, 
  Briefcase, Coffee, X, Info,
  Printer, Star, CheckCheck,
  BarChart2, ListOrdered, LayoutGrid, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  TaskCategory,
  coerceValidIsoTimestamp,
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskStatusBadgeClasses,
  isTaskEligibleForOvertime,
  matchesTaskTypeFilter,
  normalizeTaskStatus
} from '../utils/taskClassification';
import {
  WorkOvertimeSlice,
  sliceWorkInterval,
  formatDurationDisplay,
  getSliceDayTypeLabel,
  getMalaysiaDateStr,
  getMalaysiaDateRangePreset,
  getMalaysiaDateParts,
  parseMalaysiaDateTime,
  parseIsoOrMalaysiaDateTime,
  formatMalaysiaTimeHHmm,
  formatMalaysiaDateTimeDisplay,
  formatMalaysiaTimestamp,
  formatMalaysiaFilenameStamp,
  REGULAR_WORK_START_HOUR,
  REGULAR_WORK_END_HOUR,
} from '../utils/overtime';

export type { WorkOvertimeSlice };
export { sliceWorkInterval, formatDurationDisplay };

/**
 * Visual 24-Hour Timeline Bar (Malaysia Time UTC+08:00) representing day distribution & overtime slicing
 */
export function DayTimelineBar({ slice }: { slice: WorkOvertimeSlice }) {
  const startMins = slice.startMinutesInDay;
  const endMins = slice.endMinutesInDay;

  const leftPct = Math.max(0, Math.min(100, (startMins / 1440) * 100));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((endMins - startMins) / 1440) * 100));

  const regStartMins = REGULAR_WORK_START_HOUR * 60; // 540 (09:00)
  const regEndMins = REGULAR_WORK_END_HOUR * 60;     // 1020 (17:00)
  const regWindowLeft = (regStartMins / 1440) * 100; // 37.5%
  const regWindowWidth = ((regEndMins - regStartMins) / 1440) * 100; // 33.33%

  const spanMins = Math.max(0.001, endMins - startMins);
  const preOtMins = slice.hasStandardHours ? Math.max(0, Math.min(endMins, regStartMins) - startMins) : 0;
  const regMins = slice.hasStandardHours ? Math.max(0, Math.min(endMins, regEndMins) - Math.max(startMins, regStartMins)) : 0;
  const postOtMins = slice.hasStandardHours ? Math.max(0, endMins - Math.max(startMins, regEndMins)) : 0;

  return (
    <div className="space-y-2 py-1">
      {/* Visual Timeline Bar */}
      <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
        {/* Regular Hours Window Background (Mon–Fri, 09:00 to 17:00) */}
        {slice.hasStandardHours && (
          <div
            className="absolute top-0 bottom-0 bg-blue-50/80 border-x border-dashed border-blue-300"
            style={{ left: `${regWindowLeft}%`, width: `${regWindowWidth}%` }}
            title="Standard Working Window (Mon–Fri, 09:00 - 17:00 MYT)"
          />
        )}

        {/* Task Interval Block with exact regular/overtime sub-segments */}
        <div
          className="absolute top-1 bottom-1 rounded-md shadow-2xs transition-all flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          {slice.isWeekend ? (
            <div className="w-full h-full bg-amber-600" />
          ) : slice.hasStandardHours ? (
            <div className="w-full h-full flex">
              {preOtMins > 0 && (
                <div className="h-full bg-red-600" style={{ width: `${(preOtMins / spanMins) * 100}%` }} />
              )}
              {regMins > 0 && (
                <div className="h-full bg-blue-600" style={{ width: `${(regMins / spanMins) * 100}%` }} />
              )}
              {postOtMins > 0 && (
                <div className="h-full bg-red-600" style={{ width: `${(postOtMins / spanMins) * 100}%` }} />
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-red-600" />
          )}

          {widthPct >= 14 && (
            <span className="absolute inset-0 flex items-center justify-center truncate px-1 drop-shadow-xs">
              {slice.startTimeFormatted}–{slice.endTimeFormatted}
            </span>
          )}
        </div>
      </div>

      {/* Axis Labels */}
      {slice.hasStandardHours ? (
        <div className="flex justify-between items-center gap-1 text-[10px] font-mono text-slate-400 px-0.5">
          <span>00:00</span>
          <span className="text-blue-600 font-bold">
            09:00<span className="hidden sm:inline"> AM (Start Standard)</span>
          </span>
          <span className="hidden sm:inline">12:00</span>
          <span className="text-blue-600 font-bold">
            17:00<span className="hidden sm:inline"> (5:00 PM End Standard)</span>
          </span>
          <span>24:00</span>
        </div>
      ) : (
        <div className="flex justify-between items-center gap-1 text-[10px] font-mono text-slate-400 px-0.5">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      )}

      {/* Legend & Interval Breakdown Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {slice.hasStandardHours && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block shrink-0" />
              <span>Standard (9am–5pm): <strong className="font-mono text-slate-800">{formatDurationDisplay(slice.regularMinutes)}</strong></span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm inline-block shrink-0 ${slice.isWeekend ? 'bg-amber-500' : 'bg-red-500'}`} />
            <span>
              {slice.isWeekend ? 'Weekend Holiday OT' : 'Weekday Overtime'}:{' '}
              <strong className={`font-mono font-bold ${slice.isWeekend ? 'text-amber-700' : 'text-red-600'}`}>
                {formatDurationDisplay(slice.overtimeMinutes)}
              </strong>
            </span>
          </div>
        </div>
        <span className="font-mono text-slate-500 text-[10px]">
          {slice.startTimeFormatted}–{slice.endTimeFormatted} ({formatDurationDisplay(slice.totalMinutes)})
        </span>
      </div>
    </div>
  );
}

export default function Overtime() {
  const { 
    currentUser, users, tasks, students, presets, overtimeLogs, 
    addOvertimeLog, updateOvertimeLog, deleteOvertimeLog, t 
  } = useAppContext();

  // Role permissions
  const isFieldOfficer = currentUser?.role === 'field_officer';
  const canManageManualLogs = currentUser?.role === 'admin' || currentUser?.role === 'coordinator';

  // View Mode: Detailed Ledger vs Officer Summary Cards vs Daily Distribution Chart
  const [viewMode, setViewMode] = useState<'ledger' | 'officers' | 'chart'>('ledger');

  // Selected slice for detailed drill-down drawer
  const [selectedSliceForDetail, setSelectedSliceForDetail] = useState<WorkOvertimeSlice | null>(null);

  // Filters State
  const [selectedStaffId, setSelectedStaffId] = useState<string>(isFieldOfficer && currentUser ? currentUser.id : 'all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'on_time'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [dayTypeFilter, setDayTypeFilter] = useState<'all' | 'weekday' | 'weekend'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'task' | 'manual'>('all');
  const [datePreset, setDatePreset] = useState<'all' | 'this_month' | 'last_month' | 'this_week' | 'custom'>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false);

  // Manual Overtime Modal State
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [editingLog, setEditingLog] = useState<OvertimeLog | null>(null);
  const [manualFormData, setManualFormData] = useState({
    userId: isFieldOfficer && currentUser ? currentUser.id : (users.find(u => u.role === 'field_officer')?.id || users[0]?.id || ''),
    date: getMalaysiaDateStr(),
    startTime: '17:00',
    endTime: '20:00',
    notes: '',
    referenceTitle: 'Manual Overtime Adjustment',
  });
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedSliceForDetail && !showManualModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSliceForDetail) setSelectedSliceForDetail(null);
        else if (showManualModal && !isSavingManual) setShowManualModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedSliceForDetail, showManualModal, isSavingManual]);

  const { currentMonthLabel, lastMonthLabel } = useMemo(() => {
    const now = new Date();
    const mytNow = getMalaysiaDateParts(now);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kuala_Lumpur',
      month: 'short',
      year: 'numeric',
    });
    return {
      currentMonthLabel: fmt.format(now),
      lastMonthLabel: fmt.format(new Date(Date.UTC(mytNow.year, mytNow.month - 1, 15))),
    };
  }, []);

  // Helper map of users
  const userMap = useMemo(() => {
    const map = new Map<string, typeof users[0]>();
    users.forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  // Helper map of students
  const studentMap = useMemo(() => {
    const map = new Map<string, typeof students[0]>();
    students.forEach(s => map.set(s.id, s));
    return map;
  }, [students]);

  // Only logistic persons (Field Officers)
  const logisticOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const logisticOfficerIds = useMemo(() => {
    return new Set(logisticOfficers.map(u => u.id));
  }, [logisticOfficers]);

  // Derive date bounds based on datePreset strictly in Malaysia Time (UTC+08:00)
  const { filterStart, filterEnd } = useMemo(() => {
    return getMalaysiaDateRangePreset(datePreset, customStartDate, customEndDate);
  }, [datePreset, customStartDate, customEndDate]);

  // 1. Process all work intervals across Completed Tasks (Start Task -> Complete) and Manual Overtime Logs
  const allWorkSlices = useMemo(() => {
    const rawSlices: WorkOvertimeSlice[] = [];

    // A. Tasks: ONLY completed tasks with valid startedAt (from pressing Start Task) and completedAt
    // Never count pending/in_progress/cancelled tasks, never fall back to createdAt or student communication time
    tasks.forEach(task => {
      if (!isTaskEligibleForOvertime(task)) return;

      const assignee = userMap.get(task.assigneeId);
      const startIso = coerceValidIsoTimestamp(task.startedAt);
      const endIso = coerceValidIsoTimestamp(task.completedAt);
      if (!startIso || !endIso) return;

      const startDate = new Date(startIso);
      const endDate = new Date(endIso);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) return;

      const taskCategory = getTaskCategory(task);
      const student = task.studentId ? studentMap.get(task.studentId) : undefined;
      const taskTitle = getTaskDisplayTitle(task, presets, 'en');

      const slices = sliceWorkInterval(startDate, endDate, {
        sourceType: 'task',
        sourceId: task.id,
        userId: task.assigneeId,
        userName: assignee?.name || 'Unassigned Staff',
        userRole: assignee?.role || 'field_officer',
        referenceTitle: taskTitle,
        referenceDetail: task.isNonStudentTask ? `Non-Student #${task.id.slice(-6).toUpperCase()}` : `Task #${task.id.slice(-6).toUpperCase()}`,
        notes: task.notes,
        presetId: task.presetId,
        status: normalizeTaskStatus(task),
        isNonStudentTask: task.isNonStudentTask,
        taskCategory,
        studentId: task.studentId,
        studentName: student?.fullName,
        studentPassport: student?.passportNumber,
        studentPhone: student?.contactInfo,
        studentUniversity: student?.university,
        studentPackage: student?.servicePackage || (student as any)?.package || 'Free',
        nonStudentTitle: task.nonStudentTitle,
        nonStudentContact: task.nonStudentContact,
        hotel: task.hotel,
        subTasks: task.subTasks,
        feedbackRating: task.feedback?.rating,
        feedbackComment: task.feedback?.comments,
        taskStartedAt: startIso,
        taskCompletedAt: endIso,
        studentCommunicationMedia: task.studentCommunicationMedia,
      });

      rawSlices.push(...slices);
    });

    // B. Manual Overtime Adjustments from Firestore overtimeLogs (parsed strictly in MYT UTC+08:00)
    overtimeLogs.forEach(manual => {
      const staff = userMap.get(manual.userId);
      const startDate = manual.startTime.includes('T')
        ? parseIsoOrMalaysiaDateTime(manual.startTime)
        : parseMalaysiaDateTime(manual.date, manual.startTime);

      let endDate = manual.endTime.includes('T')
        ? parseIsoOrMalaysiaDateTime(manual.endTime)
        : parseMalaysiaDateTime(manual.date, manual.endTime);

      if (!startDate || !endDate) return;

      if (!manual.endTime.includes('T') && endDate <= startDate) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      }

      if (endDate <= startDate) return;

      const slices = sliceWorkInterval(startDate, endDate, {
        sourceType: 'manual',
        sourceId: manual.id,
        userId: manual.userId,
        userName: staff?.name || 'Staff Member',
        userRole: staff?.role || 'field_officer',
        referenceTitle: manual.referenceTitle || 'Manual Overtime Adjustment',
        referenceDetail: 'Approved Adjustment Entry',
        notes: manual.notes,
        manualLogId: manual.id,
      });

      rawSlices.push(...slices);
    });

    // Sort newest date and time first
    return rawSlices.sort((a, b) => b.actualStart.getTime() - a.actualStart.getTime());
  }, [tasks, presets, overtimeLogs, userMap, studentMap]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!isFieldOfficer && selectedStaffId !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (outcomeFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (dayTypeFilter !== 'all') count++;
    if (sourceFilter !== 'all') count++;
    if (datePreset !== 'all' || customStartDate || customEndDate) count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [isFieldOfficer, selectedStaffId, presetFilter, outcomeFilter, categoryFilter, dayTypeFilter, sourceFilter, datePreset, customStartDate, customEndDate, searchTerm]);

  const handleClearFilters = () => {
    if (!isFieldOfficer) setSelectedStaffId('all');
    setPresetFilter('all');
    setOutcomeFilter('all');
    setCategoryFilter('all');
    setDayTypeFilter('all');
    setSourceFilter('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSearchTerm('');
  };

  // 2. Apply User Permissions and Active Filters
  const filteredSlices = useMemo(() => {
    return allWorkSlices.filter(slice => {
      // Role scoping: Field Officers can only view their own overtime log
      if (isFieldOfficer && currentUser && slice.userId !== currentUser.id) {
        return false;
      }

      // Restrict overtime tracking exclusively to logistic personnel
      if (!isFieldOfficer && selectedStaffId === 'all' && !logisticOfficerIds.has(slice.userId)) {
        return false;
      }

      // Staff filter (for admin, coordinator, accountant)
      if (!isFieldOfficer && selectedStaffId !== 'all' && slice.userId !== selectedStaffId) {
        return false;
      }

      // Preset / Task Type Filter
      if (presetFilter !== 'all') {
        if (slice.sourceType !== 'task') return false;
        if (
          !matchesTaskTypeFilter(
            { isNonStudentTask: slice.isNonStudentTask, presetId: slice.presetId },
            presetFilter
          )
        ) {
          return false;
        }
      }

      // Execution Outcome Filter
      if (outcomeFilter !== 'all') {
        if (slice.sourceType !== 'task') return false;
        if (outcomeFilter === 'on_time' && slice.status !== 'completed') return false;
      }

      // Task Category Filter (student_preset vs student_custom vs non_student)
      if (categoryFilter !== 'all') {
        if (slice.sourceType !== 'task') return false;
        if (slice.taskCategory !== categoryFilter) return false;
      }

      // Day Type filter
      if (dayTypeFilter === 'weekday' && slice.isWeekend) return false;
      if (dayTypeFilter === 'weekend' && !slice.isWeekend) return false;

      // Source filter
      if (sourceFilter !== 'all' && slice.sourceType !== sourceFilter) return false;

      // Date range filter
      if (filterStart && slice.dateStr < filterStart) return false;
      if (filterEnd && slice.dateStr > filterEnd) return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = slice.userName.toLowerCase().includes(query);
        const matchesRef = slice.referenceTitle.toLowerCase().includes(query);
        const matchesDetail = slice.referenceDetail?.toLowerCase().includes(query);
        const matchesNotes = slice.notes?.toLowerCase().includes(query);
        const matchesStudent = (slice.studentName || '').toLowerCase().includes(query);
        const matchesPassport = (slice.studentPassport || '').toLowerCase().includes(query);
        const matchesUni = (slice.studentUniversity || '').toLowerCase().includes(query);
        const matchesNonStudent = (slice.nonStudentTitle || '').toLowerCase().includes(query);
        if (!matchesName && !matchesRef && !matchesDetail && !matchesNotes && !matchesStudent && !matchesPassport && !matchesUni && !matchesNonStudent) {
          return false;
        }
      }

      return true;
    });
  }, [allWorkSlices, isFieldOfficer, currentUser, selectedStaffId, logisticOfficerIds, presetFilter, outcomeFilter, categoryFilter, dayTypeFilter, sourceFilter, filterStart, filterEnd, searchTerm]);

  // 3. Top Summary KPI Calculations
  const summaryKpis = useMemo(() => {
    let totalOvertimeMins = 0;
    let weekdayOvertimeMins = 0;
    let weekendOvertimeMins = 0;
    let totalRegularMins = 0;
    let totalWorkMins = 0;

    filteredSlices.forEach(s => {
      totalOvertimeMins += s.overtimeMinutes;
      weekdayOvertimeMins += s.weekdayOvertimeMinutes;
      weekendOvertimeMins += s.weekendOvertimeMinutes;
      totalRegularMins += s.regularMinutes;
      totalWorkMins += s.totalMinutes;
    });

    const uniqueOfficers = new Set(filteredSlices.filter(s => s.overtimeMinutes > 0).map(s => s.userId));

    return {
      totalOvertimeHoursStr: formatDurationDisplay(totalOvertimeMins),
      weekdayOvertimeHoursStr: formatDurationDisplay(weekdayOvertimeMins),
      weekendOvertimeHoursStr: formatDurationDisplay(weekendOvertimeMins),
      totalRegularHoursStr: formatDurationDisplay(totalRegularMins),
      totalWorkHoursStr: formatDurationDisplay(totalWorkMins),
      totalOvertimeMins,
      weekdayOvertimeMins,
      weekendOvertimeMins,
      totalRegularMins,
      totalWorkMins,
      recordCount: filteredSlices.length,
      uniqueOfficersCount: uniqueOfficers.size,
    };
  }, [filteredSlices]);

  // 4. Officer Aggregation Leaderboard (for Officer Summary View Mode)
  const officerSummaries = useMemo(() => {
    const officerMap = new Map<string, {
      officer: typeof users[0];
      tasksCount: number;
      totalWorkMins: number;
      regularMins: number;
      overtimeMins: number;
      weekdayOtMins: number;
      weekendOtMins: number;
      
    }>();

    logisticOfficers.forEach(fo => {
      officerMap.set(fo.id, {
        officer: fo,
        tasksCount: 0,
        totalWorkMins: 0,
        regularMins: 0,
        overtimeMins: 0,
        weekdayOtMins: 0,
        weekendOtMins: 0,
        
      });
    });

    filteredSlices.forEach(slice => {
      let entry = officerMap.get(slice.userId);
      if (!entry) {
        const u = userMap.get(slice.userId);
        if (u) {
          entry = {
            officer: u,
            tasksCount: 0,
            totalWorkMins: 0,
            regularMins: 0,
            overtimeMins: 0,
            weekdayOtMins: 0,
            weekendOtMins: 0,
            
          };
          officerMap.set(slice.userId, entry);
        }
      }
      if (entry) {
        entry.tasksCount += 1;
        entry.totalWorkMins += slice.totalMinutes;
        entry.regularMins += slice.regularMinutes;
        entry.overtimeMins += slice.overtimeMinutes;
        entry.weekdayOtMins += slice.weekdayOvertimeMinutes;
        entry.weekendOtMins += slice.weekendOvertimeMinutes;
        
      }
    });

    return Array.from(officerMap.values())
      .filter(item => isFieldOfficer ? item.officer.id === currentUser?.id : (selectedStaffId === 'all' || item.officer.id === selectedStaffId))
      .sort((a, b) => b.overtimeMins - a.overtimeMins);
  }, [logisticOfficers, filteredSlices, userMap, isFieldOfficer, currentUser, selectedStaffId]);

  // 5. Daily Overtime Distribution (for Daily Timeline View Mode)
  const dailyDistribution = useMemo(() => {
    const dayMap = new Map<string, {
      dateStr: string;
      dayName: string;
      isWeekend: boolean;
      totalOtMins: number;
      regularMins: number;
      taskCount: number;
    }>();

    filteredSlices.forEach(slice => {
      const existing = dayMap.get(slice.dateStr);
      if (existing) {
        existing.totalOtMins += slice.overtimeMinutes;
        existing.regularMins += slice.regularMinutes;
        existing.taskCount += 1;
      } else {
        dayMap.set(slice.dateStr, {
          dateStr: slice.dateStr,
          dayName: slice.dayNameShort,
          isWeekend: slice.isWeekend,
          totalOtMins: slice.overtimeMinutes,
          regularMins: slice.regularMinutes,
          taskCount: 1,
        });
      }
    });

    return Array.from(dayMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [filteredSlices]);

  // Handler: Open Manual Modal for new entry
  const handleOpenNewManual = () => {
    setEditingLog(null);
    setManualFormData({
      userId: isFieldOfficer && currentUser ? currentUser.id : (selectedStaffId !== 'all' ? selectedStaffId : logisticOfficers[0]?.id || users.find(u => u.role === 'field_officer')?.id || users[0]?.id || ''),
      date: getMalaysiaDateStr(),
      startTime: '17:00',
      endTime: '20:00',
      notes: '',
      referenceTitle: 'Manual Overtime Adjustment',
    });
    setShowManualModal(true);
  };

  // Handler: Open Manual Modal for edit
  const handleEditManual = (manualLogId: string) => {
    const existing = overtimeLogs.find(l => l.id === manualLogId);
    if (!existing) return;
    setEditingLog(existing);
    
    let startVal = '17:00';
    let endVal = '20:00';
    if (existing.startTime) {
      startVal = existing.startTime.includes('T') ? formatMalaysiaTimeHHmm(existing.startTime) : existing.startTime;
    }
    if (existing.endTime) {
      endVal = existing.endTime.includes('T') ? formatMalaysiaTimeHHmm(existing.endTime) : existing.endTime;
    }

    setManualFormData({
      userId: existing.userId,
      date: existing.date,
      startTime: startVal,
      endTime: endVal,
      notes: existing.notes || '',
      referenceTitle: existing.referenceTitle || 'Manual Overtime Adjustment',
    });
    setShowManualModal(true);
  };

  // Handler: Save Manual Overtime
  const handleSaveManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFormData.userId || !manualFormData.date || !manualFormData.startTime || !manualFormData.endTime) {
      toast.error('Please complete all mandatory fields');
      return;
    }

    const startDate = parseMalaysiaDateTime(manualFormData.date, manualFormData.startTime);
    let endDate = parseMalaysiaDateTime(manualFormData.date, manualFormData.endTime);
    if (!startDate || !endDate) {
      toast.error('Invalid date or time format');
      return;
    }
    if (manualFormData.endTime <= manualFormData.startTime) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    const slices = sliceWorkInterval(startDate, endDate, {
      sourceType: 'manual',
      sourceId: 'preview',
      userId: manualFormData.userId,
      userName: '',
      userRole: '',
      referenceTitle: manualFormData.referenceTitle,
    });

    const totalOtMins = slices.reduce((acc, s) => acc + s.overtimeMinutes, 0);
    const totalRegMins = slices.reduce((acc, s) => acc + s.regularMinutes, 0);
    const dayType = slices[0]?.dayType || 'weekday';

    setIsSavingManual(true);
    try {
      if (editingLog) {
        await updateOvertimeLog(editingLog.id, {
          userId: manualFormData.userId,
          date: manualFormData.date,
          startTime: startIso,
          endTime: endIso,
          notes: manualFormData.notes.trim() || undefined,
          referenceTitle: manualFormData.referenceTitle.trim(),
          overtimeMinutes: totalOtMins,
          regularMinutes: totalRegMins,
          dayType,
        });
        toast.success('Manual overtime adjustment updated');
      } else {
        await addOvertimeLog({
          userId: manualFormData.userId,
          date: manualFormData.date,
          startTime: startIso,
          endTime: endIso,
          type: 'manual',
          notes: manualFormData.notes.trim() || undefined,
          referenceTitle: manualFormData.referenceTitle.trim(),
          overtimeMinutes: totalOtMins,
          regularMinutes: totalRegMins,
          dayType,
          createdBy: currentUser?.name || 'Administrator',
          createdAt: new Date().toISOString(),
        });
        toast.success('Manual overtime logged successfully');
      }
      setShowManualModal(false);
    } catch (err: any) {
      console.error('Error saving manual overtime:', err);
      toast.error(err?.message || 'Failed to save manual overtime');
    } finally {
      setIsSavingManual(false);
    }
  };

  // Handler: Delete Manual Overtime
  const handleDeleteManual = async (logId: string) => {
    if (!window.confirm('Are you sure you want to delete this manual overtime entry?')) return;
    try {
      await deleteOvertimeLog(logId);
      toast.success('Manual overtime entry deleted');
    } catch (err: any) {
      console.error('Error deleting overtime log:', err);
      toast.error('Failed to delete overtime entry');
    }
  };

  // Handler: Print Formal Report (Triggers Browser Print Preview with customized @media print CSS)
  const handlePrintFormalReport = () => {
    window.print();
  };

  // Handler: Enhanced Multi-Sheet Excel Export (.xlsx) with Active Filters & Audit Metadata
  const handleExportExcel = async () => {
    if (filteredSlices.length === 0) {
      toast.error('No overtime records match your filters to export');
      return;
    }

    setIsExportingExcel(true);
    try {
      const XLSX = await import('xlsx');

      const selectedOfficerName = selectedStaffId === 'all' 
        ? `All Logistics Officers (${logisticOfficers.length})` 
        : (userMap.get(selectedStaffId)?.name || selectedStaffId);

      const activeDateRangeText = datePreset === 'custom'
        ? `${customStartDate || 'Start'} to ${customEndDate || 'End'}`
        : datePreset.replace('_', ' ').toUpperCase();

      // -----------------------------------------------------------------------
      // SHEET 1: Audit_Summary (Active Filter Matrix + Executive KPIs)
      // -----------------------------------------------------------------------
      const summaryRows = [
        ['PIONEER EDUCATION SERVICES — OVERTIME & WORK HOURS AUDIT REPORT'],
        ['Generated Date & Time (UTC+8 / MYT):', formatMalaysiaTimestamp(new Date())],
        ['Generated By:', `${currentUser?.name || 'Authorized Staff'} (${currentUser?.role || 'Staff'})`],
        ['Calculation Rules Applied:', 'Weekdays (Mon–Fri) 09:00–17:00 Standard (0 OT); Mon–Fri before 09:00 or after 17:00 = Weekday OT; Sat–Sun Weekend Holiday = 100% Weekend OT; Completed tasks counted strictly from Start Task to Complete'],
        ['Timezone Standard:', 'Malaysia Time (UTC+08:00)'],
        [],
        ['=== ACTIVE FILTER AUDIT MATRIX ==='],
        ['Logistics Officer Filter:', selectedOfficerName],
        ['Date Range Period:', activeDateRangeText],
        ['Day Type Filter:', dayTypeFilter.toUpperCase()],
        ['Source Type Filter:', sourceFilter.toUpperCase()],
        ['Task Type / Preset Filter:', presetFilter === 'all' ? 'All Task Types' : presetFilter],
        ['Execution Outcome Filter:', outcomeFilter.toUpperCase()],
        ['Task Category Filter:', categoryFilter.toUpperCase()],
        ['Search Query Text:', searchTerm.trim() || 'None'],
        [],
        ['=== AGGREGATE PERIOD AUDIT KPIS ==='],
        ['Total Overtime Duration:', summaryKpis.totalOvertimeHoursStr],
        ['Total Overtime Hours (Decimal):', Number((summaryKpis.totalOvertimeMins / 60).toFixed(2))],
        ['Weekday Overtime (Mon–Fri After-Hours):', summaryKpis.weekdayOvertimeHoursStr],
        ['Weekday OT Hours (Decimal):', Number((summaryKpis.weekdayOvertimeMins / 60).toFixed(2))],
        ['Weekend Holiday Overtime (Sat–Sun):', summaryKpis.weekendOvertimeHoursStr],
        ['Weekend Holiday OT Hours (Decimal):', Number((summaryKpis.weekendOvertimeMins / 60).toFixed(2))],
        ['Standard Regular Hours (Mon–Fri, 9am–5pm):', summaryKpis.totalRegularHoursStr],
        ['Regular Hours (Decimal):', Number((summaryKpis.totalRegularMins / 60).toFixed(2))],
        ['Total Operational Work Hours:', summaryKpis.totalWorkHoursStr],
        ['Total Operational Tasks/Intervals:', filteredSlices.length],
        ['Unique Officers With Overtime:', summaryKpis.uniqueOfficersCount],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 44 }, { wch: 65 }];

      // -----------------------------------------------------------------------
      // SHEET 2: Detailed_Task_Ledger (18+ Audit Columns)
      // -----------------------------------------------------------------------
      const ledgerRows = filteredSlices.map(s => {
        return {
          'Work Date (YYYY-MM-DD)': s.dateStr,
          'Day of Week': s.dayNameFull,
          'Day Type': getSliceDayTypeLabel(s),
          'Logistics Officer': s.userName,
          'Officer Role': s.userRole,
          'Task / Reference Title': s.referenceTitle,
          'Reference ID': s.referenceDetail || s.sourceId,
          'Task Category': s.sourceType === 'manual' ? 'Manual Adjustment' : s.taskCategory === 'non_student' ? 'General / Non-Student' : s.taskCategory === 'student_custom' ? 'Student Custom' : 'Student SOP',
          'Beneficiary / Student Name': s.studentName || s.nonStudentTitle || '-',
          'Student Passport / Contact': s.studentPassport || s.nonStudentContact || '-',
          'University / Destination': s.studentUniversity || s.hotel || '-',
          'Service Package Tier': s.studentPackage || '-',
          'Execution Status': s.status ? s.status.toUpperCase() : 'COMPLETED',
          'Start Time (MYT)': s.startTimeFormatted,
          'End Time (MYT)': s.endTimeFormatted,
          'Total Duration (Hrs)': Number((s.totalMinutes / 60).toFixed(2)),
          'Regular Hours (Mon–Fri 9am–5pm)': Number((s.regularMinutes / 60).toFixed(2)),
          'Counted Overtime (Hrs)': Number((s.overtimeMinutes / 60).toFixed(2)),
          'Weekday OT (Hrs)': Number((s.weekdayOvertimeMinutes / 60).toFixed(2)),
          'Weekend Holiday OT (Hrs)': Number((s.weekendOvertimeMinutes / 60).toFixed(2)),
          'CSAT Rating (1-5)': s.feedbackRating ? `${s.feedbackRating} / 5` : 'N/A',
          'Operational Notes': s.notes || '-',
          'Source': s.sourceType === 'task' ? 'Operational Task' : 'Manual Adjustment',
        };
      });

      const wsLedger = XLSX.utils.json_to_sheet(ledgerRows);
      wsLedger['!cols'] = [
        { wch: 15 }, // Date
        { wch: 12 }, // Day of Week
        { wch: 24 }, // Day Type
        { wch: 22 }, // Officer Name
        { wch: 14 }, // Role
        { wch: 28 }, // Title
        { wch: 18 }, // Ref ID
        { wch: 20 }, // Category
        { wch: 24 }, // Beneficiary
        { wch: 20 }, // Passport
        { wch: 24 }, // University/Hotel
        { wch: 16 }, // Package
        { wch: 14 }, // Status
        { wch: 14 }, // Start
        { wch: 14 }, // End
        { wch: 16 }, // Total Duration
        { wch: 24 }, // Regular Hours
        { wch: 18 }, // Overtime Hours
        { wch: 15 }, // Weekday OT
        { wch: 20 }, // Weekend Holiday OT
        { wch: 15 }, // Rating
        { wch: 35 }, // Notes
        { wch: 18 }, // Source
      ];

      // -----------------------------------------------------------------------
      // SHEET 3: Officer_Leaderboard (Aggregated totals per officer)
      // -----------------------------------------------------------------------
      const leaderboardRows = officerSummaries.map(item => {
        const totalOtHours = Number((item.overtimeMins / 60).toFixed(2));
        const totalWorkHours = Number((item.totalWorkMins / 60).toFixed(2));
        const otSharePct = totalWorkHours > 0 ? Math.round((totalOtHours / totalWorkHours) * 100) : 0;
        return {
          'Logistics Officer Name': item.officer.name,
          'Username': item.officer.username || item.officer.id,
          'Total Tasks Executed': item.tasksCount,
          'Total Overtime (Hours)': totalOtHours,
          'Formatted Overtime Duration': formatDurationDisplay(item.overtimeMins),
          'Weekday Overtime (Hrs)': Number((item.weekdayOtMins / 60).toFixed(2)),
          'Weekend Holiday OT (Hrs)': Number((item.weekendOtMins / 60).toFixed(2)),
          'Standard Regular Hours (Hrs)': Number((item.regularMins / 60).toFixed(2)),
          'Total Work Hours (Hrs)': totalWorkHours,
          'Overtime Share (%)': `${otSharePct}%`,
        };
      });

      const wsOfficers = XLSX.utils.json_to_sheet(leaderboardRows);
      wsOfficers['!cols'] = [
        { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
        { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
        { wch: 20 }, { wch: 18 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit_Summary');
      XLSX.utils.book_append_sheet(wb, wsLedger, 'Task_Overtime_Ledger');
      XLSX.utils.book_append_sheet(wb, wsOfficers, 'Officer_Leaderboard');

      const fileName = `Pioneer_Overtime_Audit_${formatMalaysiaFilenameStamp(new Date())}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Audit report exported to ${fileName}`);
    } catch (err: any) {
      console.error('Error generating enhanced Excel audit report:', err);
      toast.error('Failed to generate Excel report');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Print-Only Header (Appears only when printed on physical paper or saved to PDF) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Pioneer Education Services</h1>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">Ground Operations & Student Logistics Management Platform</p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <p className="font-bold text-slate-800">OVERTIME & WORK AUDIT REPORT</p>
            <p>Generated: {formatMalaysiaTimestamp(new Date())} (UTC+08:00)</p>
            <p>Staff: {currentUser?.name} ({currentUser?.role})</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4 p-2.5 bg-slate-100 rounded-lg text-[11px] font-mono">
          <div><span className="text-slate-500">Officer:</span> {selectedStaffId === 'all' ? 'All Officers' : userMap.get(selectedStaffId)?.name}</div>
          <div><span className="text-slate-500">Period:</span> {datePreset.replace('_', ' ').toUpperCase()}</div>
          <div><span className="text-slate-500">Total OT:</span> {summaryKpis.totalOvertimeHoursStr}</div>
          <div><span className="text-slate-500">Records:</span> {filteredSlices.length} interval(s)</div>
        </div>
      </div>

      {/* Screen Page Header (Hidden when printing) */}
      <div className="print:hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-sm shadow-red-600/20 shrink-0">
              <Clock size={22} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight">
                {t('overtimeTitle') || 'Overtime & Work Hours'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-snug">
                Completed-task work hours &amp; overtime engine (Mon–Fri 09:00–17:00 regular; after-hours &amp; Weekend Holidays 100% OT • Malaysia Time UTC+08:00)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Print Formal Report Button */}
          <button
            type="button"
            onClick={handlePrintFormalReport}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-2xs cursor-pointer"
            title="Print formal executive report or save as PDF"
          >
            <Printer size={15} className="shrink-0" />
            <span className="sm:hidden">Print</span>
            <span className="hidden sm:inline">Print Report</span>
          </button>

          {/* Enhanced Multi-Sheet Excel Export Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Download multi-sheet formatted Excel workbook (.xlsx)"
          >
            {isExportingExcel ? (
              <div className="w-4 h-4 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Download size={15} className="text-emerald-700 shrink-0" />
            )}
            <span className="sm:hidden font-bold">Export Excel</span>
            <span className="hidden sm:inline font-bold">Export Audit Excel (.xlsx)</span>
          </button>

          {canManageManualLogs && (
            <button
              type="button"
              onClick={handleOpenNewManual}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-600/20 cursor-pointer flex-1 sm:flex-initial"
            >
              <Plus size={16} className="shrink-0" />
              <span className="sm:hidden">Log Overtime</span>
              <span className="hidden sm:inline">{t('logOvertime') || 'Log Manual Overtime'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Business Policy Banner */}
      <div className="print:hidden bg-slate-900 text-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/20 text-red-400 rounded-lg shrink-0 mt-0.5">
              <Info size={18} />
            </div>
            <div className="text-xs sm:text-sm space-y-1">
              <p className="font-semibold text-white">Strict Business Calculation Rules Applied:</p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-blue-300">Weekdays (Mon–Fri):</strong> Standard hours 09:00 AM – 17:00 (5:00 PM) do not count as overtime (0 OT). Hours worked before 09:00 AM or after 17:00 (5:00 PM) are counted as Weekday Overtime.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-amber-300">Weekend Holiday (Sat &amp; Sun):</strong> 100% of all hours worked count as Weekend Overtime, regardless of the time of day.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-emerald-400">Task Timer Policy:</strong> Only <strong>Completed</strong> tasks are calculated, starting strictly from when the officer clicks <strong>Start Task</strong> until <strong>Complete</strong> (never from student communication time).
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-mono px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
            Timezone: UTC+08:00 (MYT)
          </span>
        </div>
      </div>

      {/* Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Overtime Hours */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs hover:shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {t('totalOvertime') || 'Total Overtime Hours'}
            </span>
            <div className="p-2 sm:p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
              <Clock size={18} className="sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">
              {summaryKpis.totalOvertimeHoursStr}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Across {summaryKpis.recordCount} interval(s) &bull; Total Work: {summaryKpis.totalWorkHoursStr}
          </p>
        </div>

        {/* Card 2: Weekday Overtime */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs hover:shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {t('weekdayOvertime') || 'Weekday Overtime'}
            </span>
            <div className="p-2 sm:p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Briefcase size={18} className="sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl sm:text-2xl font-extrabold text-blue-950 font-mono">
              {summaryKpis.weekdayOvertimeHoursStr}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Before 09:00 AM or after 17:00 (Mon–Fri)
          </p>
        </div>

        {/* Card 3: Weekend Holiday Overtime Hours */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs hover:shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {t('weekendOvertime') || 'Weekend Holiday OT'}
            </span>
            <div className="p-2 sm:p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
              <Coffee size={18} className="sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl sm:text-2xl font-extrabold text-amber-900 font-mono">
              {summaryKpis.weekendOvertimeHoursStr}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Weekend Holiday: Sat &amp; Sun (100% counted as OT)
          </p>
        </div>

        {/* Card 4: Standard Regular Hours */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs hover:shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {t('regularHours') || 'Standard Regular Hours'}
            </span>
            <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <CheckCircle2 size={18} className="sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">
              {summaryKpis.totalRegularHoursStr}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Standard work window (Mon–Fri, 09:00 – 17:00)
          </p>
        </div>
      </div>

      {/* Filter Toolbar Card (Print-hidden) */}
      <div className="print:hidden bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Overtime &amp; Work Hours Filter Bar</h3>
            <p className="text-xs text-slate-500 mt-0.5">Filter work intervals by logistics officer, task type, outcome, category, and date</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              <Filter size={13} />
              <span>{isFiltersExpanded ? 'Hide Filters' : 'Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs">
                <Filter size={12} />
                <span>{activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}</span>
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all cursor-pointer"
              >
                <X size={12} />
                <span>Clear All Filters</span>
              </button>
            )}
          </div>
        </div>

        <div className={`${isFiltersExpanded ? 'grid' : 'hidden md:grid'} grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3`}>
          {/* Logistics Officer Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Users size={13} className="text-red-600" />
              <span>Logistics Officer</span>
            </label>
            {isFieldOfficer ? (
              <div className="px-3 py-2 bg-slate-100 rounded-xl text-sm font-semibold text-slate-800 border border-slate-200">
                {currentUser?.name} (Personal Log)
              </div>
            ) : (
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
              >
                <option value="all">All Logistics Officers ({logisticOfficers.length})</option>
                {logisticOfficers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date Range Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-red-600" />
              <span>Date Range</span>
            </label>
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="this_month">This Month ({currentMonthLabel})</option>
              <option value="last_month">Last Month ({lastMonthLabel})</option>
              <option value="this_week">This Week</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Day Type Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Filter size={13} className="text-red-600" />
              <span>Day Type</span>
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setDayTypeFilter('all')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dayTypeFilter === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Days
              </button>
              <button
                type="button"
                onClick={() => setDayTypeFilter('weekday')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dayTypeFilter === 'weekday' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => setDayTypeFilter('weekend')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dayTypeFilter === 'weekend' ? 'bg-white text-amber-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Weekend Holiday
              </button>
            </div>
          </div>

          {/* Source Type Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Briefcase size={13} className="text-red-600" />
              <span>Source Type</span>
            </label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="all">All Sources</option>
              <option value="task">Tasks Only</option>
              <option value="manual">Manual Adjustments Only</option>
            </select>
          </div>

          {/* Task Type / Preset Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Task Type / Preset
            </label>
            <select
              value={presetFilter}
              onChange={e => setPresetFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="all">All Task Types</option>
              <option value="non_student">Non-Student Tasks</option>
              <option value="custom">Custom Tasks</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.nameEn}</option>
              ))}
            </select>
          </div>

          {/* Execution Outcome Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Execution Outcome
            </label>
            <select
              value={outcomeFilter}
              onChange={e => setOutcomeFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="all">All Outcomes</option>
              <option value="on_time">Completed On-Time</option>
              
            </select>
          </div>

          {/* Task Category Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Task Category
            </label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="student_preset">Student SOP</option>
              <option value="student_custom">Student Custom</option>
              <option value="non_student">Non-Student</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-slate-100">
          {datePreset === 'custom' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="w-full sm:w-auto min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
              <span className="text-xs text-slate-400 text-center sm:text-start">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="w-full sm:w-auto min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
            </div>
          )}

          <div className="relative flex-1 min-w-0">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search by task, student name, passport, university, staff or notes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full ps-9 pe-9 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-xs sm:text-sm font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Card & View Mode Switcher */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Navigation / Mode Toggle Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-800">
              {viewMode === 'ledger' && 'Work Intervals & Overtime Ledger'}
              {viewMode === 'officers' && 'Logistics Officers Overtime Summary'}
              {viewMode === 'chart' && 'Daily Overtime Distribution Chart'}
            </h2>
            <span className="text-xs font-mono font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200 shrink-0">
              {filteredSlices.length} record(s)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            {/* View Mode Buttons */}
            <div className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto bg-slate-200/80 p-1 rounded-xl text-xs font-semibold print:hidden">
              <button
                type="button"
                onClick={() => setViewMode('ledger')}
                className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'ledger' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Detailed Task Ledger Table"
              >
                <ListOrdered size={14} className="shrink-0" />
                <span className="sm:hidden">Ledger</span>
                <span className="hidden sm:inline">Detailed Ledger</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('officers')}
                className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'officers' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grouped Summary by Logistics Officer"
              >
                <LayoutGrid size={14} className="shrink-0" />
                <span className="sm:hidden">Officers</span>
                <span className="hidden sm:inline">Officer Summary</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'chart' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Daily Overtime Timeline Bar Chart"
              >
                <BarChart2 size={14} className="shrink-0" />
                <span className="sm:hidden">Timeline</span>
                <span className="hidden sm:inline">Daily Timeline</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex text-xs font-mono font-bold text-slate-700 bg-white px-2.5 sm:px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                Total OT: {summaryKpis.totalOvertimeHoursStr}
              </span>
              <span className="inline-flex text-xs font-mono font-semibold text-slate-600 bg-white px-2.5 sm:px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                Work Hours: {summaryKpis.totalWorkHoursStr}
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: DETAILED TASK LEDGER TABLE                             */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'ledger' && (
          filteredSlices.length === 0 ? (
            <div className="py-12 sm:py-16 px-4 text-center text-slate-500">
              <Clock size={44} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No work intervals or overtime records found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No tasks or manual overtime adjustments match your selected filters. Try broadening your date range or filters.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile & Small Tablet Card Layout (Print-Hidden) */}
              <div className="md:hidden print:hidden divide-y divide-slate-100">
                {filteredSlices.map(slice => {
                  const hasOvertime = Math.round(slice.overtimeMinutes) > 0;

                  return (
                    <div
                      key={slice.sliceId}
                      onClick={() => setSelectedSliceForDetail(slice)}
                      className={`p-3.5 sm:p-4 space-y-3 transition-colors cursor-pointer ${
                        hasOvertime ? 'bg-red-50/15 hover:bg-red-50/30' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Card Top Row: Date + Day Type vs Overtime Pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 font-mono text-xs sm:text-sm">
                              {slice.dateStr}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({slice.dayNameFull})
                            </span>
                          </div>
                          <div>
                            <SliceDayTypeBadge isWeekend={slice.isWeekend} />
                          </div>
                        </div>

                        <div className="shrink-0">
                          {hasOvertime ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-mono font-bold text-xs bg-red-100 text-red-800 border border-red-200 shadow-2xs">
                              <Clock size={12} className="text-red-600 shrink-0" />
                              <span>{formatDurationDisplay(slice.overtimeMinutes)} OT</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-xl font-mono text-[11px] text-slate-500 bg-slate-100 border border-slate-200 font-medium">
                              0 mins OT
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Task Metadata & Beneficiary */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <SliceCategoryBadge slice={slice} />
                          {slice.sourceType === 'task' && slice.status && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getTaskStatusBadgeClasses(slice.status as Task['status'])}`}>
                              {slice.status === 'in_progress' ? 'In Progress' : slice.status.replace('_', ' ')}
                            </span>
                          )}
                        </div>

                        <p className="font-semibold text-sm text-slate-800 leading-snug break-words">
                          {slice.referenceTitle}
                        </p>

                        <SliceBeneficiaryLine slice={slice} wrap />

                        {slice.notes && (
                          <p className="text-[11px] text-amber-800 italic line-clamp-2">
                            "{slice.notes}"
                          </p>
                        )}
                      </div>

                      {/* Time & Regular Breakdown Strip */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px]">
                        <div className="min-w-0">
                          <span className="block text-[10px] uppercase font-semibold text-slate-400 truncate">Time (MYT)</span>
                          <span className="font-mono font-bold text-slate-800 block truncate">
                            {slice.startTimeFormatted}–{slice.endTimeFormatted}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[10px] uppercase font-semibold text-slate-400 truncate">Total</span>
                          <span className="font-mono font-semibold text-slate-700 block truncate">
                            {formatDurationDisplay(slice.totalMinutes)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[10px] uppercase font-semibold text-slate-400 truncate">Reg (9–5)</span>
                          <span className="font-mono font-semibold text-blue-900 block truncate">
                            {formatDurationDisplay(slice.regularMinutes)}
                          </span>
                        </div>
                      </div>

                      {/* Officer & Quick Actions Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {slice.userName.charAt(0)}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 truncate">
                            {slice.userName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          {canManageManualLogs && slice.sourceType === 'manual' && slice.manualLogId && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditManual(slice.manualLogId!)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Manual Adjustment"
                                aria-label="Edit Manual Adjustment"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteManual(slice.manualLogId!)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Manual Adjustment"
                                aria-label="Delete Manual Adjustment"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedSliceForDetail(slice)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>Audit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop & Print Data Table */}
              <div className="hidden md:block print:block overflow-x-auto">
                <table className="w-full min-w-[900px] xl:min-w-0 table-fixed text-start text-xs xl:text-sm text-slate-600">
                  <colgroup>
                    <col className="w-[92px] xl:w-[96px] 2xl:w-[114px]" />
                    <col className="w-[126px] xl:w-[132px] 2xl:w-[172px]" />
                    <col className="w-[120px] xl:w-[128px] 2xl:w-[168px]" />
                    <col className="w-auto" />
                    <col className="w-[110px] xl:w-[114px] 2xl:w-[136px]" />
                    <col className="w-[82px] xl:w-[86px] 2xl:w-[110px]" />
                    <col className="w-[98px] xl:w-[104px] 2xl:w-[128px]" />
                    <col className="w-[92px] xl:w-[96px] 2xl:w-[114px] print:hidden" />
                  </colgroup>
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-tight">
                    <tr>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Date</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Day Type</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Logistics Officer</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Task & Beneficiary Details</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Actual Times (MYT)</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-start">Regular (9am–5pm)</th>
                      <th className="py-3 px-2.5 xl:px-3 2xl:px-4 text-end">Overtime Hours</th>
                      <th className="py-3 px-2 xl:px-2.5 2xl:px-3 text-center print:hidden">Audit & Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs xl:text-sm">
                    {filteredSlices.map(slice => {
                      const dayName = slice.dayNameFull;
                      const hasOvertime = Math.round(slice.overtimeMinutes) > 0;

                      return (
                        <tr
                          key={slice.sliceId}
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                            hasOvertime ? 'bg-red-50/10' : ''
                          }`}
                          onClick={() => setSelectedSliceForDetail(slice)}
                        >
                          {/* Date */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <div className="font-bold text-slate-900 font-mono whitespace-nowrap">
                              {slice.dateStr}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {dayName}
                            </div>
                          </td>

                          {/* Day Type Badge */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <SliceDayTypeBadge isWeekend={slice.isWeekend} />
                          </td>

                          {/* Logistics Officer */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {slice.userName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 truncate" title={slice.userName}>
                                  {slice.userName}
                                </div>
                                <div className="text-[10px] text-slate-400 capitalize truncate">
                                  {slice.userRole.replace('_', ' ')}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Task & Beneficiary Details */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                                {slice.sourceType === 'task' ? <CheckSquare size={13} className="text-blue-600" /> : <Clock size={13} className="text-amber-600" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <SliceCategoryBadge slice={slice} />
                                  {slice.sourceType === 'task' && slice.status && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getTaskStatusBadgeClasses(slice.status as Task['status'])}`}>
                                      {slice.status === 'in_progress' ? 'In Progress' : slice.status.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                                <p className="font-semibold text-slate-800 break-words leading-snug" title={slice.referenceTitle}>
                                  {slice.referenceTitle}
                                </p>

                                <SliceBeneficiaryLine slice={slice} wrap />

                                {slice.notes && (
                                  <p className="text-[11px] text-amber-800 italic mt-0.5 line-clamp-2 break-words">
                                    "{slice.notes}"
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Actual Start - End Time */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <div className="font-mono font-bold text-slate-800 whitespace-nowrap">
                              {slice.startTimeFormatted} – {slice.endTimeFormatted}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {formatDurationDisplay(slice.totalMinutes)} total
                            </div>
                          </td>

                          {/* Regular Hours (Mon–Fri 9am - 5pm) */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top">
                            <span className="font-mono text-slate-600 font-medium">
                              {formatDurationDisplay(slice.regularMinutes)}
                            </span>
                          </td>

                          {/* Calculated Overtime Duration */}
                          <td className="py-3.5 px-2.5 xl:px-3 2xl:px-4 align-top text-end">
                            {hasOvertime ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xl font-mono font-bold text-[11px] xl:text-xs bg-red-100 text-red-800 border border-red-200 shadow-2xs max-w-full">
                                <Clock size={12} className="text-red-600 shrink-0" />
                                <span>{formatDurationDisplay(slice.overtimeMinutes)}</span>
                              </span>
                            ) : (
                              <span className="font-mono text-xs text-slate-400 font-medium whitespace-nowrap">
                                0 mins
                              </span>
                            )}
                          </td>

                          {/* Actions & Drill-Down Pill (Print-Hidden) */}
                          <td className="py-3.5 px-2 xl:px-2.5 2xl:px-3 align-top text-center print:hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedSliceForDetail(slice)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                                title="Inspect Task & Overtime Audit Dossier"
                              >
                                <Eye size={12} />
                                <span>Audit</span>
                              </button>

                              {canManageManualLogs && slice.sourceType === 'manual' && slice.manualLogId && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEditManual(slice.manualLogId!)}
                                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                    title="Edit Manual Adjustment"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteManual(slice.manualLogId!)}
                                    className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Manual Adjustment"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: OFFICER SUMMARY CARDS (LEADERBOARD)                  */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'officers' && (
          <div className="p-3.5 sm:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {officerSummaries.map((summary, idx) => {
                const totalOtHours = summary.overtimeMins / 60;
                const totalWorkHours = summary.totalWorkMins / 60;
                const otPct = totalWorkHours > 0 ? Math.round((totalOtHours / totalWorkHours) * 100) : 0;
                const isSelected = selectedStaffId === summary.officer.id;

                return (
                  <div
                    key={summary.officer.id}
                    className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all min-w-0 ${
                      isSelected
                        ? 'border-red-500 ring-2 ring-red-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-base shrink-0">
                          {summary.officer.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 text-sm truncate">{summary.officer.name}</h4>
                          <span className="text-[11px] text-slate-400 capitalize block truncate">
                            {summary.officer.username || summary.officer.role.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Officer Overtime Metrics */}
                    <div className="grid grid-cols-2 gap-2 my-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold truncate">Overtime Duration</span>
                        <span className="text-sm sm:text-base font-extrabold text-red-600 font-mono">
                          {formatDurationDisplay(summary.overtimeMins)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold truncate">Intervals Logged</span>
                        <span className="text-sm sm:text-base font-extrabold text-slate-800 font-mono">
                          {summary.tasksCount}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Weekday Overtime:</span>
                        <span className="font-mono font-semibold text-blue-900 shrink-0">{formatDurationDisplay(summary.weekdayOtMins)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Weekend Holiday OT:</span>
                        <span className="font-mono font-semibold text-amber-900 shrink-0">{formatDurationDisplay(summary.weekendOtMins)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Regular Work (9am–5pm):</span>
                        <span className="font-mono font-semibold text-slate-700 shrink-0">{formatDurationDisplay(summary.regularMins)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Total Work Hours:</span>
                        <span className="font-mono font-semibold text-slate-900 shrink-0">{formatDurationDisplay(summary.totalWorkMins)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2 pt-1 border-t border-slate-100 font-bold">
                        <span className="text-slate-700">OT Ratio:</span>
                        <span className="font-mono text-red-600 shrink-0">{otPct}% of working time</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStaffId(summary.officer.id);
                        setViewMode('ledger');
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ListOrdered size={13} />
                      <span>View Tasks Ledger ({summary.tasksCount})</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 3: DAILY OVERTIME DISTRIBUTION TIMELINE                  */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'chart' && (
          <div className="p-3.5 sm:p-5 space-y-5 sm:space-y-6">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Day-by-Day Overtime Volume</h3>
              <p className="text-xs text-slate-500">Daily distribution of overtime hours across the filtered timeframe</p>
            </div>

            {dailyDistribution.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">No overtime data to display on chart.</p>
            ) : (
              <div className="space-y-3">
                {dailyDistribution.map(day => {
                  const maxMins = Math.max(...dailyDistribution.map(d => d.totalOtMins), 60);
                  const barWidthPct = Math.max(2, Math.min(100, (day.totalOtMins / maxMins) * 100));

                  return (
                    <div key={day.dateStr} className="space-y-1">
                      <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="font-mono font-bold text-slate-800">{day.dateStr}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            day.isWeekend ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                          }`}>
                            {day.dayName}{day.isWeekend ? ' (Weekend Holiday)' : ''}
                          </span>
                          <span className="text-slate-400 text-[11px]">({day.taskCount} interval{day.taskCount === 1 ? '' : 's'})</span>
                        </div>
                        <span className="font-mono font-bold text-red-600 shrink-0">
                          {formatDurationDisplay(day.totalOtMins)}
                        </span>
                      </div>

                      <div className="h-4 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                        <div
                          className={`h-full rounded-lg transition-all ${
                            day.isWeekend ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${barWidthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DETAILED TASK OVERTIME AUDIT DRAWER / MODAL                   */}
      {/* ------------------------------------------------------------- */}
      {selectedSliceForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedSliceForDetail(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3 sm:gap-4 shrink-0">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 break-all">
                    {selectedSliceForDetail.referenceDetail || selectedSliceForDetail.sourceId}
                  </span>
                  <SliceCategoryBadge slice={selectedSliceForDetail} fullLabel />
                  {selectedSliceForDetail.status && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase border ${getTaskStatusBadgeClasses(selectedSliceForDetail.status as Task['status'])}`}>
                      {selectedSliceForDetail.status === 'in_progress'
                        ? 'In Progress'
                        : selectedSliceForDetail.status.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words">
                  {selectedSliceForDetail.referenceTitle}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSliceForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                aria-label="Close audit dossier"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 min-h-0">
              {/* Section 1: Exact Overtime Mathematical Breakdown */}
              <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-red-600 shrink-0" />
                    <span>Calculated Overtime Slicing</span>
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    selectedSliceForDetail.isWeekend ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                  }`}>
                    {getSliceDayTypeLabel(selectedSliceForDetail)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Interval</span>
                    <span className="text-sm sm:text-base font-extrabold text-slate-900 font-mono">
                      {formatDurationDisplay(selectedSliceForDetail.totalMinutes)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Standard (9am–5pm)</span>
                    <span className="text-sm sm:text-base font-extrabold text-blue-900 font-mono">
                      {formatDurationDisplay(selectedSliceForDetail.regularMinutes)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-red-50 rounded-xl border border-red-200">
                    <span className="text-[10px] uppercase font-semibold text-red-600 block">Counted Overtime</span>
                    <span className="text-sm sm:text-base font-extrabold text-red-700 font-mono">
                      {formatDurationDisplay(selectedSliceForDetail.overtimeMinutes)}
                    </span>
                  </div>
                </div>

                {/* Mathematical Explanation */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p>
                    <strong>Execution Interval (MYT):</strong>{' '}
                    <span className="font-mono text-slate-800 break-words">
                      {selectedSliceForDetail.dateStr} ({selectedSliceForDetail.dayNameFull}) from {selectedSliceForDetail.startTimeFormatted} to {selectedSliceForDetail.endTimeFormatted}
                    </span>
                  </p>
                  {selectedSliceForDetail.sourceType === 'task' && selectedSliceForDetail.taskStartedAt && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] font-mono text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Timer Start (Start Task)</span>
                        <span>{formatMalaysiaDateTimeDisplay(selectedSliceForDetail.taskStartedAt)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-sans block text-[10px] uppercase font-semibold">Completed At</span>
                        <span>{formatMalaysiaDateTimeDisplay(selectedSliceForDetail.taskCompletedAt)}</span>
                      </div>
                      {selectedSliceForDetail.studentCommunicationMedia?.[0]?.timestamp && (
                        <div className="sm:col-span-2 pt-1 border-t border-slate-200/80 text-slate-500 font-sans">
                          First Student Contact Proof:{' '}
                          <span className="font-mono text-slate-700">
                            {formatMalaysiaDateTimeDisplay(selectedSliceForDetail.studentCommunicationMedia[0].timestamp)}
                          </span>{' '}
                          <span className="text-[10px] text-slate-400">(Reference only — timer starts strictly on Start Task)</span>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    {selectedSliceForDetail.isWeekend ? (
                      'Executed on a Weekend Holiday (Saturday/Sunday). Per company policy, 100% of duration counts as Weekend Overtime.'
                    ) : (
                      `Standard work window (Mon–Fri) is 09:00 AM – 17:00 (5:00 PM). ${formatDurationDisplay(selectedSliceForDetail.regularMinutes)} fell within standard hours, and ${formatDurationDisplay(selectedSliceForDetail.overtimeMinutes)} occurred outside 09:00–17:00 (counted as Weekday Overtime).`
                    )}
                  </p>
                </div>

                {/* 24-Hour Visual Timeline Bar */}
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-700 mb-1 block">24-Hour Day Timeline:</span>
                  <DayTimelineBar slice={selectedSliceForDetail} />
                </div>
              </div>

              {/* Section 2: Logistics Officer Dossier */}
              <div className="border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Assigned Logistics Officer
                </span>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-base shrink-0">
                    {selectedSliceForDetail.userName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{selectedSliceForDetail.userName}</h4>
                    <span className="text-xs text-slate-500 capitalize">
                      {selectedSliceForDetail.userRole.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: Beneficiary Dossier */}
              <div className="border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Beneficiary & Destination Dossier
                </span>

                {selectedSliceForDetail.studentName ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Student Full Name:</span>
                      <span className="font-bold text-slate-800 break-words">{selectedSliceForDetail.studentName}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Passport Number:</span>
                      <span className="font-mono font-bold text-slate-800 break-all">{selectedSliceForDetail.studentPassport || 'N/A'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Contact Phone:</span>
                      <span className="font-mono text-slate-800 break-all">{selectedSliceForDetail.studentPhone || 'N/A'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Service Package Tier:</span>
                      <span className="font-bold text-slate-800">{selectedSliceForDetail.studentPackage || 'Free'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">University / Institution:</span>
                      <span className="text-slate-800 break-words">{selectedSliceForDetail.studentUniversity || 'N/A'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block">Hotel / Accommodation:</span>
                      <span className="text-slate-800 break-words">{selectedSliceForDetail.hotel || 'N/A'}</span>
                    </div>
                  </div>
                ) : selectedSliceForDetail.nonStudentTitle ? (
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block">Non-Student Task Title:</span>
                      <span className="font-bold text-slate-800 break-words">{selectedSliceForDetail.nonStudentTitle}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Beneficiary / Contact Details:</span>
                      <span className="text-slate-800 break-words">{selectedSliceForDetail.nonStudentContact || 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    No individual student or beneficiary dossier is linked to this operational entry.
                  </div>
                )}
              </div>

              {/* Section 4: SOP Subtasks Checklist */}
              {selectedSliceForDetail.subTasks && selectedSliceForDetail.subTasks.length > 0 && (
                <div className="border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      SOP Checkpoints & Subtasks ({selectedSliceForDetail.subTasks.length})
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {selectedSliceForDetail.subTasks.filter(st => st.isCompleted).length} / {selectedSliceForDetail.subTasks.length} Completed
                    </span>
                  </div>

                  <div className="space-y-2">
                    {selectedSliceForDetail.subTasks.map((st, i) => (
                      <div
                        key={st.id || i}
                        className={`p-2.5 rounded-xl border text-xs flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2 sm:gap-3 ${
                          st.isCompleted ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                          <div className={`p-1 rounded-md shrink-0 ${st.isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                            <CheckCheck size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 break-words">{st.titleEn}</p>
                            {st.titleAr && <p className="text-[11px] text-slate-400 font-arabic break-words">{st.titleAr}</p>}
                          </div>
                        </div>

                        {st.completedAt && (
                          <span className="text-[11px] font-mono text-slate-500 shrink-0 ms-auto">
                            {formatMalaysiaTimeHHmm(st.completedAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 5: Operational Notes & Feedback */}
              {(selectedSliceForDetail.notes || selectedSliceForDetail.feedbackRating) && (
                <div className="border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Notes & Quality Feedback
                  </span>

                  {selectedSliceForDetail.notes && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                      <span className="font-bold block mb-1">Operational / Delay Notes:</span>
                      <p className="italic break-words">"{selectedSliceForDetail.notes}"</p>
                    </div>
                  )}

                  {selectedSliceForDetail.feedbackRating && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="font-bold block">Student CSAT Feedback:</span>
                        {selectedSliceForDetail.feedbackComment && (
                          <p className="text-slate-500 italic mt-0.5 break-words">"{selectedSliceForDetail.feedbackComment}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 font-bold text-amber-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shrink-0 self-start sm:self-center">
                        <Star size={14} className="fill-amber-500 text-amber-500" />
                        <span>{selectedSliceForDetail.feedbackRating} / 5</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSliceForDetail(null)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Close Audit Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Overtime Entry / Adjustment Modal */}
      {showManualModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!isSavingManual) setShowManualModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden shadow-2xl flex flex-col border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center gap-3 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-red-50 text-red-600 rounded-lg shrink-0">
                  <Clock size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 truncate">
                    {editingLog ? 'Edit Manual Overtime' : 'Log Manual Overtime Entry'}
                  </h2>
                  <p className="text-xs text-slate-500">Record off-shift or special emergency overtime</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                aria-label="Close manual overtime modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
                {/* Logistics Officer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Logistics Officer <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={manualFormData.userId}
                    onChange={e => setManualFormData({ ...manualFormData, userId: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
                  >
                    {logisticOfficers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shift / Work Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={manualFormData.date}
                    onChange={e => setManualFormData({ ...manualFormData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>

                {/* Time Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Start Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={manualFormData.startTime}
                      onChange={e => setManualFormData({ ...manualFormData, startTime: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      End Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={manualFormData.endTime}
                      onChange={e => setManualFormData({ ...manualFormData, endTime: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                    />
                  </div>
                </div>

                {/* Reference Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Title / Purpose <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Airport Flight Delay Escort / Emergency Support"
                    value={manualFormData.referenceTitle}
                    onChange={e => setManualFormData({ ...manualFormData, referenceTitle: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason / Justification Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide context or explanation for accounting audit..."
                    value={manualFormData.notes}
                    onChange={e => setManualFormData({ ...manualFormData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>

                {/* Live Overtime Preview */}
                {manualFormData.date && manualFormData.startTime && manualFormData.endTime && (() => {
                  try {
                    const startDate = parseMalaysiaDateTime(manualFormData.date, manualFormData.startTime);
                    let endDate = parseMalaysiaDateTime(manualFormData.date, manualFormData.endTime);
                    if (!startDate || !endDate) return null;
                    if (manualFormData.endTime <= manualFormData.startTime) {
                      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
                    }
                    const slices = sliceWorkInterval(startDate, endDate, {
                      sourceType: 'manual',
                      sourceId: 'preview',
                      userId: manualFormData.userId,
                      userName: '',
                      userRole: '',
                      referenceTitle: '',
                    });
                    const ot = slices.reduce((acc, s) => acc + s.overtimeMinutes, 0);
                    const reg = slices.reduce((acc, s) => acc + s.regularMinutes, 0);
                    const firstSlice = slices[0];

                    return (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500 font-medium">Day Type:</span>
                          <span className={`font-bold text-end ${
                            firstSlice?.isWeekend ? 'text-amber-800' : 'text-blue-700'
                          }`}>
                            {firstSlice ? getSliceDayTypeLabel(firstSlice) : 'Weekday'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500 font-medium">Regular Hours (Mon–Fri, 9am–5pm):</span>
                          <span className="font-mono font-medium text-slate-700 shrink-0">{formatDurationDisplay(reg)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 pt-1 border-t border-slate-200">
                          <span className="text-slate-700 font-bold">Calculated Overtime:</span>
                          <span className="font-mono font-bold text-red-600 text-sm shrink-0">{formatDurationDisplay(ot)}</span>
                        </div>
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>

              <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  disabled={isSavingManual}
                  className="w-full sm:w-auto px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="w-full sm:w-auto justify-center px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm shadow-red-600/20"
                >
                  {isSavingManual && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{editingLog ? 'Update Entry' : 'Save Overtime'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared day type pill for both mobile cards and desktop ledger rows. */
function SliceDayTypeBadge({ isWeekend }: { isWeekend: boolean }) {
  const Icon = isWeekend ? Coffee : Briefcase;
  const badgeClasses = isWeekend
    ? 'font-bold bg-amber-100 text-amber-900 border-amber-300'
    : 'font-semibold bg-blue-50 text-blue-700 border-blue-200';
  const label = isWeekend ? 'Weekend Holiday (100% OT)' : 'Weekday (Mon–Fri)';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] xl:text-[11px] border leading-tight max-w-full 2xl:whitespace-nowrap ${badgeClasses}`}>
      <Icon size={11} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

/** Shared interval source/category pill across ledger cards, table rows, and the audit modal. */
function SliceCategoryBadge({
  slice,
  fullLabel = false,
}: {
  slice: { sourceType: 'task' | 'manual'; taskCategory?: string; isNonStudentTask?: boolean };
  fullLabel?: boolean;
}) {
  const sizeClass = fullLabel ? 'text-xs px-2 py-0.5 rounded-md' : 'text-[10px] px-1.5 py-0.5 rounded';

  if (slice.sourceType === 'manual') {
    return (
      <span className={`font-bold bg-amber-100 text-amber-800 border border-amber-200 ${sizeClass}`}>
        {fullLabel ? 'Manual Adjustment' : 'Manual'}
      </span>
    );
  }

  if (slice.taskCategory === 'non_student' || slice.isNonStudentTask) {
    return (
      <span className={`font-bold bg-purple-50 text-purple-700 border border-purple-200 ${sizeClass}`}>
        {fullLabel ? 'Non-Student Task' : 'Non-Student'}
      </span>
    );
  }

  if (slice.taskCategory === 'student_custom') {
    return (
      <span className={`font-bold bg-amber-50 text-amber-800 border border-amber-200 ${sizeClass}`}>
        Student Custom
      </span>
    );
  }

  return (
    <span className={`font-bold bg-blue-50 text-blue-700 border border-blue-200 ${sizeClass}`}>
      Student SOP
    </span>
  );
}

/** Shared beneficiary subtitle across mobile cards and desktop ledger rows. */
function SliceBeneficiaryLine({
  slice,
  wrap = false,
}: {
  slice: {
    studentName?: string;
    studentPassport?: string;
    isNonStudentTask?: boolean;
    nonStudentTitle?: string;
    nonStudentContact?: string;
    referenceTitle: string;
    referenceDetail?: string;
  };
  wrap?: boolean;
}) {
  const textFlowClass = wrap ? 'break-words' : 'truncate';

  if (slice.studentName) {
    return (
      <p className={`text-[11px] text-slate-500 ${textFlowClass}`}>
        Student: <strong className="text-slate-700">{slice.studentName}</strong> {slice.studentPassport ? `(${slice.studentPassport})` : ''}
      </p>
    );
  }

  if (slice.isNonStudentTask) {
    const label = slice.nonStudentTitle && slice.nonStudentTitle !== slice.referenceTitle
      ? `${slice.nonStudentTitle}${slice.nonStudentContact ? ` • ${slice.nonStudentContact}` : ''}`
      : slice.nonStudentContact
      ? `Contact: ${slice.nonStudentContact}`
      : slice.referenceDetail || 'Non-Student Operation';

    return <p className={`text-[11px] text-purple-700 font-medium ${textFlowClass}`}>{label}</p>;
  }

  if (slice.referenceDetail) {
    return <p className={`text-[11px] text-slate-400 ${textFlowClass}`}>{slice.referenceDetail}</p>;
  }

  return null;
}
