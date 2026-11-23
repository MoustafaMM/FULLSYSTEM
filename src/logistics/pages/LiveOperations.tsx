// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Activity,
  Search,
  Filter, 
  MapPin, 
  User, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Calendar, 
  Hotel, 
  Car, 
  AlertCircle, 
  Edit, 
  X, 
  Star, 
  Mail, 
  CalendarX2, 
  RotateCcw,
  Layers,
  Plus,
  ClipboardList,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react';
import { format, startOfDay, isToday } from 'date-fns';
import toast from 'react-hot-toast';
import { Task } from '../types';
import { cn } from '../components/layout/Layout';
import { resolveExpenseVehicle } from '../utils/vehicleDetection';
import { sortTasksForDay, TaskDaySortOrder } from '../utils/taskTiming';
import {
  getLocalDateStr,
  getTaskScheduleBucket,
  getTaskSearchableText,
  hasPresetTemplate,
  isOpenTask,
  matchesTaskTypeFilter,
  normalizeTaskStatus,
  TaskCategory
} from '../utils/taskClassification';
import HorizontalWeeklyCalendar from '../components/HorizontalWeeklyCalendar';
import CompactTaskCard from '../components/CompactTaskCard';
import AssignTaskModal, { AssignTaskInitialData } from '../components/AssignTaskModal';
import EditTaskModal from '../components/EditTaskModal';
import DeleteTaskConfirmModal from '../components/DeleteTaskConfirmModal';
import PhotoLightboxModal from '../components/PhotoLightboxModal';

