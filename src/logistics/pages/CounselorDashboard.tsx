// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Student, Task, TaskRequest } from '../types';
import { 
  GraduationCap, 
  Search, 
  Filter, 
  RotateCcw, 
  MapPin, 
  Phone, 
  Calendar, 
  Clock, 
  Hotel, 
  Car, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  FileText, 
  X, 
  MessageSquareText, 
  ChevronRight, 
  Loader2, 
  Plus, 
  ListTodo, 
  Users, 
  CheckSquare, 
  Send, 
  Star, 
  Eye, 
  Camera, 
  ExternalLink,
  Plane,
  Building,
  ShieldCheck,
  Check,
  MessageCircle,
  Sparkles,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';
import { format, isToday, isTomorrow, isThisWeek, parseISO, differenceInDays } from 'date-fns';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import toast from 'react-hot-toast';
import RequestTaskModal from '../components/RequestTaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import PhotoLightboxModal from '../components/PhotoLightboxModal';
import StudentDossierModal from '../components/StudentDossierModal';
import Pagination from '../components/Pagination';
import { compareTasksChronologically, getTaskSlaInfo } from '../utils/taskTiming';
import { getTaskStepMetrics, getTaskAllProofs, getTaskDisplaySteps } from '../utils/taskSteps';
import {
  TaskCategory,
  getLocalDateStr,
  getTaskCategory,
  getTaskScheduleBucket,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  isOpenTask,
  matchesTaskTypeFilter,
  normalizeTaskStatus,
} from '../utils/taskClassification';

interface CounselorDashboardProps {
  initialTab?: 'students' | 'tasks' | 'requests';
  onSelectStudent?: (id: string) => void;
  onNavigate?: (view: string) => void;
}

export default function CounselorDashboard({ initialTab = 'students', onSelectStudent, onNavigate }: CounselorDashboardProps) {
  const { currentUser, students, tasks, presets, vehicles, users, taskRequests, t, language } = useAppContext();
  
  // Navigation Active Tab
  const [activeTab, setActiveTab] = useState<'students' | 'tasks' | 'requests'>(initialTab);
  const [studentViewMode, setStudentViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Firestore scoping
  const [scopedStudents, setScopedStudents] = useState<Student[]>([]);
  const [loadedCounselorId, setLoadedCounselorId] = useState<string | null>(null);

  // Modals state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<string | undefined>(undefined);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);
  const [selectedStudentForDossier, setSelectedStudentForDossier] = useState<Student | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string; timestamp?: string; location?: string } | null>(null);

  // Expanded task checklist states (taskId -> boolean)
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  // Remarks auto-save state (studentId -> string)
  const [remarksState, setRemarksState] = useState<Record<string, string>>({});
  const [remarksSaving, setRemarksSaving] = useState<Record<string, boolean>>({});
  const [remarksSavedIndicator, setRemarksSavedIndicator] = useState<Record<string, boolean>>({});

  // -------------------------------------------------------------
  // Filter States: Students Tab
  // -------------------------------------------------------------
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [packageFilter, setPackageFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [nationalityFilter, setNationalityFilter] = useState<string>('all');
  const [universityFilter, setUniversityFilter] = useState<string>('all');
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // -------------------------------------------------------------
  // Filter States: Tasks Tab
  // -------------------------------------------------------------
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('all');
  const [taskDateQuickFilter, setTaskDateQuickFilter] = useState<'all' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'unscheduled' | 'past'>('all');
  const [taskStudentFilter, setTaskStudentFilter] = useState<string>('all');
  const [taskOfficerFilter, setTaskOfficerFilter] = useState<string>('all');
  const [taskPresetFilter, setTaskPresetFilter] = useState<string>('all');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<'all' | TaskCategory>('all');

  // -------------------------------------------------------------
  // Filter States: Requests Tab
  // -------------------------------------------------------------
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');
  const [requestSearchTerm, setRequestSearchTerm] = useState('');

  // -------------------------------------------------------------
  // Pagination States (Dashboard Pagination, not infinity scroll)
  // -------------------------------------------------------------
  const [studentPage, setStudentPage] = useState<number>(1);
  const [studentPageSize, setStudentPageSize] = useState<number>(8);

  const [taskPage, setTaskPage] = useState<number>(1);
  const [taskPageSize, setTaskPageSize] = useState<number>(8);

  const [requestPage, setRequestPage] = useState<number>(1);
  const [requestPageSize, setRequestPageSize] = useState<number>(10);

  // Reset page numbers when filters change
  useEffect(() => {
    setStudentPage(1);
  }, [studentSearchTerm, officerFilter, packageFilter, categoryFilter, programFilter, nationalityFilter, universityFilter, studentStatusFilter, fromDate, toDate, studentPageSize]);

  useEffect(() => {
    setTaskPage(1);
  }, [taskSearchTerm, taskStatusFilter, taskStudentFilter, taskOfficerFilter, taskPresetFilter, taskCategoryFilter, taskDateQuickFilter, taskPageSize]);

  useEffect(() => {
    setRequestPage(1);
  }, [requestStatusFilter, requestSearchTerm, requestPageSize]);

  const counselorId = currentUser?.role === 'counselor' ? currentUser.id : null;

  // Strict Firestore query scoped to active counselor
  useEffect(() => {
    if (!counselorId) {
      setScopedStudents([]);
      setLoadedCounselorId(null);
      return;
    }

    let isMounted = true;
    const q = query(
      collection(db, 'students'),
      where('counselorId', '==', counselorId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMounted) return;
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setScopedStudents(fetched);
        setLoadedCounselorId(counselorId);
      },
      (error) => {
        console.error('Error fetching scoped students in CounselorDashboard:', error);
        if (isMounted) {
          setLoadedCounselorId(counselorId);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [counselorId]);

  // Merge context students and scoped students for this counselor
  const myStudents = useMemo(() => {
    if (!counselorId) return [];
    const byId = new Map<string, Student>();
    for (const s of students) {
      if (s.counselorId === counselorId || s.counselor === counselorId) {
        byId.set(s.id, s);
      }
    }
    for (const s of scopedStudents) {
      byId.set(s.id, s);
    }
    return Array.from(byId.values());
  }, [counselorId, students, scopedStudents]);

  const myStudentIds = useMemo(() => new Set(myStudents.map(s => s.id)), [myStudents]);

  const todayStr = getLocalDateStr();

  // All tasks belonging to counselor's assigned students
  const myTasks = useMemo(() => {
    const getPriority = (task: Task) => {
      const status = normalizeTaskStatus(task);
      if (status === 'in_progress') return 3;
      if (status === 'pending') return 2;
      if (status === 'completed') return 1;
      return 0;
    };
    return tasks
      .filter(t => t.studentId && myStudentIds.has(t.studentId))
      .sort((a, b) => {
        const priorityA = getPriority(a);
        const priorityB = getPriority(b);
        if (priorityB !== priorityA) return priorityB - priorityA;
        if (priorityA >= 2) {
          return compareTasksChronologically(a, b, todayStr);
        }
        const timeA = new Date(a.completedAt || a.startedAt || a.createdAt).getTime() || 0;
        const timeB = new Date(b.completedAt || b.startedAt || b.createdAt).getTime() || 0;
        if (timeB !== timeA) return timeB - timeA;
        return (a.id || '').localeCompare(b.id || '');
      });
  }, [tasks, myStudentIds, todayStr]);

  // All task requests submitted by this counselor or targeting this counselor's students
  const myTaskRequests = useMemo(() => {
    return (taskRequests || [])
      .filter(r => r.counselorId === currentUser?.id || (r.studentId && myStudentIds.has(r.studentId)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [taskRequests, currentUser, myStudentIds]);

  // Sync initial remarks state
  useEffect(() => {
    const map: Record<string, string> = {};
    myStudents.forEach(s => {
      if (s.counselorRemarks !== undefined) {
        map[s.id] = s.counselorRemarks;
      }
    });
    setRemarksState(prev => ({ ...map, ...prev }));
  }, [myStudents]);

  const handleSaveRemarks = async (studentId: string, customVal?: string) => {
    const val = customVal !== undefined ? customVal : (remarksState[studentId] || '');
    const currentStudent = myStudents.find(s => s.id === studentId);
    if (!currentStudent || val.trim() === (currentStudent.counselorRemarks || '').trim()) {
      return;
    }

    setRemarksSaving(prev => ({ ...prev, [studentId]: true }));
    try {
      await updateDoc(doc(db, 'students', studentId), {
        counselorRemarks: val.trim()
      });
      setRemarksSavedIndicator(prev => ({ ...prev, [studentId]: true }));
      setTimeout(() => {
        setRemarksSavedIndicator(prev => ({ ...prev, [studentId]: false }));
      }, 3000);
      toast.success(t('remarksSaved') || 'Remarks synced to Operations');
    } catch (err: any) {
      console.error('Failed to sync remarks to Firestore:', err);
      toast.error('Failed to save remarks');
    } finally {
      setRemarksSaving(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // Student to Assigned Officers map
  const studentOfficerMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of myStudents) {
      const officers = new Set<string>();
      if (s.assignedOfficerId) officers.add(s.assignedOfficerId);
      map.set(s.id, officers);
    }
    for (const task of myTasks) {
      if (task.studentId && task.assigneeId) {
        let set = map.get(task.studentId);
        if (!set) {
          set = new Set<string>();
          map.set(task.studentId, set);
        }
        set.add(task.assigneeId);
      }
    }
    return map;
  }, [myStudents, myTasks]);

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const nationalities = useMemo(() => {
    const set = new Set<string>();
    myStudents.forEach(s => {
      if (s.nationality && s.nationality.trim()) set.add(s.nationality.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [myStudents]);

  const universities = useMemo(() => {
    const set = new Set<string>();
    myStudents.forEach(s => {
      if (s.university && s.university.trim()) set.add(s.university.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [myStudents]);

  // -------------------------------------------------------------
  // Filtered Students
  // -------------------------------------------------------------
  const filteredMyStudents = useMemo(() => {
    return myStudents.filter(s => {
      if (officerFilter !== 'all') {
        const officerSet = studentOfficerMap.get(s.id);
        if (officerFilter === 'unassigned') {
          if (officerSet && officerSet.size > 0) return false;
        } else {
          if (!officerSet || !officerSet.has(officerFilter)) return false;
        }
      }

      if (packageFilter !== 'all') {
        const pkg = s.package || (s as any).servicePackage;
        if (pkg !== packageFilter) return false;
      }

      if (categoryFilter !== 'all' && s.arrivalCategory !== categoryFilter) return false;
      if (programFilter !== 'all' && s.program !== programFilter) return false;
      if (nationalityFilter !== 'all' && s.nationality !== nationalityFilter) return false;
      if (universityFilter !== 'all' && s.university !== universityFilter) return false;
      if (studentStatusFilter !== 'all' && s.status !== studentStatusFilter) return false;

      const arrivalDate = s.arrivalDate || s.flightDetails?.date;
      if (fromDate && (!arrivalDate || arrivalDate < fromDate)) return false;
      if (toDate && (!arrivalDate || arrivalDate > toDate)) return false;

      if (studentSearchTerm.trim()) {
        const q = studentSearchTerm.toLowerCase().trim();
        const officerNames = Array.from(studentOfficerMap.get(s.id) || [])
          .map(id => users.find(u => u.id === id)?.name || '')
          .join(' ')
          .toLowerCase();

        const matchName = s.fullName.toLowerCase().includes(q);
        const matchPassport = s.passportNumber.toLowerCase().includes(q);
        const matchEmail = (s.email || '').toLowerCase().includes(q);
        const matchPhone = (s.contactInfo || '').toLowerCase().includes(q);
        const matchUni = (s.university || '').toLowerCase().includes(q);
        const matchOfficer = officerNames.includes(q);
        const matchNat = (s.nationality || '').toLowerCase().includes(q);
        const matchProg = (s.program || '').toLowerCase().includes(q);

        if (!matchName && !matchPassport && !matchEmail && !matchPhone && !matchUni && !matchOfficer && !matchNat && !matchProg) {
          return false;
        }
      }

      return true;
    });
  }, [myStudents, officerFilter, packageFilter, categoryFilter, programFilter, nationalityFilter, universityFilter, studentStatusFilter, fromDate, toDate, studentSearchTerm, studentOfficerMap, users]);

  // -------------------------------------------------------------
  // Filtered Tasks
  // -------------------------------------------------------------
  const filteredMyTasks = useMemo(() => {
    return myTasks.filter(task => {
      // 1. Status Filter
      if (taskStatusFilter !== 'all' && normalizeTaskStatus(task) !== taskStatusFilter) return false;

      // 2. Category Filter (student_preset vs student_custom)
      if (taskCategoryFilter !== 'all' && getTaskCategory(task) !== taskCategoryFilter) return false;

      // 3. Student Filter
      if (taskStudentFilter !== 'all' && task.studentId !== taskStudentFilter) return false;

      // 4. Officer Filter
      if (taskOfficerFilter !== 'all') {
        if (taskOfficerFilter === 'unassigned') {
          if (task.assigneeId) return false;
        } else {
          if (task.assigneeId !== taskOfficerFilter) return false;
        }
      }

      // 5. Preset / Service Type Filter
      if (taskPresetFilter !== 'all' && !matchesTaskTypeFilter(task, taskPresetFilter)) {
        return false;
      }

      // 6. Strict Schedule / Date Quick Filter
      if (taskDateQuickFilter !== 'all') {
        const bucket = getTaskScheduleBucket(task, todayStr);
        if (taskDateQuickFilter === 'overdue') {
          if (bucket !== 'overdue') return false;
        } else if (taskDateQuickFilter === 'unscheduled') {
          if (bucket !== 'unscheduled') return false;
        } else {
          const dateStr = task.taskDate?.trim();
          if (!dateStr) return false;
          try {
            const tDate = parseISO(dateStr);
            if (taskDateQuickFilter === 'today' && !isToday(tDate)) return false;
            if (taskDateQuickFilter === 'tomorrow' && !isTomorrow(tDate)) return false;
            if (taskDateQuickFilter === 'this_week' && !isThisWeek(tDate)) return false;
            if (taskDateQuickFilter === 'past' && dateStr >= todayStr) return false;
          } catch {
            return false;
          }
        }
      }

      // 7. Search Term
      if (taskSearchTerm.trim()) {
        const q = taskSearchTerm.toLowerCase().trim();
        const std = myStudents.find(s => s.id === task.studentId);
        const officer = users.find(u => u.id === task.assigneeId);
        const preset = presets.find(p => p.id === task.presetId);
        const serviceLabel = getTaskServiceLabel(task, presets, language).toLowerCase();

        const matchTitle = (task.customTitle || '').toLowerCase().includes(q) || serviceLabel.includes(q);
        const matchTitleAr = (task.customTitleAr || '').toLowerCase().includes(q);
        const matchPreset = (preset?.nameEn || '').toLowerCase().includes(q) || (preset?.nameAr || '').toLowerCase().includes(q);
        const matchStudent = (std?.fullName || '').toLowerCase().includes(q) || (std?.passportNumber || '').toLowerCase().includes(q);
        const matchOfficer = (officer?.name || '').toLowerCase().includes(q);
        const matchHotel = (task.hotel || '').toLowerCase().includes(q);

        if (!matchTitle && !matchTitleAr && !matchPreset && !matchStudent && !matchOfficer && !matchHotel) {
          return false;
        }
      }

      return true;
    });
  }, [myTasks, taskStatusFilter, taskCategoryFilter, taskStudentFilter, taskOfficerFilter, taskPresetFilter, taskDateQuickFilter, taskSearchTerm, myStudents, users, presets, language, todayStr]);

  // -------------------------------------------------------------
  // Filtered Requests
  // -------------------------------------------------------------
  const filteredMyRequests = useMemo(() => {
    return myTaskRequests.filter(req => {
      if (requestStatusFilter !== 'all' && req.status !== requestStatusFilter) return false;
      if (requestSearchTerm.trim()) {
        const q = requestSearchTerm.toLowerCase().trim();
        const std = myStudents.find(s => s.id === req.studentId);
        const matchStudent = (std?.fullName || '').toLowerCase().includes(q);
        const matchCustom = (req.customTitle || '').toLowerCase().includes(q);
        const matchNotes = (req.notes || '').toLowerCase().includes(q);
        if (!matchStudent && !matchCustom && !matchNotes) return false;
      }
      return true;
    });
  }, [myTaskRequests, requestStatusFilter, requestSearchTerm, myStudents]);

  // Paginated Slices (Dashboard pagination, not infinity scroll)
  const paginatedMyStudents = useMemo(() => {
    const start = (studentPage - 1) * studentPageSize;
    return filteredMyStudents.slice(start, start + studentPageSize);
  }, [filteredMyStudents, studentPage, studentPageSize]);

  const paginatedMyTasks = useMemo(() => {
    const start = (taskPage - 1) * taskPageSize;
    return filteredMyTasks.slice(start, start + taskPageSize);
  }, [filteredMyTasks, taskPage, taskPageSize]);

  const paginatedMyRequests = useMemo(() => {
    const start = (requestPage - 1) * requestPageSize;
    return filteredMyRequests.slice(start, start + requestPageSize);
  }, [filteredMyRequests, requestPage, requestPageSize]);

  // -------------------------------------------------------------
  // Tab-Aware KPI Stats
  // -------------------------------------------------------------
  const stats = useMemo(() => {
    // 1. Students stats
    const totalStudents = myStudents.length;
    const inProgressStudents = myStudents.filter(s => s.status === 'in_progress').length;
    const completedStudents = myStudents.filter(s => s.status === 'completed').length;
    const pendingStudents = myStudents.filter(s => s.status === 'pending').length;
    
    const arrivingSoonCount = myStudents.filter(s => {
      const arr = s.arrivalDate || s.flightDetails?.date;
      if (!arr) return false;
      try {
        const diff = differenceInDays(parseISO(arr), new Date());
        return diff >= 0 && diff <= 7;
      } catch {
        return false;
      }
    }).length;

    // 2. Tasks stats (Strict status & overdue separation)
    const totalTasks = myTasks.length;
    const todayTasksCount = myTasks.filter(t => t.taskDate?.trim() === todayStr).length;
    const overdueTasksCount = myTasks.filter(t => getTaskScheduleBucket(t, todayStr) === 'overdue').length;
    const activeTasksCount = myTasks.filter(t => normalizeTaskStatus(t) === 'in_progress').length;
    const completedTasksCount = myTasks.filter(t => normalizeTaskStatus(t) === 'completed').length;
    const pendingTasksCount = myTasks.filter(t => normalizeTaskStatus(t) === 'pending').length;
    const cancelledTasksCount = myTasks.filter(t => normalizeTaskStatus(t) === 'cancelled').length;

    // Average CSAT for counselor's student tasks
    const tasksWithFeedback = myTasks.filter(t => t.feedbackSubmitted && t.feedback?.rating);
    const avgRating = tasksWithFeedback.length > 0 
      ? (tasksWithFeedback.reduce((acc, curr) => acc + (curr.feedback?.rating || 0), 0) / tasksWithFeedback.length).toFixed(1)
      : null;

    // 3. Requests stats
    const totalRequests = myTaskRequests.length;
    const pendingRequests = myTaskRequests.filter(r => r.status === 'pending_approval').length;
    const approvedRequests = myTaskRequests.filter(r => r.status === 'approved').length;
    const rejectedRequests = myTaskRequests.filter(r => r.status === 'rejected').length;

    return {
      students: { total: totalStudents, pending: pendingStudents, inProgress: inProgressStudents, completed: completedStudents, arrivingSoon: arrivingSoonCount },
      tasks: { total: totalTasks, today: todayTasksCount, overdue: overdueTasksCount, active: activeTasksCount, completed: completedTasksCount, pending: pendingTasksCount, cancelled: cancelledTasksCount, avgRating },
      requests: { total: totalRequests, pending: pendingRequests, approved: approvedRequests, rejected: rejectedRequests }
    };
  }, [myStudents, myTasks, myTaskRequests, todayStr]);

  const isLoading = Boolean(counselorId) && loadedCounselorId !== counselorId && myStudents.length === 0;

  // Relative arrival pill helper
  const getArrivalStatusBadge = (student: Student) => {
    const arrivalDateStr = student.arrivalDate || student.flightDetails?.date;
    if (!arrivalDateStr) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <Calendar size={11} /> No Arrival Date
        </span>
      );
    }

    try {
      const arr = parseISO(arrivalDateStr);
      const diff = differenceInDays(arr, new Date());

      if (isToday(arr)) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
            <Plane size={11} /> {t('arrivedToday') || 'Arriving Today!'}
          </span>
        );
      } else if (diff > 0 && diff <= 7) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
            <Plane size={11} /> In {diff} {diff === 1 ? 'day' : 'days'} ({format(arr, 'MMM dd')})
          </span>
        );
      } else if (diff > 7) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Calendar size={11} /> {format(arr, 'MMM dd, yyyy')}
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <CheckCircle2 size={11} className="text-slate-400" /> Arrived {Math.abs(diff)} days ago
          </span>
        );
      }
    } catch {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          {arrivalDateStr}
        </span>
      );
    }
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================= */}
      {/* Top Banner Header & Global Quick Actions */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-2xl shadow-md shadow-red-500/20">
            <GraduationCap size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {t('counselorPortal') || 'Counselor Operations Portal'}
              </h1>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-50 text-red-700 border border-red-200">
                {t('counselor_role') || 'Academic Counselor'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Welcome back, <strong className="text-slate-800">{currentUser.name}</strong> • Monitoring logistics & field tasks for your students
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedStudentForModal(undefined);
              setIsRequestModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-purple-600/25 transition-all cursor-pointer flex-1 sm:flex-none"
          >
            <Plus size={16} />
            <span>{t('requestTaskFromCoord') || 'Request Task from Coordinator'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* View Switcher Tabs Ribbon */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'students'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users size={16} />
            <span>{t('studentRoster') || 'Assigned Students'}</span>
            <span className={`px-2 py-0.5 text-[11px] rounded-full font-bold ${
              activeTab === 'students' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {myStudents.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CheckSquare size={16} />
            <span>{t('logisticsTasks') || 'Logistics Tasks'}</span>
            <span className={`px-2 py-0.5 text-[11px] rounded-full font-bold ${
              activeTab === 'tasks' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {myTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'requests'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Send size={15} />
            <span>{t('taskRequestsTracker') || 'Task Requests'}</span>
            <span className={`px-2 py-0.5 text-[11px] rounded-full font-bold ${
              activeTab === 'requests' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {myTaskRequests.length}
            </span>
          </button>
        </div>

        {/* View Mode Toggle for Students Tab */}
        {activeTab === 'students' && (
          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setStudentViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                studentViewMode === 'grid' ? 'bg-purple-100 text-purple-700 font-bold' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setStudentViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                studentViewMode === 'table' ? 'bg-purple-100 text-purple-700 font-bold' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <TableIcon size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* Context-Aware KPI Ribbon */}
      {/* ========================================================= */}
      {activeTab === 'students' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Students</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-slate-800">{stats.students.total}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold text-slate-700 bg-slate-100">
                Assigned
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Arriving Soon</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-purple-700">{stats.students.arrivingSoon}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold text-purple-700 bg-purple-50 border border-purple-200">
                Next 7 Days
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">In Progress</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-blue-700">{stats.students.inProgress}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold text-blue-700 bg-blue-50 border border-blue-200">
                Onboarding
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Completed</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-emerald-700">{stats.students.completed}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                Delivered
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Tasks</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-slate-800">{stats.tasks.total}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-slate-600 bg-slate-100">
                All Time
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-red-200 bg-red-50/20">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Overdue Open</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-red-700">{stats.tasks.overdue}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-black text-red-700 bg-red-100 border border-red-200">
                Past Due
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-200 bg-purple-50/20">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Scheduled Today</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-purple-800">{stats.tasks.today}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-black text-purple-700 bg-purple-100 border border-purple-200">
                Today
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200/90 bg-amber-50/20">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Pending Queue</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-amber-800">{stats.tasks.pending}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-amber-800 bg-amber-100 border border-amber-200">
                Pending
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-200/90">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Active On Field</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-blue-700">{stats.tasks.active}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-blue-700 bg-blue-50 border border-blue-200 animate-pulse">
                In Progress
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-200/90">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Completed</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-emerald-700">{stats.tasks.completed}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                Verified
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-200/90">
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Cancelled</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-rose-700">{stats.tasks.cancelled}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-rose-700 bg-rose-50 border border-rose-200">
                Cancelled
              </span>
            </div>
          </div>

          <div 
            onClick={() => onNavigate?.('feedbacks')}
            className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200/90 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer group"
            title="View Student Feedbacks"
          >
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1 group-hover:text-amber-600 transition-colors">Avg Student CSAT</p>
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-1.5">
                <Star size={18} className="text-amber-400 fill-amber-400" />
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{stats.tasks.avgRating || 'N/A'}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
                5-Star CSAT
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Requests</p>
            <span className="text-2xl font-black text-slate-800">{stats.requests.total}</span>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-200 bg-amber-50/20">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Pending Approval</p>
            <span className="text-2xl font-black text-amber-800">{stats.requests.pending}</span>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-200 bg-emerald-50/20">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Approved & Scheduled</p>
            <span className="text-2xl font-black text-emerald-800">{stats.requests.approved}</span>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-red-200 bg-red-50/20">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Rejected</p>
            <span className="text-2xl font-black text-red-800">{stats.requests.rejected}</span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: ASSIGNED STUDENTS VIEW */}
      {/* ========================================================= */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          {/* Multi-Variable Filter Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Filter Assigned Students</h3>
                <p className="text-xs text-slate-500 mt-0.5">Filter by flight arrival, field officer, program, nationality, and university</p>
              </div>

              {(studentSearchTerm || officerFilter !== 'all' || packageFilter !== 'all' || categoryFilter !== 'all' || programFilter !== 'all' || nationalityFilter !== 'all' || universityFilter !== 'all' || studentStatusFilter !== 'all' || fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStudentSearchTerm('');
                    setOfficerFilter('all');
                    setPackageFilter('all');
                    setCategoryFilter('all');
                    setProgramFilter('all');
                    setNationalityFilter('all');
                    setUniversityFilter('all');
                    setStudentStatusFilter('all');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input 
                type="text" 
                placeholder="Search students by Name, Passport, University, Email, Phone, or Assigned Officer..."
                value={studentSearchTerm}
                onChange={(e) => setStudentSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-all font-medium"
              />
              {studentSearchTerm && (
                <button
                  type="button"
                  onClick={() => setStudentSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Field Officer</label>
                <select
                  value={officerFilter}
                  onChange={(e) => setOfficerFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Field Officers</option>
                  <option value="unassigned">Unassigned</option>
                  {fieldOfficers.map(officer => (
                    <option key={officer.id} value={officer.id}>{officer.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Package Tier</label>
                <select
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Packages</option>
                  <option value="Free">Free</option>
                  <option value="300$">300$</option>
                  <option value="500$">500$</option>
                  <option value="300$(Free)">300$(Free)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Program</label>
                <select
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Programs</option>
                  <option value="Language">Language</option>
                  <option value="Foundation">Foundation</option>
                  <option value="Diploma">Diploma</option>
                  <option value="Certificate">Certificate</option>
                  <option value="Bachelor">Bachelor</option>
                  <option value="Master">Master</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Logistics Status</label>
                <select
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nationality</label>
                <select
                  value={nationalityFilter}
                  onChange={(e) => setNationalityFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Nationalities</option>
                  {nationalities.map(nat => (
                    <option key={nat} value={nat}>{nat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <span>Showing <strong className="text-slate-900 font-bold">{filteredMyStudents.length}</strong> of <strong className="text-slate-900 font-bold">{myStudents.length}</strong> assigned students</span>
            </div>
          </div>

          {/* Students Content Area */}
          {isLoading ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <Loader2 size={32} className="animate-spin text-purple-600 mb-3" />
              <p className="text-sm font-medium text-slate-600">Loading assigned students...</p>
            </div>
          ) : filteredMyStudents.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              <GraduationCap size={48} className="mx-auto text-slate-300 mb-3" />
              <h4 className="text-base font-bold text-slate-700">No students found</h4>
              <p className="text-xs text-slate-400 mt-1">{t('noStudentsFoundForCounselor') || 'No assigned students match your filter criteria.'}</p>
            </div>
          ) : studentViewMode === 'table' ? (
            /* ================= Table View Mode ================= */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5">Student Details</th>
                      <th className="px-5 py-3.5">Passport</th>
                      <th className="px-5 py-3.5">University & Program</th>
                      <th className="px-5 py-3.5">Arrival Intelligence</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedMyStudents.map(student => {
                      const studentTasks = myTasks.filter(t => t.studentId === student.id);
                      const completedTasks = studentTasks.filter(t => normalizeTaskStatus(t) === 'completed').length;
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 font-black flex items-center justify-center shrink-0 text-base">
                                {student.fullName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span 
                                  onClick={() => onSelectStudent?.(student.id)}
                                  className="font-bold text-slate-900 hover:text-purple-600 cursor-pointer block truncate"
                                >
                                  {student.fullName}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">{student.contactInfo || student.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono font-medium text-slate-700">{student.passportNumber}</td>
                          <td className="px-5 py-4">
                            <span className="font-semibold text-slate-800 block truncate">{student.university}</span>
                            <span className="text-xs text-slate-400">{student.program} • {student.studyIntake}</span>
                          </td>
                          <td className="px-5 py-4">
                            {getArrivalStatusBadge(student)}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              student.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              student.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {student.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-1">
                              {completedTasks}/{studentTasks.length} Tasks Done
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentForDossier(student)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                Dossier
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectStudent?.(student.id)}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ================= Card Grid View Mode ================= */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedMyStudents.map(student => {
                const studentTasks = myTasks.filter(t => t.studentId === student.id);
                const nonCancelledTasks = studentTasks.filter(t => normalizeTaskStatus(t) !== 'cancelled');
                const completedTasks = nonCancelledTasks.filter(t => normalizeTaskStatus(t) === 'completed').length;
                const totalTasks = nonCancelledTasks.length;
                const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
                const currentRemarks = remarksState[student.id] !== undefined ? remarksState[student.id] : (student.counselorRemarks || '');
                const isSaving = !!remarksSaving[student.id];
                const isSaved = !!remarksSavedIndicator[student.id];

                return (
                  <div key={student.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between hover:border-purple-200 dark:hover:border-purple-900/60 transition-all">
                    {/* Student Card Top Section */}
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div 
                            onClick={() => onSelectStudent?.(student.id)}
                            className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-2xl shrink-0 cursor-pointer shadow-md shadow-purple-500/20 hover:scale-105 transition-transform"
                          >
                            {student.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 
                                onClick={() => onSelectStudent?.(student.id)}
                                className="text-lg font-black text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors leading-tight"
                              >
                                {student.fullName}
                              </h3>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                {student.package || (student as any).servicePackage || 'Free'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{student.university}</span>
                              <span className="text-slate-300 dark:text-slate-600">•</span>
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{student.passportNumber}</span>
                              {student.nationality && (
                                <>
                                  <span className="text-slate-300 dark:text-slate-600">•</span>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">{student.nationality}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`px-2.5 py-1 text-xs font-extrabold rounded-full ${
                            student.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            student.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {student.status.replace('_', ' ').toUpperCase()}
                          </span>
                          {getArrivalStatusBadge(student)}
                        </div>
                      </div>

                      {/* Flight & Accommodation Intelligence Strip */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                        {/* Flight Info */}
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                            <Plane size={11} className="text-purple-500" /> Flight & Arrival
                          </span>
                          {student.flightDetails?.airline || student.flightDetails?.flightNumber ? (
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              <span>{student.flightDetails.airline} {student.flightDetails.flightNumber}</span>
                              {student.flightDetails.time && (
                                <span className="text-slate-500 dark:text-slate-400 font-medium ml-1">@ {student.flightDetails.time}</span>
                              )}
                              {student.flightDetails.terminal && (
                                <span className="text-slate-500 dark:text-slate-400 font-medium ml-1">({student.flightDetails.terminal})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic">No flight details logged</span>
                          )}
                        </div>

                        {/* Hotel Info */}
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Hotel size={11} className="text-indigo-500" /> Accommodation
                          </span>
                          {student.accommodationDetails?.hotelName ? (
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={student.accommodationDetails.hotelName}>
                              <span>{student.accommodationDetails.hotelName}</span>
                              {student.accommodationDetails.roomType && (
                                <span className="text-slate-500 dark:text-slate-400 font-medium ml-1">({student.accommodationDetails.roomType})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic">No hotel details logged</span>
                          )}
                        </div>
                      </div>

                      {/* Overall Onboarding Progress */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-purple-600" />
                            <span>Onboarding Journey Progress</span>
                          </span>
                          <span className="text-purple-700">
                            {completedTasks} / {totalTasks} Active Tasks ({Math.round(progress)}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-500" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Assigned Tasks Mini-Pills Strip */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Assigned Logistics Tasks ({studentTasks.length})
                      </span>
                      {studentTasks.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No tasks created yet for this student.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {studentTasks.map(task => {
                            const title = getTaskServiceLabel(task, presets, language);
                            const normalizedStatus = normalizeTaskStatus(task);
                            return (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => setSelectedTaskForDetail(task)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${getTaskStatusBadgeClasses(normalizedStatus)}`}
                              >
                                {normalizedStatus === 'completed' ? (
                                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                                ) : normalizedStatus === 'in_progress' ? (
                                  <Clock size={12} className="text-blue-600 shrink-0" />
                                ) : normalizedStatus === 'cancelled' ? (
                                  <X size={12} className="text-rose-600 shrink-0" />
                                ) : (
                                  <Circle size={12} className="text-amber-600 shrink-0" />
                                )}
                                <span className="truncate max-w-[150px]">{title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Counselor Live Remarks Box */}
                    <div className="p-4 bg-purple-50/30 dark:bg-purple-950/15 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                          <MessageSquareText size={13} className="text-purple-600" />
                          <span>{t('counselorRemarks') || 'Counselor Remarks'}</span>
                        </span>
                        {isSaving ? (
                          <span className="text-[10px] font-bold text-purple-600 flex items-center gap-1 animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> Saving...
                          </span>
                        ) : isSaved ? (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                            <Check size={11} /> Saved
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Live sync to Coordinator</span>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={currentRemarks}
                        onChange={(e) => setRemarksState(prev => ({ ...prev, [student.id]: e.target.value }))}
                        onBlur={() => handleSaveRemarks(student.id)}
                        placeholder="Add special family arrival instructions or medical notes for field operations..."
                        className="w-full p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 resize-none transition-all"
                      />
                    </div>

                    {/* Card Actions Footer */}
                    <div className="p-4 bg-slate-50/80 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentForDossier(student)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-800 bg-transparent dark:bg-slate-900 border border-transparent dark:border-slate-800 transition-colors cursor-pointer"
                      >
                        <FileText size={14} className="text-slate-500 dark:text-slate-400" />
                        <span>Quick Dossier</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentForModal(student.id);
                            setIsRequestModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/70 text-purple-800 dark:text-purple-300 border border-transparent dark:border-purple-700/60 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Request Task</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectStudent?.(student.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-transparent dark:border-slate-700 transition-all cursor-pointer"
                        >
                          <span>Full Profile</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Students Pagination */}
          {filteredMyStudents.length > 0 && (
            <Pagination
              currentPage={studentPage}
              totalItems={filteredMyStudents.length}
              pageSize={studentPageSize}
              onPageChange={setStudentPage}
              onPageSizeChange={setStudentPageSize}
              pageSizeOptions={[8, 16, 32, 64]}
              itemLabel={language === 'ar' ? 'طالب' : 'students'}
              colorScheme="purple"
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CENTRALIZED LOGISTICS TASKS CONSOLE */}
      {/* ========================================================= */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          {/* Quick Date Chips Bar */}
          <div className="flex items-center gap-2 flex-wrap bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">Schedule Filters:</span>
            {[
              { id: 'all', label: 'All Dates' },
              { id: 'overdue', label: 'Overdue Open', danger: true },
              { id: 'today', label: "Today's Tasks", highlight: true },
              { id: 'tomorrow', label: 'Tomorrow' },
              { id: 'this_week', label: 'This Week' },
              { id: 'unscheduled', label: 'Unscheduled' },
              { id: 'past', label: 'Past Dates' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTaskDateQuickFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  taskDateQuickFilter === f.id
                    ? (f.danger ? 'bg-red-600 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm')
                    : f.danger
                    ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                    : f.highlight
                    ? 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Detailed Task Filters Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">{t('filterCounselorTasks') || 'Filter Logistics Tasks'}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{t('filterCounselorTasksDesc') || 'Filter and inspect field logistics operations across your assigned students'}</p>
              </div>

              {(taskSearchTerm || taskStatusFilter !== 'all' || taskCategoryFilter !== 'all' || taskStudentFilter !== 'all' || taskOfficerFilter !== 'all' || taskPresetFilter !== 'all' || taskDateQuickFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setTaskSearchTerm('');
                    setTaskStatusFilter('all');
                    setTaskCategoryFilter('all');
                    setTaskStudentFilter('all');
                    setTaskOfficerFilter('all');
                    setTaskPresetFilter('all');
                    setTaskDateQuickFilter('all');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Clear Task Filters</span>
                </button>
              )}
            </div>

            {/* Task Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input 
                type="text" 
                placeholder="Search tasks by Title, Student Name, Passport, Hotel, or Assigned Officer..."
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-all font-medium"
              />
              {taskSearchTerm && (
                <button
                  type="button"
                  onClick={() => setTaskSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={taskStatusFilter}
                  onChange={(e) => setTaskStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</label>
                <select
                  value={taskCategoryFilter}
                  onChange={(e) => setTaskCategoryFilter(e.target.value as 'all' | TaskCategory)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Categories</option>
                  <option value="student_preset">Standard SOP</option>
                  <option value="student_custom">Custom Task</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Student</label>
                <select
                  value={taskStudentFilter}
                  onChange={(e) => setTaskStudentFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All My Students</option>
                  {myStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Field Officer</label>
                <select
                  value={taskOfficerFilter}
                  onChange={(e) => setTaskOfficerFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Field Officers</option>
                  <option value="unassigned">Unassigned</option>
                  {fieldOfficers.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Service Type</label>
                <select
                  value={taskPresetFilter}
                  onChange={(e) => setTaskPresetFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600"
                >
                  <option value="all">All Service Types</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.nameEn}</option>
                  ))}
                  <option value="custom">Custom Task</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <span>Showing <strong className="text-slate-900 font-bold">{filteredMyTasks.length}</strong> of <strong className="text-slate-900 font-bold">{myTasks.length}</strong> tasks</span>
            </div>
          </div>

          {/* Tasks Cards Grid */}
          {filteredMyTasks.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              <CheckSquare size={48} className="mx-auto text-slate-300 mb-3" />
              <h4 className="text-base font-bold text-slate-700">No tasks found</h4>
              <p className="text-xs text-slate-400 mt-1">{t('noTasksFoundForCounselor') || 'No logistics tasks match your current filter criteria.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedMyTasks.map(task => {
                const student = myStudents.find(s => s.id === task.studentId);
                const assignee = users.find(u => u.id === task.assigneeId);
                const vehicle = vehicles.find(v => v.id === task.vehicleId);
                const slaInfo = getTaskSlaInfo(task);

                const { steps: displaySteps, total: totalSubTasks, completed: completedSubTasks, percentage: progress } = getTaskStepMetrics(task);
                const isExpanded = !!expandedTasks[task.id];
                const taskProofs = getTaskAllProofs(task);

                const taskCategory = getTaskCategory(task);
                const effectiveStatus = normalizeTaskStatus(task);
                const scheduleBucket = getTaskScheduleBucket(task, todayStr);
                const taskIsOpen = isOpenTask(task);
                const taskTitle = getTaskServiceLabel(task, presets, language);

                return (
                  <div key={task.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:border-purple-200 transition-all">
                    {/* Task Header */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                              taskCategory === 'student_custom'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}>
                              {taskCategory === 'student_custom' ? 'Custom Task' : 'Student SOP'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${getTaskStatusBadgeClasses(effectiveStatus)}`}>
                              {effectiveStatus.replace('_', ' ')}
                            </span>
                            {taskIsOpen && scheduleBucket === 'overdue' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-50 text-red-700 border border-red-200">
                                Overdue
                              </span>
                            )}
                            {taskIsOpen && scheduleBucket === 'unscheduled' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                Unscheduled
                              </span>
                            )}
                            {slaInfo.text && (
                              <span className="text-xs text-slate-500 font-semibold">
                                • {slaInfo.text}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                            {taskTitle}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedTaskForDetail(task)}
                          className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs transition-all cursor-pointer shrink-0"
                        >
                          Audit Details
                        </button>
                      </div>

                      {/* Linked Student Badge */}
                      {student && (
                        <div 
                          onClick={() => onSelectStudent?.(student.id)}
                          className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs cursor-pointer hover:border-purple-300 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {student.fullName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-slate-900 block truncate">{student.fullName}</span>
                              <span className="text-[11px] text-slate-400 block truncate">{student.university} • {student.passportNumber}</span>
                            </div>
                          </div>
                          <ChevronRight size={15} className="text-slate-400 shrink-0" />
                        </div>
                      )}
                    </div>

                    {/* Operational Metadata */}
                    <div className="p-5 space-y-4 bg-white flex-1">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {task.taskDate && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                            <Calendar size={13} className="text-purple-600" />
                            {formatDateDDMMYYYY(task.taskDate)}
                          </span>
                        )}
                        {task.taskTime && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                            <Clock size={13} className="text-blue-600" />
                            {task.taskTime}
                          </span>
                        )}
                        {task.hotel && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                            <Hotel size={13} className="text-indigo-600" />
                            {task.hotel}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                          <Users size={13} className="text-emerald-600" />
                          <span>Officer: <strong className="text-slate-900">{assignee?.name || 'Unassigned'}</strong></span>
                        </span>
                        {vehicle && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                            <Car size={13} className="text-amber-600" />
                            <span>{vehicle.name} ({vehicle.plateNumber})</span>
                          </span>
                        )}
                      </div>

                      {/* Subtasks Progress Line & Expand Toggle */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">Subtasks Progress</span>
                          <button
                            type="button"
                            onClick={() => setExpandedTasks(prev => ({ ...prev, [task.id]: !isExpanded }))}
                            className="text-purple-700 font-bold hover:underline cursor-pointer text-xs"
                          >
                            {isExpanded ? 'Hide Steps' : `View Steps (${completedSubTasks}/${totalSubTasks})`}
                          </button>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-500" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        {/* Expandable Subtasks Checklist */}
                        {isExpanded && (
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            {displaySteps.map(st => (
                              <div key={st.id} className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {st.isCompleted ? (
                                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                                    ) : st.isSkipped ? (
                                      <X size={15} className="text-red-500 shrink-0" />
                                    ) : (
                                      <Circle size={15} className="text-slate-300 shrink-0" />
                                    )}
                                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                      <span className={`font-semibold ${st.isCompleted ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {language === 'ar' && st.titleAr ? st.titleAr : st.titleEn}
                                      </span>
                                      {st.isCommunicationStep && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                          Student Contact
                                        </span>
                                      )}
                                      {st.media && st.media.length > 0 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                          {st.media.length} {st.media.length === 1 ? 'Proof' : 'Proofs'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {st.completedAt && (
                                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                      {format(new Date(st.completedAt), 'HH:mm • MMM dd')}
                                    </span>
                                  )}
                                </div>

                                {/* Step Proofs Thumbnails */}
                                {st.media && st.media.length > 0 && (
                                  <div className="flex items-center gap-2 pl-6 pt-0.5 overflow-x-auto">
                                    {st.media.map((m, mIdx) => (
                                      <div
                                        key={mIdx}
                                        onClick={() => setLightboxImage({
                                          url: m.url,
                                          caption: `${language === 'ar' && st.titleAr ? st.titleAr : st.titleEn} (${student?.fullName || 'Student'})`,
                                          timestamp: m.timestamp,
                                          location: m.location
                                        })}
                                        className="group relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 cursor-pointer shrink-0 hover:border-purple-400 shadow-2xs"
                                        title="Click to view full photo"
                                      >
                                        <img src={m.url} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <Camera size={12} className="text-white" />
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setLightboxImage({
                                        url: st.media[0].url,
                                        caption: `${language === 'ar' && st.titleAr ? st.titleAr : st.titleEn} (${student?.fullName || 'Student'})`,
                                        timestamp: st.media[0].timestamp,
                                        location: st.media[0].location
                                      })}
                                      className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-white px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs cursor-pointer shrink-0"
                                    >
                                      View Proof
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Proof Photos Thumbnail Strip */}
                      {taskProofs.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Field Verification Photos ({taskProofs.length})
                          </span>
                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {taskProofs.map((m, i) => (
                              <div
                                key={i}
                                onClick={() => setLightboxImage({ url: m.url, caption: m.caption, timestamp: m.timestamp, location: m.location })}
                                className="w-16 h-14 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-pointer hover:border-purple-400 shadow-2xs group relative"
                              >
                                <img src={m.url} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Field Notes Snippet */}
                      {task.notes && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700">
                          <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider mb-0.5">Field Officer Notes:</span>
                          <p className="line-clamp-2 italic font-medium">{task.notes}</p>
                        </div>
                      )}

                      {/* CSAT Feedback Preview if Present */}
                      {task.feedbackSubmitted && task.feedback && (
                        <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                            <Star size={14} className="text-amber-500 fill-amber-500" />
                            <span>CSAT Feedback: {task.feedback.rating}/5</span>
                          </div>
                          {task.feedback.comment && (
                            <span className="text-emerald-700 italic truncate max-w-[200px]">"{task.feedback.comment}"</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Task Actions Footer */}
                    <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">
                        ID: {task.id.slice(-6).toUpperCase()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTaskForDetail(task)}
                        className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>Audit & Full Proofs</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tasks Pagination */}
          {filteredMyTasks.length > 0 && (
            <Pagination
              currentPage={taskPage}
              totalItems={filteredMyTasks.length}
              pageSize={taskPageSize}
              onPageChange={setTaskPage}
              onPageSizeChange={setTaskPageSize}
              pageSizeOptions={[8, 16, 32, 64]}
              itemLabel={language === 'ar' ? 'مهمة' : 'tasks'}
              colorScheme="purple"
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: TASK REQUESTS TRACKER */}
      {/* ========================================================= */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">{t('taskRequestsTracker') || 'Task Requests Tracker'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Monitor and track service requests submitted to Operations Coordinators</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              >
                <option value="all">All Request Statuses</option>
                <option value="pending_approval">Pending Review</option>
                <option value="approved">Approved & Scheduled</option>
                <option value="rejected">Rejected</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSelectedStudentForModal(undefined);
                  setIsRequestModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>New Request</span>
              </button>
            </div>
          </div>

          {filteredMyRequests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
              <Send size={48} className="mx-auto text-slate-300 mb-3" />
              <h4 className="text-base font-bold text-slate-700">No task requests found</h4>
              <p className="text-xs text-slate-400 mt-1">{t('noRequestsFoundForCounselor') || 'No task requests submitted yet.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedMyRequests.map(req => {
                const student = myStudents.find(s => s.id === req.studentId);
                const preset = presets.find(p => p.id === req.presetId);
                const title = req.customTitle || preset?.nameEn || 'Logistics Service';

                return (
                  <div key={req.id} className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4 hover:border-purple-200 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                          req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                          req.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {req.status === 'pending_approval' ? 'Pending Review' : req.status}
                        </span>
                        <h4 className="text-base font-extrabold text-slate-900 mt-2">{title}</h4>
                      </div>

                      <span className="text-[11px] text-slate-400 font-medium">
                        {format(new Date(req.createdAt), 'MMM dd, HH:mm')}
                      </span>
                    </div>

                    {/* Target Student Info */}
                    {student && (
                      <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {student.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-900 block truncate">{student.fullName}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{student.university} • {student.passportNumber}</span>
                        </div>
                      </div>
                    )}

                    {/* Timing & Notes */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {req.requestedDate && (
                        <span className="inline-flex items-center gap-1 text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Calendar size={12} className="text-purple-600" />
                          Requested Date: {format(new Date(req.requestedDate), 'MMM dd, yyyy')}
                        </span>
                      )}
                      {req.requestedTime && (
                        <span className="inline-flex items-center gap-1 text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Clock size={12} className="text-blue-600" />
                          {req.requestedTime}
                        </span>
                      )}
                    </div>

                    {req.notes && (
                      <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 text-xs text-purple-950 font-medium">
                        <span className="text-[10px] font-bold text-purple-700 block uppercase tracking-wider mb-0.5">Counselor Request Notes:</span>
                        "{req.notes}"
                      </div>
                    )}

                    {/* Rejection Alert if Rejected */}
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 font-medium">
                        <span className="text-[10px] font-bold text-red-700 block uppercase tracking-wider mb-0.5 flex items-center gap-1">
                          <AlertCircle size={12} /> {t('rejectionReason') || 'Coordinator Rejection Reason'}:
                        </span>
                        "{req.rejectionReason}"
                      </div>
                    )}

                    {/* Approved Link if Assigned */}
                    {req.status === 'approved' && req.assignedTaskId && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={14} /> Scheduled into Operations
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const scheduled = myTasks.find(t => t.id === req.assignedTaskId);
                            if (scheduled) {
                              setSelectedTaskForDetail(scheduled);
                            } else {
                              setActiveTab('tasks');
                            }
                          }}
                          className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors cursor-pointer"
                        >
                          View Task
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Requests Pagination */}
          {filteredMyRequests.length > 0 && (
            <Pagination
              currentPage={requestPage}
              totalItems={filteredMyRequests.length}
              pageSize={requestPageSize}
              onPageChange={setRequestPage}
              onPageSizeChange={setRequestPageSize}
              pageSizeOptions={[10, 20, 50]}
              itemLabel={language === 'ar' ? 'طلب' : 'requests'}
              colorScheme="purple"
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}
      {/* 1. Request Task Modal */}
      <RequestTaskModal
        isOpen={isRequestModalOpen}
        onClose={() => {
          setIsRequestModalOpen(false);
          setSelectedStudentForModal(undefined);
        }}
        preSelectedStudentId={selectedStudentForModal}
        counselorStudents={myStudents}
      />

      {/* 2. Task Detail Modal */}
      <TaskDetailModal
        isOpen={!!selectedTaskForDetail}
        onClose={() => setSelectedTaskForDetail(null)}
        task={selectedTaskForDetail}
        onOpenLightbox={(url, cap, ts, loc) => setLightboxImage({ url, caption: cap, timestamp: ts, location: loc })}
        onViewStudentDossier={(stdId) => {
          const s = myStudents.find(x => x.id === stdId);
          if (s) setSelectedStudentForDossier(s);
        }}
      />

      {/* 3. Photo Lightbox Modal */}
      <PhotoLightboxModal
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        imageUrl={lightboxImage?.url || null}
        caption={lightboxImage?.caption}
        timestamp={lightboxImage?.timestamp}
        location={lightboxImage?.location}
      />

      {/* 4. Student Dossier Modal */}
      <StudentDossierModal
        isOpen={!!selectedStudentForDossier}
        onClose={() => setSelectedStudentForDossier(null)}
        student={selectedStudentForDossier}
        onNavigateToFullProfile={(stdId) => onSelectStudent?.(stdId)}
      />
    </div>
  );
}
