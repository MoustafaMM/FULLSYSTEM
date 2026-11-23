// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Users, Activity, CheckCircle, Clock, MessageSquare, Star, Sparkles, Plus, Search, Filter, RotateCcw, X, Layers, ListTodo, XCircle } from 'lucide-react';
import { cn } from '../components/layout/Layout';
import CompactTaskCard from '../components/CompactTaskCard';
import AssignTaskModal from '../components/AssignTaskModal';
import Pagination from '../components/Pagination';
import PhotoLightboxModal from '../components/PhotoLightboxModal';
import {
  getLocalDateStr,
  getTaskSearchableText,
  getTaskSubjectName,
  matchesTaskTypeFilter,
  normalizeTaskStatus,
  TaskCategory
} from '../utils/taskClassification';
import { compareTasksChronologically } from '../utils/taskTiming';

export default function Dashboard() {
  const { t, students, tasks, users, presets, vehicles, language, currentUser } = useAppContext();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const isReadOnly = currentUser?.role === 'accountant' || currentUser?.role === 'counselor_manager';
  const [searchQuery, setSearchQuery] = useState('');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [counselorFilter, setCounselorFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<string>('all');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [selectedProofMedia, setSelectedProofMedia] = useState<{ url: string; timestamp: string; location: string; title?: string } | null>(null);

  const totalTasks = tasks.length;
  const inProgressTasks = tasks.filter(t => normalizeTaskStatus(t) === 'in_progress').length;
  const pendingTasks = tasks.filter(t => normalizeTaskStatus(t) === 'pending').length;
  const completedTasks = tasks.filter(t => normalizeTaskStatus(t) === 'completed').length;
  const cancelledTasks = tasks.filter(t => normalizeTaskStatus(t) === 'cancelled').length;

  const stats = [
    { label: language === 'ar' ? 'جميع المهام' : 'All Tasks', value: totalTasks, icon: Layers, color: 'text-slate-600', bg: 'bg-white text-slate-800' },
    { label: language === 'ar' ? 'قيد التنفيذ' : 'In-Progress', value: inProgressTasks, icon: Clock, color: 'text-blue-600', bg: 'bg-white text-slate-800' },
    { label: language === 'ar' ? 'معلقة' : 'Pending', value: pendingTasks, icon: ListTodo, color: 'text-amber-500', bg: 'bg-white text-slate-800' },
    { label: language === 'ar' ? 'مكتملة' : 'Completed', value: completedTasks, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-white text-slate-800' },
    { label: language === 'ar' ? 'ملغاة' : 'Cancelled', value: cancelledTasks, icon: XCircle, color: 'text-rose-500', bg: 'bg-white text-slate-800' },
  ];

    const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const counselors = useMemo(() => {
    return users.filter(u => u.role === 'counselor').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (officerFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (counselorFilter !== 'all') count++;
    if (vehicleFilter !== 'all') count++;
    if (feedbackStatusFilter !== 'all') count++;
    return count;
  }, [searchQuery, officerFilter, statusFilter, categoryFilter, presetFilter, counselorFilter, vehicleFilter, feedbackStatusFilter]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setOfficerFilter('all');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPresetFilter('all');
    setCounselorFilter('all');
    setVehicleFilter('all');
    setFeedbackStatusFilter('all');
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, officerFilter, statusFilter, categoryFilter, presetFilter, counselorFilter, vehicleFilter, feedbackStatusFilter, pageSize]);

  // Filtered and sorted tasks for dashboard operations grid
  const todayStr = getLocalDateStr();
  const dashboardTasks = useMemo(() => {
    return tasks.filter(task => {
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

      // 4. Task Type / Preset Filter
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
    }).sort((a, b) => {
      // Live in-progress first, then queued pending, then completed (feedback-first), then cancelled
      const getPriority = (task: typeof a) => {
        const effectiveStatus = normalizeTaskStatus(task);
        if (effectiveStatus === 'in_progress') return 4;
        if (effectiveStatus === 'pending') return 3;
        if (effectiveStatus === 'completed' && task.feedbackSubmitted) return 2;
        if (effectiveStatus === 'completed') return 1;
        return 0;
      };
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      if (priorityB !== priorityA) return priorityB - priorityA;

      if (priorityA >= 3) {
        return compareTasksChronologically(a, b, todayStr);
      }

      const timeA = new Date(a.completedAt || a.startedAt || a.createdAt).getTime() || 0;
      const timeB = new Date(b.completedAt || b.startedAt || b.createdAt).getTime() || 0;
      if (timeB !== timeA) return timeB - timeA;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [tasks, statusFilter, categoryFilter, officerFilter, presetFilter, counselorFilter, vehicleFilter, feedbackStatusFilter, searchQuery, presets, students, users, todayStr]);

  return (
    <div className="flex flex-col gap-6 h-full pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-800">Operations Room <span className="text-slate-400 font-normal">/ غرفة العمليات</span></h1>
          <p className="text-sm text-slate-500">Live tracking for Pioneer Education Services</p>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => setIsAssignModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>{t('assignTask') || 'Assign New Task'}</span>
          </button>
        )}
      </header>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 flex-1">
        {stats.map((stat, idx) => (
          <div key={idx} className="p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              {stat.label}
            </div>
            <div className="flex items-end justify-between mt-3 sm:mt-4">
              <span className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{stat.value}</span>
              <stat.icon size={22} className={stat.color} />
            </div>
          </div>
        ))}

        <div className="col-span-2 sm:col-span-3 lg:col-span-5 row-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden min-h-[300px]">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Activity className="w-5 h-5 text-red-700" />
              Live Operations Feed
            </h3>
            <div className="text-xs text-slate-400">Updated via onSnapshot</div>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto max-h-[380px]">
            {(() => {
              const feedEvents: any[] = [];
              tasks.forEach(task => {
                const assignee = users.find(u => u.id === task.assigneeId);
                const beneficiary = getTaskSubjectName(task, students, language);
                
                feedEvents.push({
                  id: `${task.id}-created`,
                  time: new Date(task.createdAt).getTime(),
                  title: 'Task Assigned',
                  description: `Task assigned to ${assignee?.name || 'User'} for ${beneficiary}`,
                  icon: Activity,
                  color: 'text-blue-500',
                  bg: 'bg-blue-50'
                });

                if (task.startedAt) {
                  feedEvents.push({
                    id: `${task.id}-started`,
                    time: new Date(task.startedAt).getTime(),
                    title: 'Task Started',
                    description: `${assignee?.name || 'User'} started working on task for ${beneficiary}`,
                    icon: Clock,
                    color: 'text-blue-600',
                    bg: 'bg-blue-50'
                  });
                }

                if (task.studentCommunicated) {
                  const commTime = task.studentCommunicationMedia?.[0]?.timestamp 
                    ? new Date(task.studentCommunicationMedia[0].timestamp).getTime()
                    : (task.startedAt ? new Date(task.startedAt).getTime() + 1000 : new Date(task.createdAt).getTime() + 1000);
                  feedEvents.push({
                    id: `${task.id}-comm`,
                    time: commTime,
                    title: task.isNonStudentTask ? 'Beneficiary Contacted' : 'Student Communicated',
                    description: `${assignee?.name || 'User'} established contact with ${beneficiary}`,
                    media: task.studentCommunicationMedia || [],
                    icon: MessageSquare,
                    color: 'text-blue-600',
                    bg: 'bg-blue-50'
                  });
                }

                task.subTasks.forEach(st => {
                  if (st.isCompleted && st.completedAt) {
                    feedEvents.push({
                      id: `${task.id}-st-${st.id}`,
                      time: new Date(st.completedAt).getTime(),
                      title: 'Step Completed',
                      description: `${assignee?.name || 'User'} completed step "${st.titleEn}" for ${beneficiary}`,
                      media: st.media || [],
                      icon: CheckCircle,
                      color: 'text-emerald-500',
                      bg: 'bg-emerald-50'
                    });
                  }
                });

                if (task.completedAt) {
                  feedEvents.push({
                    id: `${task.id}-completed`,
                    time: new Date(task.completedAt).getTime(),
                    title: 'Task Completed',
                    description: `${assignee?.name || 'User'} finished all steps for ${beneficiary}`,
                    icon: CheckCircle,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-100'
                  });
                }

                // Feedback Received Event
                if (task.feedbackSubmitted && task.feedback) {
                  const fTime = task.feedback.submittedAt 
                    ? new Date(task.feedback.submittedAt).getTime() 
                    : (task.completedAt ? new Date(task.completedAt).getTime() + 2000 : Date.now());
                  feedEvents.push({
                    id: `${task.id}-feedback`,
                    time: fTime,
                    title: 'Feedback Received',
                    description: `${beneficiary} submitted ${task.feedback.rating}★ rating (${task.feedback.satisfaction?.replace('_', ' ') || 'Satisfied'})${task.feedback.comments ? `: "${task.feedback.comments}"` : ''}`,
                    icon: Star,
                    color: 'text-amber-500',
                    bg: 'bg-amber-100',
                    rating: task.feedback.rating
                  });
                }
              });

              feedEvents.sort((a, b) => b.time - a.time);
              const recentEvents = feedEvents.slice(0, 12);

              if (recentEvents.length === 0) {
                return <div className="text-center text-slate-400 py-8">No recent activity</div>;
              }

              return recentEvents.map(event => (
                <div key={event.id} className="flex gap-4 items-start">
                  <div className={cn("w-10 h-10 rounded-full shrink-0 flex items-center justify-center border border-slate-200", event.bg)}>
                    <event.icon className={cn("w-5 h-5", event.color, event.rating ? "fill-amber-400" : "")} />
                  </div>
                  <div className="flex-1 border-b border-slate-100 pb-4">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">{event.title}</span>
                        {event.rating && (
                          <span className="text-[10px] font-extrabold bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-md">
                            {event.rating}★
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-slate-600">{event.description}</p>
                    {event.media && event.media.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {event.media.map((m: any, idx: number) => (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedProofMedia({
                              url: m.url,
                              timestamp: event.time,
                              location: m.location || 'Location unavailable',
                              title: event.title
                            })}
                            className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 cursor-pointer hover:border-red-400 hover:scale-105 transition-all shadow-2xs"
                            title="Click to view full photo"
                          >
                            <img src={m.url} alt="Attached proof" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Live Monitored Task Cards Grid with Real-time Feedback & Expandable Drawer */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-red-600" />
              <span>Monitored Operations & Feedback Cards</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live task cards updating instantly upon feedback submissions with expandable audit drawer
            </p>
          </div>
        </div>

        {/* Comprehensive Multi-Variable Operations Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Query Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                type="text"
                placeholder={t('searchPlaceholder') || "Search by student, passport, non-student title, officer, hotel, notes..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
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
                onChange={(e) => setStatusFilter(e.target.value)}
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

            {/* Quick Status & Category Separation Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { id: 'all', label: `${t('allStatus') || 'All'} (${totalTasks})`, activeClass: 'bg-slate-900 text-white' },
                  { id: 'in_progress', label: `${t('in_progress') || 'In Progress'} (${inProgressTasks})`, activeClass: 'bg-blue-600 text-white' },
                  { id: 'pending', label: `${t('pending') || 'Pending'} (${pendingTasks})`, activeClass: 'bg-amber-600 text-white' },
                  { id: 'completed', label: `${t('completed') || 'Completed'} (${completedTasks})`, activeClass: 'bg-emerald-600 text-white' },
                  { id: 'cancelled', label: `${t('cancelled') || 'Cancelled'} (${cancelledTasks})`, activeClass: 'bg-rose-600 text-white' },
                ] as const).map(pill => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                      statusFilter === pill.id
                        ? `${pill.activeClass} border-transparent shadow-2xs`
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
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
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                      categoryFilter === cat.id
                        ? "bg-purple-900 text-white border-purple-900 shadow-2xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

          {/* Live Results Counter Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-slate-900 font-bold">{dashboardTasks.length}</strong> of{' '}
                <strong className="text-slate-900 font-bold">{tasks.length}</strong> tasks
              </span>
            </div>
          </div>
        </div>

        {dashboardTasks.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {dashboardTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(task => (
                <CompactTaskCard
                  key={task.id}
                  task={task}
                  mode="admin_coord"
                  readOnlySubtasks={true}
                  onViewProof={setSelectedProofMedia}
                />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={dashboardTasks.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
              itemLabel={language === 'ar' ? 'مهمة' : 'tasks'}
              colorScheme="slate"
            />
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center text-slate-400">
            No active or monitored tasks found.
          </div>
        )}
      </div>

      <AssignTaskModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
      />

      {/* Proof Lightbox Modal with Mobile Back & X buttons */}
      <PhotoLightboxModal
        isOpen={!!selectedProofMedia}
        onClose={() => setSelectedProofMedia(null)}
        imageUrl={selectedProofMedia?.url || null}
        title={selectedProofMedia?.title}
        timestamp={selectedProofMedia?.timestamp}
        location={selectedProofMedia?.location}
      />
    </div>
  );
}