export default function LiveOperations() {
  const { 
    t, 
    tasks, 
    students, 
    users, 
    vehicles, 
    presets,
    currentUser, 
    taskRequests,
    updateTaskAssignee, 
    updateTaskStatus, 
    updateTaskRequestStatus,
    deleteTask,
    language 
  } = useAppContext();
  const isReadOnly = currentUser?.role === 'accountant';
  const isCoordinatorOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'coordinator';
  const isAdmin = currentUser?.role === 'admin';
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'pending' | 'completed' | 'cancelled'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [counselorFilter, setCounselorFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<TaskDaySortOrder>('chronological');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignInitialData, setAssignInitialData] = useState<AssignTaskInitialData | undefined>(undefined);
  const [isRequestsCollapsed, setIsRequestsCollapsed] = useState(false);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; timestamp: string; location: string; title?: string; vehicleLabel?: string } | null>(null);

  const pendingRequests = useMemo(() => {
    return (taskRequests || []).filter(r => r.status === 'pending_approval');
  }, [taskRequests]);

  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '--';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMins = Math.floor((endTime - startTime) / 60000);
    if (diffMins < 0) return '0m';
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  };

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = getLocalDateStr();
  const isViewingToday = selectedDateStr === todayStr;

  // Aggregated task count per date for horizontal calendar badges
  const taskCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(task => {
      const dates = new Set<string>();
      if (task.taskDate) {
        dates.add(task.taskDate);
      } else if (task.createdAt) {
        try {
          dates.add(format(new Date(task.createdAt), 'yyyy-MM-dd'));
        } catch (e) {
          // ignore parsing error
        }
      }
      if (task.startedAt) {
        try {
          dates.add(format(new Date(task.startedAt), 'yyyy-MM-dd'));
        } catch (e) {
          // ignore parsing error
        }
      }
      if (task.completedAt) {
        try {
          dates.add(format(new Date(task.completedAt), 'yyyy-MM-dd'));
        } catch (e) {
          // ignore parsing error
        }
      }
      dates.forEach(d => {
        counts[d] = (counts[d] || 0) + 1;
      });
    });
    return counts;
  }, [tasks]);

  // Tasks scheduled for, executed on, or created on the selected date.
  // When viewing Today, also include open overdue carried-over and open unscheduled tasks
  // so old unfinished tasks remain visible in their own separated queues instead of disappearing.
  const tasksForSelectedDate = useMemo(() => {
    return tasks.filter(task => {
      if (task.taskDate === selectedDateStr) return true;
      if (!task.taskDate && task.createdAt) {
        try {
          if (format(new Date(task.createdAt), 'yyyy-MM-dd') === selectedDateStr) return true;
        } catch (e) {}
      }
      if (task.startedAt) {
        try {
          if (format(new Date(task.startedAt), 'yyyy-MM-dd') === selectedDateStr) return true;
        } catch (e) {}
      }
      if (task.completedAt) {
        try {
          if (format(new Date(task.completedAt), 'yyyy-MM-dd') === selectedDateStr) return true;
        } catch (e) {}
      }
      if (isViewingToday && isOpenTask(task)) {
        const bucket = getTaskScheduleBucket(task, todayStr);
        if (bucket === 'overdue' || bucket === 'unscheduled') return true;
      }
      return false;
    });
  }, [tasks, selectedDateStr, isViewingToday, todayStr]);

  // Status counts for the selected date
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: tasksForSelectedDate.length,
      in_progress: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
    };
    tasksForSelectedDate.forEach(task => {
      const status = normalizeTaskStatus(task);
      if (counts[status] !== undefined) {
        counts[status] += 1;
      }
    });
    return counts;
  }, [tasksForSelectedDate]);

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const counselors = useMemo(() => {
    return users.filter(u => u.role === 'counselor').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (statusFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (officerFilter !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (counselorFilter !== 'all') count++;
    if (vehicleFilter !== 'all') count++;
    if (feedbackStatusFilter !== 'all') count++;
    return count;
  }, [searchQuery, statusFilter, categoryFilter, officerFilter, presetFilter, counselorFilter, vehicleFilter, feedbackStatusFilter]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setOfficerFilter('all');
    setPresetFilter('all');
    setCounselorFilter('all');
    setVehicleFilter('all');
    setFeedbackStatusFilter('all');
  };

  // Filtered and sorted tasks for view (default: chronological order for selected date)
  const filteredTasks = useMemo(() => {
    const filtered = tasksForSelectedDate.filter(task => {
        // 1. Status Filter
        if (statusFilter !== 'all' && normalizeTaskStatus(task) !== statusFilter) return false;

        // 2. Category Axis Filter
        if (categoryFilter !== 'all' && !matchesTaskTypeFilter(task, categoryFilter)) return false;

        // 3. Logistics Officer Filter
        if (officerFilter !== 'all') {
          if (officerFilter === 'unassigned') {
            if (task.assigneeId) return false;
          } else if (task.assigneeId !== officerFilter) {
            return false;
          }
        }

        // 4. Task Type / Preset Filter (handles omitted presetId and legacy 'custom')
        if (presetFilter !== 'all' && !matchesTaskTypeFilter(task, presetFilter)) {
          return false;
        }

        // 5. Counselor Filter
        if (counselorFilter !== 'all') {
          if (!task.studentId || task.isNonStudentTask) return false;
          const student = students.find(s => s.id === task.studentId);
          if (!student) return false;
          if (student.counselorId !== counselorFilter && student.counselor !== counselorFilter) return false;
        }

        // 6. Vehicle Filter
        if (vehicleFilter !== 'all' && task.vehicleId !== vehicleFilter) return false;

        // 7. Feedback Status Filter
        if (feedbackStatusFilter !== 'all') {
          if (feedbackStatusFilter === 'submitted') {
            if (!task.feedbackSubmitted) return false;
          } else if (feedbackStatusFilter === 'pending_reply') {
            if (!task.feedbackEmailSent || task.feedbackSubmitted) return false;
          } else if (feedbackStatusFilter === 'not_sent') {
            if (task.feedbackEmailSent || task.feedbackSubmitted) return false;
          }
        }

        // 8. Search Query Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          if (!getTaskSearchableText(task, presets, students, users).includes(q)) {
            return false;
          }
        }

        return true;
      });

    return sortTasksForDay(filtered, selectedDateStr, sortOrder);
  }, [tasksForSelectedDate, selectedDateStr, sortOrder, statusFilter, categoryFilter, officerFilter, presetFilter, counselorFilter, vehicleFilter, feedbackStatusFilter, searchQuery, presets, students, users]);

  // Separated stage & schedule sections for crystal-clear visual isolation
  const separatedTaskSections = useMemo(() => {
    const inProgress = filteredTasks.filter(t => normalizeTaskStatus(t) === 'in_progress');
    const overduePending = filteredTasks.filter(
      t => normalizeTaskStatus(t) === 'pending' && Boolean(t.taskDate && t.taskDate < selectedDateStr)
    );
    const scheduledPending = filteredTasks.filter(
      t => normalizeTaskStatus(t) === 'pending' && Boolean(t.taskDate && t.taskDate >= selectedDateStr)
    );
    const unscheduledPending = filteredTasks.filter(t => normalizeTaskStatus(t) === 'pending' && !t.taskDate);
    const completed = filteredTasks.filter(t => normalizeTaskStatus(t) === 'completed');
    const cancelled = filteredTasks.filter(t => normalizeTaskStatus(t) === 'cancelled');

    return [
      {
        key: 'in_progress',
        title: t('sectionInProgressNow') || 'In Progress Now',
        subtitle: 'Actively started by a field officer with live timer running',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
        items: inProgress,
      },
      {
        key: 'overdue',
        title: t('sectionOverdueCarriedOver') || 'Overdue / Carried Over',
        subtitle: 'Open pending tasks scheduled before this date',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
        items: overduePending,
      },
      {
        key: 'scheduled_pending',
        title: t('sectionScheduledPending') || 'Scheduled Pending',
        subtitle: 'Queued for this date and not started yet',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        items: scheduledPending,
      },
      {
        key: 'unscheduled_pending',
        title: t('sectionUnscheduledOpen') || 'Unscheduled Open',
        subtitle: 'Open pending tasks with no scheduled date assigned yet',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-400',
        items: unscheduledPending,
      },
      {
        key: 'completed',
        title: t('sectionCompleted') || 'Completed',
        subtitle: 'Finished missions with audit trail',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        items: completed,
      },
      {
        key: 'cancelled',
        title: t('sectionCancelled') || 'Cancelled',
        subtitle: 'Cancelled tasks excluded from active workload & overtime',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-400',
        items: cancelled,
      },
    ].filter(sec => sec.items.length > 0);
  }, [filteredTasks, selectedDateStr, t]);

  const handleConfirmDelete = async (taskToDelete: Task) => {
    if (!isAdmin) {
      toast.error('Only administrators can delete tasks.');
      return;
    }
    setIsDeleting(true);
    try {
      await deleteTask(taskToDelete.id);
      toast.success(t('taskDeletedSuccess') || 'Task deleted successfully');
      setDeletingTask(null);
      if (editingTask?.id === taskToDelete.id) {
        setEditingTask(null);
      }
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      toast.error(err.message || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedDateTitle = useMemo(() => {
    return format(selectedDate, 'EEEE, MMMM d, yyyy');
  }, [selectedDate]);

  return (
    <div className="space-y-6 relative">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('operationsRoom')}</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            {isToday(selectedDate) ? `Live Mission Control • ${t('today')}` : `Mission Control Log • ${format(selectedDate, 'MMM d, yyyy')}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Date Indicator */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200">
            <Calendar size={14} className="text-red-600" />
            <span>{formattedDateTitle}</span>
          </div>

          {/* Assign Task Action Button */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => {
                setAssignInitialData(undefined);
                setIsAssignModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>{t('assignTask') || 'Assign New Task'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Counselor Task Requests Queue Banner */}
      {!isReadOnly && pendingRequests.length > 0 && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 rounded-3xl p-4 sm:p-5 text-white shadow-xl border border-purple-800/60 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center justify-center shrink-0">
                <ClipboardList size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base tracking-tight">Counselor Task Requests Queue</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-purple-500 text-white shadow-xs">
                    {pendingRequests.length} Pending
                  </span>
                </div>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  Academic counselors requested field operations for their assigned students
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsRequestsCollapsed(!isRequestsCollapsed)}
              className="text-xs text-purple-300 hover:text-white font-semibold transition-colors flex items-center gap-1 self-end sm:self-auto cursor-pointer"
            >
              <span>{isRequestsCollapsed ? 'Expand Requests' : 'Hide Queue'}</span>
              <ChevronDown size={14} className={cn("transition-transform duration-200", isRequestsCollapsed ? "-rotate-90" : "")} />
            </button>
          </div>

          {!isRequestsCollapsed && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-3">
              {pendingRequests.map(req => {
                const student = students.find(s => s.id === req.studentId);
                const preset = req.presetId && req.presetId !== 'custom' ? presets.find(p => p.id === req.presetId) : undefined;
                const reqTitle = req.customTitle || preset?.nameEn || 'Logistics Service';

                return (
                  <div 
                    key={req.id} 
                    className="p-3.5 bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col justify-between gap-3 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-purple-400 text-purple-950 uppercase tracking-wider">
                          {reqTitle}
                        </span>
                        <span className="text-[10px] text-purple-300 font-mono">
                          {format(new Date(req.createdAt), 'MMM dd, HH:mm')}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-sm text-white">
                        {student?.fullName || 'Assigned Student'}
                      </h4>
                      <p className="text-xs text-purple-200 mt-0.5">
                        Requested by counselor: <span className="font-bold text-white">{req.counselorName}</span>
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-purple-200/90 mt-2">
                        {req.requestedDate && (
                          <span className="flex items-center gap-1">
                            <Calendar size={13} className="text-purple-300" />
                            {req.requestedDate}
                          </span>
                        )}
                        {req.requestedTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={13} className="text-purple-300" />
                            {req.requestedTime}
                          </span>
                        )}
                        {student?.university && (
                          <span className="flex items-center gap-1">
                            <MapPin size={13} className="text-purple-300" />
                            {student.university}
                          </span>
                        )}
                      </div>

                      {req.notes && (
                        <div className="mt-2 text-xs bg-black/20 p-2 rounded-xl text-purple-100 font-medium italic border border-white/5">
                          "{req.notes}"
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={async () => {
                          const reason = window.prompt('Optional rejection reason for counselor:');
                          if (reason !== null) {
                            try {
                              await updateTaskRequestStatus(req.id, 'rejected', { rejectionReason: reason.trim() || undefined });
                            } catch (e: any) {
                              console.error('Failed to reject request:', e);
                            }
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAssignInitialData({
                            studentId: req.studentId,
                            isNonStudentTask: false,
                            presetId: req.presetId,
                            customTitle: req.customTitle,
                            taskDate: req.requestedDate,
                            taskTime: req.requestedTime,
                            notes: req.notes,
                            requestId: req.id
                          });
                          setIsAssignModalOpen(true);
                        }}
                        className="px-4 py-1.5 text-xs font-black text-white bg-red-600 hover:bg-red-500 active:scale-95 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Approve & Assign</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

            {/* Comprehensive Multi-Variable Operations Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Query Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              placeholder={t('searchPlaceholder') || "Search by student, passport, non-student title, officer, hotel, notes..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Active Filter Count Badge & Reset Action */}
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
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
                <RotateCcw size={12} />
                <span>Clear All Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Multi-attribute Filter Dropdowns */}
        <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1", isFiltersExpanded ? "grid" : "hidden md:grid")}>
          {/* Logistics Officer Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Logistics Officer
            </label>
            <select
              value={officerFilter}
              onChange={(e) => setOfficerFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Field Officers</option>
              <option value="unassigned">Unassigned</option>
              {fieldOfficers.map(officer => (
                <option key={officer.id} value={officer.id}>{officer.name}</option>
              ))}
            </select>
          </div>

          {/* Task Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Task Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{t('allStatus') || 'All Statuses'}</option>
              <option value="pending">{t('pending') || 'Pending'}</option>
              <option value="in_progress">{t('in_progress') || 'In Progress'}</option>
              <option value="completed">{t('completed') || 'Completed'}</option>
              <option value="cancelled">{t('cancelled') || 'Cancelled'}</option>
            </select>
          </div>

          {/* Task Type / Preset Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Task Type / Preset
            </label>
            <select
              value={presetFilter}
              onChange={(e) => setPresetFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Task Types</option>
              <option value="non_student">Non-Student Task</option>
              <option value="custom">Custom Task</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{language === 'ar' && p.nameAr ? p.nameAr : p.nameEn}</option>
              ))}
            </select>
          </div>

          {/* Assigned Counselor Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Assigned Counselor
            </label>
            <select
              value={counselorFilter}
              onChange={(e) => setCounselorFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Counselors</option>
              {counselors.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Vehicle Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Vehicle
            </label>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.plateNumber})</option>
              ))}
            </select>
          </div>

          {/* Feedback Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Feedback Status
            </label>
            <select
              value={feedbackStatusFilter}
              onChange={(e) => setFeedbackStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Feedback</option>
              <option value="submitted">Feedback Submitted</option>
              <option value="pending_reply">Email Sent - Pending Reply</option>
              <option value="not_sent">Not Sent</option>
            </select>
          </div>
        </div>

        {/* Live Results Counter & Sort Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900 font-bold">{filteredTasks.length}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{tasksForSelectedDate.length}</strong> tasks for selected date
            </span>
            <span className="text-[11px] text-slate-400">({tasks.length} total platform tasks)</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <label
              htmlFor="live-ops-sort"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0"
            >
              <ArrowUpDown size={12} />
              <span>Sort:</span>
            </label>
            <select
              id="live-ops-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as TaskDaySortOrder)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer"
            >
              <option value="chronological">Chronological (Earliest First)</option>
              <option value="reverse_chronological">Latest First</option>
              <option value="recent_activity">Recent Activity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Horizontal Weekly Calendar Component */}
      <HorizontalWeeklyCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        taskCountsByDate={taskCountsByDate}
      />

      {/* Secondary Status & Category Separation Bars + View Mode Toggle */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Layers size={14} />
            <span>{t('status')}:</span>
          </div>

          <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-xs overflow-x-auto max-w-full gap-1">
            <button 
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all' 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t('allStatus')} ({statusCounts.all})
            </button>
            <button 
              type="button"
              onClick={() => setStatusFilter('in_progress')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'in_progress' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {t('in_progress')} ({statusCounts.in_progress})
            </button>
            <button 
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'pending' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              {t('pending')} ({statusCounts.pending})
            </button>
            <button 
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'completed' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              {t('completed')} ({statusCounts.completed})
            </button>
            <button 
              type="button"
              onClick={() => setStatusFilter('cancelled')}
              className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'cancelled' 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-rose-50 hover:text-rose-700'
              }`}
            >
              {t('cancelled') || 'Cancelled'} ({statusCounts.cancelled})
            </button>
          </div>
        </div>

        {/* Category Separation & Layout Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-white rounded-xl border border-slate-200 p-1 shadow-xs overflow-x-auto max-w-full">
            {([
              { id: 'all', label: t('allCategories') || 'All Categories' },
              { id: 'student_preset', label: t('studentPresetCategory') || 'Student SOP' },
              { id: 'student_custom', label: t('studentCustomCategory') || 'Student Custom' },
              { id: 'non_student', label: t('nonStudentCategory') || 'Non-Student' },
            ] as const).map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`whitespace-nowrap px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'grouped' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Separated Sections
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'flat' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Flat Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Task Cards Grid or Empty State */}
      {filteredTasks.length > 0 ? (
        viewMode === 'grouped' ? (
          <div className="space-y-6">
            {separatedTaskSections.map(section => (
              <div key={section.key} className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 px-1 pb-2 border-b border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${section.badgeClass}`}>
                      <span className={`w-2 h-2 rounded-full ${section.dotClass}`} />
                      <span>{section.title}</span>
                      <span className="ml-0.5 font-black">({section.items.length})</span>
                    </span>
                    <span className="text-xs text-slate-500 hidden sm:inline">{section.subtitle}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {section.items.map(task => (
                    <CompactTaskCard
                      key={task.id}
                      task={task}
                      mode="admin_coord"
                      readOnlySubtasks={true}
                      onEditTask={isCoordinatorOrAdmin ? (t) => setEditingTask(t) : undefined}
                      onDeleteTask={isAdmin ? (t) => setDeletingTask(t) : undefined}
                      onViewProof={(media) => setSelectedMedia(media)}
                      onViewReceipt={(exp) => {
                        const expVeh = resolveExpenseVehicle(exp, vehicles);
                        setSelectedMedia({
                          url: exp.receiptUrl,
                          timestamp: exp.timestamp,
                          location: exp.location || 'Location unavailable',
                          title: `Expense Receipt (${exp.category} - RM ${exp.amount})`,
                          vehicleLabel: expVeh?.label
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredTasks.map(task => (
              <CompactTaskCard
                key={task.id}
                task={task}
                mode="admin_coord"
                readOnlySubtasks={true}
                onEditTask={isCoordinatorOrAdmin ? (t) => setEditingTask(t) : undefined}
                onDeleteTask={isAdmin ? (t) => setDeletingTask(t) : undefined}
                onViewProof={(media) => setSelectedMedia(media)}
                onViewReceipt={(exp) => {
                  const expVeh = resolveExpenseVehicle(exp, vehicles);
                  setSelectedMedia({
                    url: exp.receiptUrl,
                    timestamp: exp.timestamp,
                    location: exp.location || 'Location unavailable',
                    title: `Expense Receipt (${exp.category} - RM ${exp.amount})`,
                    vehicleLabel: expVeh?.label
                  });
                }}
              />
            ))}
          </div>
        )
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 text-center max-w-2xl mx-auto my-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-xs">
            <CalendarX2 size={32} />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
            {tasksForSelectedDate.length === 0 
              ? `${t('noTasksForDate')} ${format(selectedDate, 'MMMM d, yyyy')}`
              : `No ${statusFilter.replace('_', ' ')} tasks for ${format(selectedDate, 'MMM d, yyyy')}`}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            {tasksForSelectedDate.length === 0 
              ? t('noTasksScheduledDesc')
              : 'Try selecting a different status filter above to view all tasks scheduled for this date.'}
          </p>
          
          <div className="flex items-center justify-center gap-3">
            {!isToday(selectedDate) && (
              <button
                type="button"
                onClick={() => setSelectedDate(startOfDay(new Date()))}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <RotateCcw size={14} />
                <span>Jump to Today</span>
              </button>
            )}
            {statusFilter !== 'all' && tasksForSelectedDate.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-all"
              >
                <span>Show All Statuses</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detailed Edit Task Modal */}
      {isCoordinatorOrAdmin && editingTask && (
        <EditTaskModal
          isOpen={!!editingTask}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onTaskUpdated={() => {
            setEditingTask(null);
          }}
          onRequestDelete={isAdmin ? (taskToDelete) => {
            setDeletingTask(taskToDelete);
          } : undefined}
        />
      )}

      {/* Delete Task Confirmation Modal */}
      {isAdmin && deletingTask && (
        <DeleteTaskConfirmModal
          isOpen={!!deletingTask}
          task={deletingTask}
          onClose={() => setDeletingTask(null)}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}

      {/* Proof Lightbox Modal with Mobile-Optimized Back & X buttons */}
      <PhotoLightboxModal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        imageUrl={selectedMedia?.url || null}
        title={selectedMedia?.title}
        timestamp={selectedMedia?.timestamp}
        location={selectedMedia?.location}
        vehicleLabel={selectedMedia?.vehicleLabel}
      />

      {/* Assign / Create Task Modal */}
      <AssignTaskModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setAssignInitialData(undefined);
        }}
        initialData={assignInitialData}
      />
    </div>
  );
}
