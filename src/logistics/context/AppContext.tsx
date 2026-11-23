// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { User, Student, Task, TaskPreset, Language, Theme, Role, AppNotification, Vehicle, VehicleLog, TaskFeedback, Expense, ExpenseCategory, TopUpRecord, OvertimeLog, TaskRequest, MediaItem, CounselorTask, CounselorTaskAttachment, CounselorTaskCategory, CounselorTaskMode, CounselorTaskPriority, CounselorTaskStatus, CounselorTaskSubTask, QCTaskReview, QCDailyReport, QCOfficerEvaluation, QCGrade, QCErrorTagId, QCEvidenceMedia } from '../types';
import { initialPresets } from '../data/initialData';
import { translations } from '../i18n/translations';
import { app, db, waitForFirestoreSync } from '../config/firebase';
import { getAuth, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, query, where, getDocs, getDoc, setDoc, writeBatch, increment, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { formatCurrency } from '../utils/currency';
import { getFeedbackEmailPayload } from '../utils/feedbackEmailTemplate';
import {
  sanitizeForFirestore,
  resolveCompletionTaskTitle,
  assertLogisticReportForCompletion,
  assertExecutionStatusTransition,
  buildTaskStatusUpdatePayload,
  buildStudentCompletionPatch,
  executeCompletionSideEffects
} from '../utils/taskCompletion';
import {
  getTaskDisplayTitle,
  hasPresetTemplate,
  hasValidCompletedAt,
  isLegacyCopiedNonStudentCustomTitle,
  normalizeLoadedTask,
  normalizeTaskStatus
} from '../utils/taskClassification';
import { isCounselorProgressCompleted } from '../utils/counselorTaskTiming';
import {
  WalletRecordRef,
  deduplicateWalletRecordRefs,
  chunkArray
} from '../utils/walletSettlement';
import toast from 'react-hot-toast';

export const STORAGE_USER_KEY = 'pioneer_active_user';
export const STORAGE_VIEW_KEY = 'pioneer_current_view';
export const STORAGE_THEME_KEY = 'pioneer_theme';

export interface MappedFeedbackEntry {
  id: string;
  feedback: TaskFeedback;
  taskId: string;
  task?: Task;
  studentId?: string;
  studentEmail?: string;
  student?: Student;
  presetId?: string;
  preset?: TaskPreset;
  assigneeId?: string;
  officer?: User;
}

interface AppState {
  isAuthLoading: boolean;
  isInitialized: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  t: (key: keyof typeof translations['en']) => string;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUserPassword: (userId: string, newPassword: string) => void;
  users: User[];
  students: Student[];
  tasks: Task[];
  presets: TaskPreset[];
  taskRequests: TaskRequest[];
  createTaskRequest: (request: Omit<TaskRequest, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  updateTaskRequestStatus: (requestId: string, status: 'approved' | 'rejected', extra?: { rejectionReason?: string; assignedTaskId?: string }) => Promise<void>;
  resendTaskFeedbackEmail: (taskId: string, overrideEmail?: string) => Promise<void>;
  feedbacks: TaskFeedback[];
  feedbackEntries: MappedFeedbackEntry[];
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  startTask: (taskId: string, studentEmail?: string) => Promise<void>;
  updateTaskStudentEmail: (taskId: string, studentEmail: string) => Promise<void>;
  submitTaskFeedback: (taskId: string, feedback: Omit<TaskFeedback, 'id' | 'submittedAt'>) => Promise<void>;
  updateTaskStatus: (taskId: string, status: Task['status'], extra?: { studentEmail?: string; notes?: string }) => Promise<{ synced: boolean; queuedLocally: boolean }>;
  pendingTaskIds: Set<string>;
  completingTaskIds: Set<string>;
  isOnline: boolean;
  retryPendingTaskSync: () => Promise<boolean>;
  updateSubTaskStatus: (taskId: string, subTaskId: string, isCompleted: boolean, isSkipped?: boolean) => void;
  updateTaskNotes: (taskId: string, notes: string) => void;
  updateTaskAssignee: (taskId: string, assigneeId: string) => void;
  updateTaskCommunication: (taskId: string, isCommunicated: boolean, mediaUrl?: string, location?: string) => void;
  removeCommunicationMedia: (taskId: string, mediaIndex: number) => Promise<void>;
  addMediaToSubTask: (taskId: string, subTaskId: string, mediaUrl: string, location: string) => void;
  removeMediaFromSubTask: (taskId: string, subTaskId: string, mediaIndex: number) => Promise<void>;
  assignTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<string>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  addPreset: (preset: Omit<TaskPreset, 'id'>) => void;
  updatePreset: (presetId: string, updatedData: Partial<TaskPreset>) => void;
  addStudent: (student: Omit<Student, 'id' | 'status' | 'completedStages'>) => Promise<void>;
  updateStudent: (studentId: string, data: Partial<Student>) => Promise<void>;
  deleteStudent: (studentId: string) => Promise<void>;
  deleteStudents: (studentIds: string[]) => Promise<void>;
  vehicles: Vehicle[];
  vehicleLogs: VehicleLog[];
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
  updateVehicle: (vehicleId: string, data: Partial<Vehicle>) => void;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  createVehicleLog: (log: Omit<VehicleLog, 'id'>) => void;
  updateVehicleLog: (logId: string, data: Partial<VehicleLog>) => void;
  expenses: Expense[];
  topups: TopUpRecord[];
  logExpense: (expenseData: {
    taskId?: string | null;
    amount: number;
    category: ExpenseCategory;
    vehicleId?: string | null;
    vehicleName?: string;
    vehiclePlateNumber?: string;
    notes?: string;
    receiptUrl: string;
    location?: string;
    timestamp?: string;
  }) => Promise<void>;
  logTopUp: (topUpData: {
    amount: number;
    source?: string;
    notes?: string;
    timestamp?: string;
  }) => Promise<void>;
  topUpWallet: (userId: string, amount: number, source?: string, notes?: string) => Promise<void>;
  toggleWalletRecordSettled: (recordType: 'expense' | 'topup', recordId: string, settled: boolean) => Promise<void>;
  batchToggleWalletRecordsSettled: (records: WalletRecordRef[], settled: boolean) => Promise<number>;
  overtimeLogs: OvertimeLog[];
  addOvertimeLog: (log: Omit<OvertimeLog, 'id'>) => Promise<void>;
  updateOvertimeLog: (logId: string, data: Partial<OvertimeLog>) => Promise<void>;
  deleteOvertimeLog: (logId: string) => Promise<void>;
  counselorTasks: CounselorTask[];
  createCounselorTask: (payload: {
    title: string;
    titleAr?: string;
    description?: string;
    category: CounselorTaskCategory;
    priority: CounselorTaskPriority;
    mode: CounselorTaskMode;
    isPinned?: boolean;
    targetMode: 'all' | 'specific';
    assignedCounselorIds: string[];
    deadlineAt?: string;
    subTasks?: CounselorTaskSubTask[];
    attachments?: CounselorTaskAttachment[];
  }) => Promise<string>;
  updateCounselorTask: (
    taskId: string,
    updates: Partial<Pick<CounselorTask, 'title' | 'titleAr' | 'description' | 'category' | 'priority' | 'mode' | 'isPinned' | 'targetMode' | 'assignedCounselorIds' | 'deadlineAt' | 'subTasks' | 'attachments'>>,
    clearDeadline?: boolean
  ) => Promise<void>;
  deleteCounselorTask: (taskId: string) => Promise<void>;
  toggleCounselorTaskPin: (taskId: string, isPinned: boolean) => Promise<void>;
  toggleCounselorTaskLike: (taskId: string) => Promise<boolean>;
  updateCounselorTaskProgress: (
    taskId: string,
    status: CounselorTaskStatus,
    extra?: { completionNote?: string; completionAttachments?: CounselorTaskAttachment[] }
  ) => Promise<void>;
  toggleCounselorSubTask: (taskId: string, subTaskId: string, checked: boolean) => Promise<void>;
  addCounselorTaskComment: (taskId: string, text: string) => Promise<void>;
  nudgeCounselorTask: (taskId: string, scope?: 'unacked' | 'incomplete') => Promise<number>;
  qcReviews: QCTaskReview[];
  qcDailyReports: QCDailyReport[];
  qcOfficerEvaluations: QCOfficerEvaluation[];
  saveQCReview: (payload: {
    taskId: string;
    officerId?: string;
    studentId?: string;
    taskDate?: string;
    grade: QCGrade;
    internalScore?: number;
    errorTags: QCErrorTagId[];
    customTags?: string[];
    comment: string;
    evidenceMedia?: QCEvidenceMedia[];
    needsUrgentCall?: boolean;
    urgentCallReason?: string;
    urgentCallResolved?: boolean;
  }) => Promise<void>;
  deleteQCReview: (taskId: string) => Promise<void>;
  toggleQCUrgentCallResolved: (taskId: string, resolved: boolean) => Promise<void>;
  saveQCDailyReport: (date: string, payload: { dailySummary: string; generalAdvice: string }) => Promise<void>;
  saveQCOfficerEvaluation: (officerId: string, payload: { rating: number; notes: string; strengths?: string; improvements?: string }) => Promise<void>;
}

const isFeedbackRoute = (() => {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('view') === 'feedback';
    }
  } catch {
    // fallback
  }
  return false;
})();

const AppContext = createContext<AppState | undefined>(undefined);

export interface LogisticsIdentity { uid: string; name: string; email: string; role: Role; etRole: string }

export const AppProvider = ({ children, identity }: { children: ReactNode; identity?: LogisticsIdentity | null }) => {
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(!isFeedbackRoute);
  const [isInitialized, setIsInitialized] = useState<boolean>(isFeedbackRoute ? true : false);
  const [language, setLanguage] = useState<Language>('en');
  // Express Tracker uses one light theme across all tabs
  const [theme, setThemeState] = useState<Theme>('light');

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, newTheme);
    } catch (e) {
      console.error('Error saving theme to localStorage:', e);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [presets, setPresets] = useState<TaskPreset[]>([]);
  const [feedbacks, setFeedbacks] = useState<TaskFeedback[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleLogs, setVehicleLogs] = useState<VehicleLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [topups, setTopups] = useState<TopUpRecord[]>([]);
  const [overtimeLogs, setOvertimeLogs] = useState<OvertimeLog[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [counselorTasks, setCounselorTasks] = useState<CounselorTask[]>([]);
  const [qcReviews, setQcReviews] = useState<QCTaskReview[]>([]);
  const [qcDailyReports, setQcDailyReports] = useState<QCDailyReport[]>([]);
  const [qcOfficerEvaluations, setQcOfficerEvaluations] = useState<QCOfficerEvaluation[]>([]);
  const dispatchedMaintenanceAlertsRef = useRef<Set<string>>(new Set());

  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const tasksRef = useRef<Task[]>([]);
  const studentsRef = useRef<Student[]>([]);
  const presetsRef = useRef<TaskPreset[]>([]);
  const usersRef = useRef<User[]>([]);
  const lastPresenceWriteRef = useRef<{ userId: string; timestamp: number } | null>(null);

  const recordUserPresence = (userId: string, force = false) => {
    if (isFeedbackRoute || !userId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const nowMs = Date.now();
    const PRESENCE_THROTTLE_MS = 2 * 60 * 1000;
    if (
      !force &&
      lastPresenceWriteRef.current?.userId === userId &&
      nowMs - lastPresenceWriteRef.current.timestamp < PRESENCE_THROTTLE_MS
    ) {
      return;
    }

    lastPresenceWriteRef.current = { userId, timestamp: nowMs };
    updateDoc(doc(db, 'users', userId), {
      lastSeenAt: new Date(nowMs).toISOString(),
    }).catch((err) => {
      console.error('Error updating user lastSeenAt:', err);
    });
  };

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { studentsRef.current = students; }, [students]);
  useEffect(() => { presetsRef.current = presets; }, [presets]);
  useEffect(() => { usersRef.current = users; }, [users]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (completingTaskIds.size > 0 || pendingTaskIds.size > 0) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [completingTaskIds, pendingTaskIds]);

  const t = (key: keyof typeof translations['en']) => {
    return translations[language][key] || key;
  };

  // Synchronize Firestore presets & backfills (bypassed on public feedback route)
  useEffect(() => {
    if (isFeedbackRoute) return;
    const initDatabase = async () => {
      try {
        // Backfill counselorId if missing on existing students in Firestore
        const studentsSnap = await getDocs(collection(db, 'students'));
        for (const docSnap of studentsSnap.docs) {
          const data = docSnap.data();
          if (data.counselor && !data.counselorId) {
            await updateDoc(doc(db, 'students', docSnap.id), { counselorId: data.counselor });
          }
        }
      } catch (e) {
        console.error('Error backfilling student counselorId:', e);
      }

      try {
        const presetsSnap = await getDocs(collection(db, 'presets'));
        if (presetsSnap.empty) {
          for (const p of initialPresets) await setDoc(doc(db, 'presets', p.id), p);
        }
      } catch (e) {
        console.error('Error initializing presets:', e);
      }
    };
    initDatabase();
  }, []);

  // Real-time Firestore Listeners & Session Hydration
  useEffect(() => {
    if (isFeedbackRoute) {
      setIsAuthLoading(false);
      setIsInitialized(true);
      return;
    }

    // ── Express Tracker bridge: identity comes from Firebase Auth (see LogisticsShell) ──
    // The logistics users/{uid} document holds operational data (wallet, location, FCM tokens).
    // Name and role always follow the Express Tracker profile, so they are re-synced here.
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      usersRef.current = fetchedUsers;
      setUsers(fetchedUsers);

      if (!identity) {
        setCurrentUser(null);
        setIsAuthLoading(false);
        setIsInitialized(true);
        return;
      }
      const own = fetchedUsers.find(u => u.id === identity.uid);
      if (!own || own.name !== identity.name || own.role !== identity.role || (own as any).etRole !== identity.etRole) {
        setDoc(doc(db, 'users', identity.uid), {
          name: identity.name, role: identity.role, etRole: identity.etRole, username: identity.email,
          ...(own ? {} : { walletBalance: 0 }),
        }, { merge: true }).catch((e) => console.error('Logistics profile sync failed:', e));
      }
      const merged = { ...(own ?? { id: identity.uid, walletBalance: 0 }), id: identity.uid, name: identity.name, role: identity.role, etRole: identity.etRole } as User;
      setCurrentUser(prev => {
        if (prev && prev.name === merged.name && prev.role === merged.role && prev.walletBalance === merged.walletBalance && prev.avatar === merged.avatar) return prev;
        return merged;
      });
      setIsAuthLoading(false);
      setIsInitialized(true);
    }, (err) => {
      console.error('Users snapshot listener error:', err);
      setIsAuthLoading(false);
      setIsInitialized(true);
    });

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(loaded);
      studentsRef.current = loaded;
    }, (err) => console.error('Students snapshot listener error:', err));

    const unsubTasks = onSnapshot(collection(db, 'tasks'), { includeMetadataChanges: true }, (snapshot) => {
      const pending = new Set<string>();
      const loadedTasks = snapshot.docs.map(docSnap => {
        if (docSnap.metadata.hasPendingWrites) {
          pending.add(docSnap.id);
        }
        const data = docSnap.data() as Task;
        return normalizeLoadedTask({ id: docSnap.id, ...data });
      });
      setPendingTaskIds(pending);
      setTasks(loadedTasks);
      tasksRef.current = loadedTasks;
    }, (err) => console.error('Tasks snapshot listener error:', err));

    const unsubPresets = onSnapshot(collection(db, 'presets'), (snapshot) => {
      const loadedPresets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskPreset));
      presetsRef.current = loadedPresets;
      setPresets(loadedPresets);
    }, (err) => console.error('Presets snapshot listener error:', err));

    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (snapshot) => {
      const validNotifs: AppNotification[] = [];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const isDelayed = 
          data.type === 'task_delayed' || 
          data.title === 'Task Delayed' || 
          (typeof data.title === 'string' && data.title.toLowerCase().includes('delayed')) ||
          (typeof data.message === 'string' && data.message.toLowerCase().includes('marked as delayed'));

        if (!isDelayed) {
          validNotifs.push({ id: docSnap.id, ...data } as AppNotification);
        }
      });

      setNotifications(validNotifs);
    }, (err) => console.error('Notifications snapshot listener error:', err));

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    }, (err) => console.error('Vehicles snapshot listener error:', err));

    const unsubVehicleLogs = onSnapshot(collection(db, 'vehicleLogs'), (snapshot) => {
      setVehicleLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VehicleLog)));
    }, (err) => console.error('VehicleLogs snapshot listener error:', err));

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (err) => console.error('Expenses snapshot listener error:', err));

    const unsubTopups = onSnapshot(collection(db, 'topups'), (snapshot) => {
      setTopups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TopUpRecord)));
    }, (err) => console.error('Topups snapshot listener error:', err));

    const unsubFeedback = onSnapshot(collection(db, 'feedback'), (snapshot) => {
      setFeedbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskFeedback)));
    }, (err) => console.error('Feedback snapshot listener error:', err));

    const unsubOvertimeLogs = onSnapshot(collection(db, 'overtimeLogs'), (snapshot) => {
      setOvertimeLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OvertimeLog)));
    }, (err) => console.error('OvertimeLogs snapshot listener error:', err));

    const unsubTaskRequests = onSnapshot(collection(db, 'taskRequests'), (snapshot) => {
      setTaskRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskRequest)));
    }, (err) => console.error('TaskRequests snapshot listener error:', err));

    const unsubCounselorTasks = onSnapshot(collection(db, 'counselorTasks'), (snapshot) => {
      setCounselorTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CounselorTask)));
    }, (err) => console.error('CounselorTasks snapshot listener error:', err));

    return () => {
      unsubUsers();
      unsubStudents();
      unsubTasks();
      unsubPresets();
      unsubNotifications();
      unsubVehicles();
      unsubVehicleLogs();
      unsubExpenses();
      unsubTopups();
      unsubFeedback();
      unsubOvertimeLogs();
      unsubTaskRequests();
      unsubCounselorTasks();
    };
  }, [identity?.uid, identity?.name, identity?.role, identity?.etRole]);

  // Derive real-time joined feedback records from /feedback collection and /tasks where feedbackSubmitted === true
  const feedbackEntries = useMemo<MappedFeedbackEntry[]>(() => {
    const entries: MappedFeedbackEntry[] = [];
    const consumedFeedbackDocIds = new Set<string>();

    // 1. Join tasks with feedback (feedbackSubmitted === true or task.feedback or matching /feedback doc)
    tasks.forEach(task => {
      const matchingDocs = feedbacks.filter(f => f.taskId === task.id);
      matchingDocs.forEach(d => {
        if (d.id) consumedFeedbackDocIds.add(d.id);
      });

      const latestDoc = matchingDocs.sort(
        (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
      )[0];

      const hasFeedback = (task.feedbackSubmitted && !!task.feedback) || !!task.feedback || !!latestDoc;
      if (!hasFeedback) return;

      const mergedFeedback: TaskFeedback = {
        ...(task.feedback || {}),
        ...(latestDoc || {}),
        id: latestDoc?.id || task.feedback?.id || `fb-${task.id}`,
        taskId: task.id,
        studentEmail: latestDoc?.studentEmail || task.feedback?.studentEmail || task.studentEmail,
        rating: Number(latestDoc?.rating ?? task.feedback?.rating ?? 5),
        satisfaction: latestDoc?.satisfaction || task.feedback?.satisfaction || 'satisfied',
        subtaskRatings: latestDoc?.subtaskRatings || task.feedback?.subtaskRatings,
        comments: latestDoc?.comments ?? task.feedback?.comments,
        answers: latestDoc?.answers || task.feedback?.answers,
        dynamicAnswers: latestDoc?.dynamicAnswers || task.feedback?.dynamicAnswers,
        submittedAt: latestDoc?.submittedAt || task.feedback?.submittedAt || task.completedAt || task.createdAt,
      };

      const studentById = students.find(s => s.id === task.studentId);
      const studentByEmail = !studentById && mergedFeedback.studentEmail
        ? students.find(s => s.email && s.email.trim().toLowerCase() === mergedFeedback.studentEmail!.trim().toLowerCase())
        : undefined;
      const student = studentById || studentByEmail;

      const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
      const assigneeId = task.assigneeId || student?.assignedOfficerId;
      const officer = assigneeId ? users.find(u => u.id === assigneeId) : undefined;

      entries.push({
        id: mergedFeedback.id || `fb-${task.id}`,
        feedback: mergedFeedback,
        taskId: task.id,
        task,
        studentId: student?.id || task.studentId,
        studentEmail: mergedFeedback.studentEmail || student?.email,
        student,
        presetId: preset?.id,
        preset,
        assigneeId,
        officer,
      });
    });

    // 2. Include any remaining /feedback documents not yet matched to an existing task in tasks
    feedbacks.forEach(docItem => {
      if (docItem.id && consumedFeedbackDocIds.has(docItem.id)) return;
      const linkedTask = tasks.find(t => t.id === docItem.taskId);
      const studentById = linkedTask ? students.find(s => s.id === linkedTask.studentId) : undefined;
      const studentByEmail = !studentById && docItem.studentEmail
        ? students.find(s => s.email && s.email.trim().toLowerCase() === docItem.studentEmail!.trim().toLowerCase())
        : undefined;
      const student = studentById || studentByEmail;

      const preset = linkedTask && hasPresetTemplate(linkedTask) ? presets.find(p => p.id === linkedTask.presetId) : undefined;
      const assigneeId = linkedTask?.assigneeId || student?.assignedOfficerId;
      const officer = assigneeId ? users.find(u => u.id === assigneeId) : undefined;

      entries.push({
        id: docItem.id || `fb-${docItem.taskId}`,
        feedback: {
          ...docItem,
          rating: Number(docItem.rating ?? 5),
          satisfaction: docItem.satisfaction || 'satisfied',
        },
        taskId: docItem.taskId,
        task: linkedTask,
        studentId: student?.id || linkedTask?.studentId,
        studentEmail: docItem.studentEmail || student?.email,
        student,
        presetId: preset?.id,
        preset,
        assigneeId,
        officer,
      });
    });

    return entries.sort(
      (a, b) => new Date(b.feedback.submittedAt || 0).getTime() - new Date(a.feedback.submittedAt || 0).getTime()
    );
  }, [feedbacks, tasks, students, presets, users]);

  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;

  // Website Presence / Last Appearance Tracking across all authenticated roles
  useEffect(() => {
    if (isFeedbackRoute || !currentUserId) return;

    recordUserPresence(currentUserId);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordUserPresence(currentUserId);
      }
    };

    const handleOnlinePresence = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        recordUserPresence(currentUserId);
      }
    };

    const PRESENCE_HEARTBEAT_MS = 5 * 60 * 1000;
    const intervalId = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        recordUserPresence(currentUserId);
      }
    }, PRESENCE_HEARTBEAT_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnlinePresence);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnlinePresence);
    };
  }, [currentUserId]);

  // Strictly Admin-Only Quality Control Listeners (never subscribed for non-admin roles)
  useEffect(() => {
    if (isFeedbackRoute || currentUserRole !== 'admin') {
      setQcReviews([]);
      setQcDailyReports([]);
      setQcOfficerEvaluations([]);
      return;
    }

    const unsubQcReviews = onSnapshot(collection(db, 'qcReviews'), (snapshot) => {
      setQcReviews(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as QCTaskReview)));
    }, (err) => console.error('qcReviews snapshot listener error:', err));

    const unsubQcDailyReports = onSnapshot(collection(db, 'qcDailyReports'), (snapshot) => {
      setQcDailyReports(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as QCDailyReport)));
    }, (err) => console.error('qcDailyReports snapshot listener error:', err));

    const unsubQcOfficerEvaluations = onSnapshot(collection(db, 'qcOfficerEvaluations'), (snapshot) => {
      setQcOfficerEvaluations(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as QCOfficerEvaluation)));
    }, (err) => console.error('qcOfficerEvaluations snapshot listener error:', err));

    return () => {
      unsubQcReviews();
      unsubQcDailyReports();
      unsubQcOfficerEvaluations();
    };
  }, [currentUserRole]);

  // GPS Tracking for Field Officers (Throttled with displacement filtering to prevent Firestore mutation flooding)
  useEffect(() => {
    let watchId: number | undefined;
    let lastUpdatedAt = 0;
    let lastCoords: { lat: number; lng: number } | null = null;
    let isUpdating = false;

    // Helper to calculate distance in meters between two GPS coordinates (Haversine formula)
    const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000; // Earth radius in meters
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    if (currentUserId && currentUserRole === 'field_officer' && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const now = Date.now();
          const { latitude, longitude } = position.coords;

          if (isUpdating) return;

          const timeSinceLastUpdate = now - lastUpdatedAt;
          const isFirstFix = lastUpdatedAt === 0;

          // Calculate displacement from last recorded position
          const distanceMoved = lastCoords
            ? getDistanceMeters(lastCoords.lat, lastCoords.lng, latitude, longitude)
            : Infinity;

          // Throttling rules:
          // 1. Initial location on load -> update immediately
          // 2. User moving (>= 30 meters displacement) -> update at most once every 60 seconds
          // 3. User stationary (< 30 meters displacement) -> update at most once every 5 minutes (heartbeat)
          const hasMovedSignificantly = distanceMoved >= 30;
          const isMovingIntervalMet = timeSinceLastUpdate >= 60000; // 1 minute
          const isStationaryHeartbeatMet = timeSinceLastUpdate >= 300000; // 5 minutes

          const shouldUpdate =
            isFirstFix ||
            (hasMovedSignificantly && isMovingIntervalMet) ||
            isStationaryHeartbeatMet;

          if (!shouldUpdate) return;

          isUpdating = true;
          lastUpdatedAt = now;
          lastCoords = { lat: latitude, lng: longitude };

          try {
            await updateDoc(doc(db, 'users', currentUserId), {
              lastLocation: {
                lat: latitude,
                lng: longitude,
                timestamp: new Date(now).toISOString()
              }
            });
          } catch (e) {
            console.error('Error updating location:', e);
          } finally {
            isUpdating = false;
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
      );
    }
    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUserId, currentUserRole]);

  const startTask = async (taskId: string, studentEmail?: string) => {
    const taskRef = doc(db, 'tasks', taskId);
    let rawTask = tasksRef.current.find(t => t.id === taskId);
    if (!rawTask) {
      const snap = await getDoc(taskRef);
      if (!snap.exists()) return;
      rawTask = { id: snap.id, ...snap.data() } as Task;
    }

    const task = normalizeLoadedTask(rawTask);
    // Completed or cancelled tasks must never be restarted by field execution actions
    if (task.status === 'completed' || task.status === 'cancelled') {
      return;
    }

    const student = !task.isNonStudentTask && task.studentId
      ? studentsRef.current.find(s => s.id === task.studentId)
      : undefined;
    const email = studentEmail?.trim().toLowerCase() || task.studentEmail || student?.email;
    const startedAt = (task.status === 'pending' || !task.startedAt)
      ? new Date().toISOString()
      : task.startedAt;

    const updates: any = {
      status: 'in_progress',
      startedAt
    };
    if (email && !task.isNonStudentTask) {
      updates.studentEmail = email;
    }
    await updateDoc(taskRef, sanitizeForFirestore(updates));

    if (task.studentId && !task.isNonStudentTask) {
      const studentRef = doc(db, 'students', task.studentId);
      await updateDoc(studentRef, { status: 'in_progress' });
    }
  };

  const updateTaskStudentEmail = async (taskId: string, studentEmail: string) => {
    const email = studentEmail.trim().toLowerCase();
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, sanitizeForFirestore({ studentEmail: email }));
  };

  const submitTaskFeedback = async (taskId: string, feedbackData: Omit<TaskFeedback, 'id' | 'submittedAt'>) => {
    const submittedAt = new Date().toISOString();
    const batch = writeBatch(db);
    const feedbackDocRef = doc(collection(db, 'feedback'));

    const feedbackRecord: TaskFeedback = {
      id: feedbackDocRef.id,
      taskId,
      ...feedbackData,
      submittedAt,
    };

    batch.set(feedbackDocRef, sanitizeForFirestore(feedbackRecord));

    const taskRef = doc(db, 'tasks', taskId);
    batch.update(taskRef, sanitizeForFirestore({
      feedbackSubmitted: true,
      feedback: feedbackRecord,
    }));

    await batch.commit();
  };

  const retryPendingTaskSync = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('No internet connection. Waiting for network signal...');
      return false;
    }
    try {
      await waitForFirestoreSync();
      toast.success('All pending changes confirmed synced with cloud!');
      return true;
    } catch (err: any) {
      console.error('Error awaiting pending writes:', err);
      toast.error('Sync check timed out or failed. Will retry automatically.');
      return false;
    }
  };

  const updateTaskStatus = async (
    taskId: string,
    status: Task['status'],
    extra?: { studentEmail?: string; notes?: string }
  ): Promise<{ synced: boolean; queuedLocally: boolean }> => {
    let rawCurrentTask = tasksRef.current.find(t => t.id === taskId);
    const taskRef = doc(db, 'tasks', taskId);

    if (!rawCurrentTask) {
      try {
        const snap = await getDoc(taskRef);
        if (!snap.exists()) {
          throw new Error('Task not found');
        }
        rawCurrentTask = { id: snap.id, ...snap.data() } as Task;
      } catch (fetchErr: any) {
        console.error('Could not fetch task from Firestore:', fetchErr);
        throw new Error(fetchErr?.message || 'Task not found');
      }
    }

    const currentTask = normalizeLoadedTask(rawCurrentTask);
    assertExecutionStatusTransition(currentTask, status);

    let normalizedExtra = extra;
    if (status === 'completed') {
      const validatedReport = assertLogisticReportForCompletion(currentTask.notes, extra?.notes);
      normalizedExtra = {
        ...extra,
        notes: validatedReport
      };
    }

    const taskUpdates = buildTaskStatusUpdatePayload({
      existingTask: currentTask,
      status,
      extra: normalizedExtra
    });

    if (status === 'completed') {
      setCompletingTaskIds(prev => new Set(prev).add(taskId));
    }

    // Execute standalone primary update on tasks/{taskId}
    const primaryWritePromise = updateDoc(taskRef, sanitizeForFirestore(taskUpdates));

    // Keep write settlement monitored in AppContext regardless of calling component unmount
    const monitoredWrite = primaryWritePromise
      .then(() => {
        setCompletingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });

        // Run decoupled side effects asynchronously in background without blocking or reverting task completion
        if (status === 'completed' && currentTask) {
          const mergedTask: Task = { ...currentTask, ...taskUpdates } as Task;
          const updatedAllTasks = tasksRef.current.some(t => t.id === taskId)
            ? tasksRef.current.map(t => (t.id === taskId ? mergedTask : t))
            : [...tasksRef.current, mergedTask];
          executeCompletionSideEffects({
            db,
            taskId,
            task: mergedTask,
            student: !mergedTask.isNonStudentTask
              ? studentsRef.current.find(s => s.id === mergedTask.studentId)
              : undefined,
            preset: hasPresetTemplate(mergedTask)
              ? presetsRef.current.find(p => p.id === mergedTask.presetId)
              : undefined,
            officer: usersRef.current.find(u => u.id === mergedTask.assigneeId),
            allTasks: updatedAllTasks,
            language,
            targetEmail: extra?.studentEmail
          }).catch(err => {
            console.warn('[Completion SideEffect Execution Failed]:', err);
          });
        } else if (status === 'in_progress' && currentTask?.studentId && !currentTask.isNonStudentTask) {
          const studentRef = doc(db, 'students', currentTask.studentId);
          updateDoc(studentRef, { status: 'in_progress' }).catch(err => {
            console.warn('Could not update student to in_progress:', err);
          });
        }
      })
      .catch((err) => {
        setCompletingTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        console.error('Firestore primary task update rejected:', err);
        toast.error(`Cloud database sync failed: ${err.message || 'Write rejected'}`);
        throw err;
      });

    // If offline, resolve immediately indicating device queue
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: false, queuedLocally: true };
    }

    // 3500ms race timeout to avoid freezing UI on slow cellular connection
    const timeoutPromise = new Promise<{ synced: false; queuedLocally: true }>((resolve) =>
      setTimeout(() => resolve({ synced: false, queuedLocally: true }), 3500)
    );

    try {
      const result = await Promise.race([
        monitoredWrite.then(() => ({ synced: true, queuedLocally: false })),
        timeoutPromise
      ]);
      return result;
    } catch (err) {
      throw err;
    }
  };

  const updateSubTaskStatus = async (taskId: string, subTaskId: string, isCompleted: boolean, isSkipped: boolean = false) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;

    const commRegex = /communicat|تواصل/i;
    const targetSubTask = task.subTasks?.find(st => st.id === subTaskId);
    const isCommStep = targetSubTask && (commRegex.test(targetSubTask.titleEn || '') || commRegex.test(targetSubTask.titleAr || ''));

    const updatedSubTasks = task.subTasks.map(st => st.id === subTaskId ? { ...st, isCompleted, isSkipped, completedAt: (isCompleted || isSkipped) ? new Date().toISOString() : undefined } : st);
    
    const taskRef = doc(db, 'tasks', taskId);
    const updates: any = { subTasks: updatedSubTasks };
    if (isCommStep) {
      updates.studentCommunicated = isCompleted;
    }
    // Removed auto-complete logic here so Field Officers can submit a final report before completing
    await updateDoc(taskRef, sanitizeForFirestore(updates));
  };

  const addMediaToSubTask = async (taskId: string, subTaskId: string, mediaUrl: string, location: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    
    const commRegex = /communicat|تواصل/i;
    const targetSubTask = task.subTasks?.find(st => st.id === subTaskId);
    const isCommStep = targetSubTask && (commRegex.test(targetSubTask.titleEn || '') || commRegex.test(targetSubTask.titleAr || ''));

    const newMediaItem = { url: mediaUrl, timestamp: new Date().toISOString(), location };
    const updatedSubTasks = task.subTasks.map(st => st.id === subTaskId ? {
      ...st,
      isCompleted: true,
      completedAt: st.completedAt || new Date().toISOString(),
      media: [...(st.media || []), newMediaItem]
    } : st);
    
    const updates: any = { subTasks: updatedSubTasks };
    if (isCommStep) {
      updates.studentCommunicated = true;
      updates.studentCommunicationMedia = [
        ...(task.studentCommunicationMedia || []),
        newMediaItem
      ];
    }

    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore(updates));
  };

  const removeMediaFromSubTask = async (taskId: string, subTaskId: string, mediaIndex: number) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    
    const commRegex = /communicat|تواصل/i;
    const targetSubTask = task.subTasks?.find(st => st.id === subTaskId);
    const isCommStep = targetSubTask && (commRegex.test(targetSubTask.titleEn || '') || commRegex.test(targetSubTask.titleAr || ''));

    let remainingMedia: MediaItem[] = [];
    const updatedSubTasks = task.subTasks.map(st => {
      if (st.id === subTaskId && st.media) {
        const newMedia = st.media.filter((_, idx) => idx !== mediaIndex);
        remainingMedia = newMedia;
        return {
          ...st,
          media: newMedia,
          isCompleted: st.requiresProof && newMedia.length === 0 ? false : st.isCompleted
        };
      }
      return st;
    });
    
    const updates: any = { subTasks: updatedSubTasks };
    if (isCommStep) {
      updates.studentCommunicationMedia = remainingMedia;
      updates.studentCommunicated = remainingMedia.length > 0;
    }

    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore(updates));
  };

  const updateTaskNotes = async (taskId: string, notes: string) => {
    const trimmedNotes = notes.trim();
    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore({
      notes: trimmedNotes,
      notesUpdatedAt: trimmedNotes ? nowIso : undefined
    }));
  };

  const updateTaskAssignee = async (taskId: string, assigneeId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore({ assigneeId }));
    
    const preset = task && hasPresetTemplate(task)
      ? presetsRef.current.find(p => p.id === task.presetId)
      : undefined;
    const student = task && !task.isNonStudentTask && task.studentId
      ? studentsRef.current.find(s => s.id === task.studentId)
      : undefined;
    
    if (task && task.assigneeId !== assigneeId) {
      const taskTitle = resolveCompletionTaskTitle(task, preset, 'en');
      const beneficiary = task.isNonStudentTask
        ? (task.nonStudentTitle || 'Non-Student Task')
        : (student?.fullName || 'a student');
      await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
        userId: assigneeId,
        title: 'Task Reassigned',
        message: `You have been reassigned to "${taskTitle}" (${beneficiary}).`,
        createdAt: new Date().toISOString(),
        isRead: false,
        type: 'task_assigned',
        relatedTaskId: taskId
      }));
    }
  };

  const updateTaskCommunication = async (taskId: string, isCommunicated: boolean, mediaUrl?: string, location?: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    
    const updates: any = { studentCommunicated: isCommunicated };
    
    let updatedMedia = task.studentCommunicationMedia || [];
    if (mediaUrl) {
      const newMediaItem = {
        url: mediaUrl,
        timestamp: new Date().toISOString(),
        location: location || 'Location unavailable'
      };
      updatedMedia = [...updatedMedia, newMediaItem];
      updates.studentCommunicationMedia = updatedMedia;
    }

    // Bidirectional sync with any 'Communicate with Student' subtask
    if (task.subTasks && task.subTasks.length > 0) {
      const commRegex = /communicat|تواصل/i;
      const updatedSubTasks = task.subTasks.map(st => {
        const isCommStep = commRegex.test(st.titleEn || '') || commRegex.test(st.titleAr || '');
        if (isCommStep) {
          const currentMedia = st.media || [];
          const newMediaList = mediaUrl 
            ? [...currentMedia, { url: mediaUrl, timestamp: new Date().toISOString(), location: location || 'Location unavailable' }]
            : currentMedia;

          return {
            ...st,
            isCompleted: isCommunicated,
            completedAt: isCommunicated ? (st.completedAt || new Date().toISOString()) : undefined,
            media: newMediaList
          };
        }
        return st;
      });
      updates.subTasks = updatedSubTasks;
    }
    
    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore(updates));
  };

  const removeCommunicationMedia = async (taskId: string, mediaIndex: number) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    
    const newMedia = (task.studentCommunicationMedia || []).filter((_, idx) => idx !== mediaIndex);
    const updates: any = {
      studentCommunicationMedia: newMedia,
      studentCommunicated: newMedia.length > 0
    };

    // Synchronize removal with subtask media
    if (task.subTasks && task.subTasks.length > 0) {
      const commRegex = /communicat|تواصل/i;
      updates.subTasks = task.subTasks.map(st => {
        const isCommStep = commRegex.test(st.titleEn || '') || commRegex.test(st.titleAr || '');
        if (isCommStep) {
          return {
            ...st,
            media: newMedia,
            isCompleted: newMedia.length > 0
          };
        }
        return st;
      });
    }
    
    await updateDoc(doc(db, 'tasks', taskId), sanitizeForFirestore(updates));
  };

  const assignTask = async (taskData: Omit<Task, 'id' | 'createdAt'>): Promise<string> => {
    const isNonStudent = Boolean(taskData.isNonStudentTask);
    const normalizedPresetId = hasPresetTemplate(taskData) ? taskData.presetId!.trim() : undefined;
    const isLegacyCopiedCustom = Boolean(
      isNonStudent &&
      normalizedPresetId &&
      taskData.customTitle?.trim() &&
      taskData.nonStudentTitle?.trim() &&
      taskData.customTitle.trim() === taskData.nonStudentTitle.trim()
    );

    const normalizedTaskPayload: Omit<Task, 'id'> = {
      ...taskData,
      isNonStudentTask: isNonStudent,
      studentId: isNonStudent ? undefined : taskData.studentId,
      studentEmail: isNonStudent ? undefined : (taskData.studentEmail?.trim().toLowerCase() || undefined),
      nonStudentTitle: isNonStudent ? (taskData.nonStudentTitle?.trim() || undefined) : undefined,
      nonStudentContact: isNonStudent ? (taskData.nonStudentContact?.trim() || undefined) : undefined,
      presetId: normalizedPresetId,
      customTitle: isLegacyCopiedCustom ? undefined : (taskData.customTitle?.trim() || undefined),
      customTitleAr: isLegacyCopiedCustom ? undefined : (taskData.customTitleAr?.trim() || undefined),
      status: taskData.status === 'in_progress' ? 'in_progress' : 'pending',
      completedAt: undefined,
      createdAt: new Date().toISOString(),
      subTasks: Array.isArray(taskData.subTasks) ? taskData.subTasks : [],
    };

    const docRef = await addDoc(collection(db, 'tasks'), sanitizeForFirestore(normalizedTaskPayload));
    
    const preset = normalizedPresetId
      ? presetsRef.current.find(p => p.id === normalizedPresetId)
      : undefined;
    const student = !isNonStudent && normalizedTaskPayload.studentId
      ? studentsRef.current.find(s => s.id === normalizedTaskPayload.studentId)
      : undefined;
    const taskTitle = resolveCompletionTaskTitle(normalizedTaskPayload, preset, 'en');
    const beneficiary = isNonStudent
      ? (normalizedTaskPayload.nonStudentTitle || 'Non-Student Task')
      : (student?.fullName || 'a student');

    await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
      userId: normalizedTaskPayload.assigneeId,
      title: 'New Task Assigned',
      message: `You have been assigned to "${taskTitle}" (${beneficiary}).`,
      createdAt: new Date().toISOString(),
      isRead: false,
      type: 'task_assigned',
      relatedTaskId: docRef.id
    }));

    return docRef.id;
  };

  const updateTask = async (taskId: string, updates: Partial<Task>): Promise<void> => {
    const taskRef = doc(db, 'tasks', taskId);
    let rawExistingTask = tasksRef.current.find(t => t.id === taskId);
    if (!rawExistingTask) {
      const snap = await getDoc(taskRef);
      if (snap.exists()) {
        rawExistingTask = { id: snap.id, ...snap.data() } as Task;
      }
    }
    if (!rawExistingTask) throw new Error('Task not found');

    const rawExistingStatus = (rawExistingTask as { status?: unknown }).status;
    const existingTask = normalizeLoadedTask(rawExistingTask);

    const normalizedUpdates: Partial<Task> = { ...updates };
    if ('presetId' in normalizedUpdates && !hasPresetTemplate(normalizedUpdates)) {
      normalizedUpdates.presetId = undefined;
    }
    if ('studentEmail' in normalizedUpdates && typeof normalizedUpdates.studentEmail === 'string') {
      normalizedUpdates.studentEmail = normalizedUpdates.studentEmail.trim().toLowerCase() || undefined;
    }

    const clearableOptionalFields: Array<keyof Task> = [
      'studentId',
      'studentEmail',
      'nonStudentTitle',
      'nonStudentContact',
      'presetId',
      'customTitle',
      'customTitleAr',
      'vehicleId',
      'taskDate',
      'taskTime',
      'hotel',
      'flightNumber',
      'notes',
      'coordinatorNote1',
      'coordinatorNote2',
      'startedAt',
      'completedAt',
    ];

    const sanitizedUpdates: Record<string, any> = sanitizeForFirestore(normalizedUpdates);
    const deletedFields = new Set<keyof Task>();

    for (const field of clearableOptionalFields) {
      if (field in normalizedUpdates) {
        const val = normalizedUpdates[field];
        if (val === undefined || val === '' || (field === 'presetId' && val === 'custom')) {
          sanitizedUpdates[field] = deleteField();
          deletedFields.add(field);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const targetStatus = normalizedUpdates.status ?? existingTask.status;

    if (normalizedUpdates.status === 'completed' && existingTask.status !== 'completed') {
      const overrideNotes = 'notes' in normalizedUpdates ? (normalizedUpdates.notes ?? '') : undefined;
      const validatedReport = assertLogisticReportForCompletion(existingTask.notes, overrideNotes);
      sanitizedUpdates.notes = validatedReport;
      normalizedUpdates.notes = validatedReport;
      deletedFields.delete('notes');
    }

    if (targetStatus === 'pending' && existingTask.status !== 'pending') {
      sanitizedUpdates.status = 'pending';
      sanitizedUpdates.startedAt = deleteField();
      sanitizedUpdates.completedAt = deleteField();
      deletedFields.add('startedAt');
      deletedFields.add('completedAt');
    } else if (targetStatus === 'in_progress' && existingTask.status !== 'in_progress') {
      sanitizedUpdates.status = 'in_progress';
      if (!sanitizedUpdates.startedAt && (existingTask.status === 'pending' || !existingTask.startedAt)) {
        sanitizedUpdates.startedAt = nowIso;
      }
      if (existingTask.completedAt && !('completedAt' in normalizedUpdates)) {
        sanitizedUpdates.completedAt = deleteField();
        deletedFields.add('completedAt');
      }
    } else if (targetStatus === 'completed') {
      // Self-heal legacy/stale Firestore docs (e.g. 'delayed' with completedAt) and preserve completedAt
      if (rawExistingStatus !== 'completed') {
        sanitizedUpdates.status = 'completed';
      }
      if (deletedFields.has('completedAt') || !hasValidCompletedAt({ ...existingTask, completedAt: typeof sanitizedUpdates.completedAt === 'string' ? sanitizedUpdates.completedAt : existingTask.completedAt })) {
        sanitizedUpdates.completedAt = hasValidCompletedAt(existingTask) ? existingTask.completedAt : nowIso;
        deletedFields.delete('completedAt');
      }
    } else if (targetStatus === 'cancelled' && existingTask.status === 'completed' && !('completedAt' in normalizedUpdates)) {
      sanitizedUpdates.completedAt = deleteField();
      deletedFields.add('completedAt');
    }

    await updateDoc(taskRef, sanitizedUpdates);

    const mergedTask: Task = {
      ...existingTask,
      ...normalizedUpdates,
      status: targetStatus,
    };
    if (!deletedFields.has('startedAt') && typeof sanitizedUpdates.startedAt === 'string') {
      mergedTask.startedAt = sanitizedUpdates.startedAt;
    }
    if (!deletedFields.has('completedAt') && typeof sanitizedUpdates.completedAt === 'string') {
      mergedTask.completedAt = sanitizedUpdates.completedAt;
    }
    deletedFields.forEach(field => {
      delete (mergedTask as any)[field];
    });
    mergedTask.status = normalizeTaskStatus(mergedTask);

    const preset = hasPresetTemplate(mergedTask)
      ? presetsRef.current.find(p => p.id === mergedTask.presetId)
      : undefined;
    const student = !mergedTask.isNonStudentTask && mergedTask.studentId
      ? studentsRef.current.find(s => s.id === mergedTask.studentId)
      : undefined;

    // If assignee changed, send notification to the new assignee
    if (normalizedUpdates.assigneeId && normalizedUpdates.assigneeId !== existingTask.assigneeId) {
      const taskTitle = resolveCompletionTaskTitle(mergedTask, preset, 'en');
      const beneficiary = mergedTask.isNonStudentTask
        ? (mergedTask.nonStudentTitle || 'Non-Student Task')
        : (student?.fullName || 'a student');

      await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
        userId: normalizedUpdates.assigneeId,
        title: 'Task Reassigned',
        message: `You have been reassigned to "${taskTitle}" (${beneficiary}).`,
        createdAt: new Date().toISOString(),
        isRead: false,
        type: 'task_assigned',
        relatedTaskId: taskId
      }));
    }

    // Sync student status/milestones on status transitions
    if (normalizedUpdates.status === 'in_progress' && existingTask.status !== 'in_progress' && !mergedTask.isNonStudentTask && mergedTask.studentId) {
      try {
        await updateDoc(doc(db, 'students', mergedTask.studentId), { status: 'in_progress' });
      } catch (studentErr) {
        console.warn(`[updateTask] Could not update student ${mergedTask.studentId} to in_progress:`, studentErr);
      }
    } else if (normalizedUpdates.status === 'completed' && existingTask.status !== 'completed' && !mergedTask.isNonStudentTask && mergedTask.studentId) {
      if (student) {
        try {
          const taskTitle = resolveCompletionTaskTitle(mergedTask, preset, language);
          const updatedAllTasks = tasksRef.current.map(t => (t.id === taskId ? mergedTask : t));
          const studentPatch = buildStudentCompletionPatch({
            student,
            taskId,
            taskTitle,
            allTasks: updatedAllTasks
          });
          const studentRef = doc(db, 'students', student.id);
          await updateDoc(studentRef, sanitizeForFirestore(studentPatch) as any);
        } catch (studentErr) {
          console.warn(`[updateTask] Could not update student milestone for ${mergedTask.studentId}:`, studentErr);
        }
      }
    }
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    if (currentUser?.role !== 'admin') {
      throw new Error('Unauthorized: Only administrators can delete tasks.');
    }

    const taskRef = doc(db, 'tasks', taskId);
    
    // 1. Delete task doc
    await deleteDoc(taskRef);

    // 2. Unlink any linked expenses safely to preserve officer wallet and receipts
    try {
      const linkedExpenses = expenses.filter(e => e.taskId === taskId);
      if (linkedExpenses.length > 0) {
        const batch = writeBatch(db);
        linkedExpenses.forEach(exp => {
          const expRef = doc(db, 'expenses', exp.id);
          batch.update(expRef, { taskId: null });
        });
        await batch.commit();
      }
    } catch (expErr) {
      console.error('Error unlinking expenses for deleted task:', expErr);
    }

    // 3. Reset any originating taskRequest
    try {
      const linkedRequests = taskRequests.filter(r => (r as any).assignedTaskId === taskId);
      if (linkedRequests.length > 0) {
        const batch = writeBatch(db);
        linkedRequests.forEach(req => {
          const reqRef = doc(db, 'taskRequests', req.id);
          batch.update(reqRef, { assignedTaskId: null });
        });
        await batch.commit();
      }
    } catch (reqErr) {
      console.error('Error unlinking task requests for deleted task:', reqErr);
    }
  };

  const createTaskRequest = async (requestData: Omit<TaskRequest, 'id' | 'createdAt' | 'status'>) => {
    const normalizedPresetId = requestData.presetId && requestData.presetId !== 'custom'
      ? requestData.presetId
      : undefined;
    const docRef = await addDoc(collection(db, 'taskRequests'), sanitizeForFirestore({
      ...requestData,
      presetId: normalizedPresetId,
      status: 'pending_approval',
      createdAt: new Date().toISOString()
    }));

    // Dispatch real-time notifications to all coordinators and admins
    const targetUsers = usersRef.current.filter(u => u.role === 'admin' || u.role === 'coordinator');
    const student = studentsRef.current.find(s => s.id === requestData.studentId);
    const preset = normalizedPresetId ? presetsRef.current.find(p => p.id === normalizedPresetId) : undefined;
    const taskName = requestData.customTitle || preset?.nameEn || 'Logistics Task';
    const counselorName = requestData.counselorName || currentUser?.name || 'Counselor';

    for (const u of targetUsers) {
      await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
        userId: u.id,
        title: 'New Task Request from Counselor',
        message: `${counselorName} requested "${taskName}" for ${student?.fullName || 'Assigned Student'}.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        type: 'task_requested',
        relatedRequestId: docRef.id
      }));
    }
  };

  const updateTaskRequestStatus = async (
    requestId: string,
    status: 'approved' | 'rejected',
    extra?: { rejectionReason?: string; assignedTaskId?: string }
  ) => {
    const reqRef = doc(db, 'taskRequests', requestId);
    const updates: any = {
      status,
      ...(extra?.rejectionReason !== undefined ? { rejectionReason: extra.rejectionReason } : {}),
      ...(extra?.assignedTaskId !== undefined ? { assignedTaskId: extra.assignedTaskId } : {})
    };
    await updateDoc(reqRef, sanitizeForFirestore(updates));

    const existingReq = taskRequests.find(r => r.id === requestId);
    if (existingReq && existingReq.counselorId) {
      const student = studentsRef.current.find(s => s.id === existingReq.studentId);
      await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
        userId: existingReq.counselorId,
        title: status === 'approved' ? 'Task Request Approved' : 'Task Request Rejected',
        message: status === 'approved' 
          ? `Your task request for ${student?.fullName || 'student'} has been approved and assigned.`
          : `Your task request for ${student?.fullName || 'student'} was rejected${extra?.rejectionReason ? `: ${extra.rejectionReason}` : '.'}`,
        createdAt: new Date().toISOString(),
        isRead: false,
        type: 'general',
        relatedRequestId: requestId
      }));
    }
  };

  const resendTaskFeedbackEmail = async (taskId: string, overrideEmail?: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const student = !task.isNonStudentTask && task.studentId
      ? studentsRef.current.find(s => s.id === task.studentId)
      : undefined;
    const targetEmail = (overrideEmail?.trim().toLowerCase()) || task.studentEmail || student?.email;

    if (!targetEmail) {
      throw new Error('No recipient email available. Please enter a valid email address.');
    }

    const taskTitle = getTaskDisplayTitle(task, presetsRef.current, language);
    const studentName = task.isNonStudentTask ? (task.nonStudentTitle || 'Valued Client') : (student?.fullName || 'Student');
    const officer = usersRef.current.find(u => u.id === task.assigneeId);
    const officerName = officer?.name || 'Field Operations Officer';
    const completedDateStr = task.completedAt 
      ? new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Public feedback link always points at the site root (Express Tracker serves it without sign-in)
    const origin = import.meta.env.VITE_PUBLIC_URL
      || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    const feedbackUrl = `${origin.replace(/\/$/, '')}/?view=feedback&taskId=${taskId}`;

    const emailPayload = getFeedbackEmailPayload({
      studentName,
      taskTitle,
      taskId,
      feedbackUrl,
      completedDateStr,
      officerName,
      origin,
    });

    const batch = writeBatch(db);
    const mailDocRef = doc(collection(db, 'mail'));
    const taskRef = doc(db, 'tasks', taskId);

    batch.set(mailDocRef, sanitizeForFirestore({
      to: [targetEmail],
      taskId: taskId,
      studentName: studentName,
      taskTitle: taskTitle,
      feedbackUrl: feedbackUrl,
      studentEmail: targetEmail,
      message: {
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      },
      createdAt: new Date().toISOString()
    }));

    batch.update(taskRef, sanitizeForFirestore({
      studentEmail: targetEmail,
      feedbackEmailSent: true,
      feedbackEmailSentAt: new Date().toISOString()
    }));

    await batch.commit();
  };

  const addPreset = async (presetData: Omit<TaskPreset, 'id'>) => {
    await addDoc(collection(db, 'presets'), sanitizeForFirestore(presetData));
  };

  const updatePreset = async (presetId: string, updatedData: Partial<TaskPreset>) => {
    await updateDoc(doc(db, 'presets', presetId), sanitizeForFirestore(updatedData));
  };

  const addStudent = async (studentData: Omit<Student, 'id' | 'status' | 'completedStages'>) => {
    const passportNumber = (studentData.passportNumber || '').trim().toUpperCase();
    const nationality = (studentData.nationality || '').trim();
    const studyIntake = (studentData.studyIntake || '').trim();
    const arrivalCategory = studentData.arrivalCategory || (studentData as any).studentType;
    const program = studentData.program;
    const pkg = studentData.package || (studentData as any).servicePackage;
    const email = (studentData.email || '').trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error('INVALID_EMAIL');
    }

    if (!passportNumber || !nationality || !studyIntake || !arrivalCategory || !program || !pkg) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    const q = query(collection(db, 'students'), where('passportNumber', '==', passportNumber));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error('DUPLICATE_PASSPORT');
    }
    
    const counselor = studentData.counselor || studentData.counselorId || '';
    const counselorId = studentData.counselorId || studentData.counselor || '';

    await addDoc(collection(db, 'students'), sanitizeForFirestore({
      ...studentData,
      passportNumber,
      nationality,
      studyIntake,
      arrivalCategory,
      studentType: arrivalCategory,
      program,
      package: pkg,
      servicePackage: pkg,
      email,
      counselor,
      counselorId,
      status: 'pending',
      completedStages: [],
    }));
  };

  const updateStudent = async (studentId: string, data: Partial<Student>) => {
    const updates: any = { ...data };
    if (updates.passportNumber !== undefined) {
      updates.passportNumber = updates.passportNumber.trim().toUpperCase();
    }
    if (updates.nationality !== undefined) {
      updates.nationality = updates.nationality.trim();
    }
    if (updates.studyIntake !== undefined) {
      updates.studyIntake = updates.studyIntake.trim();
    }
    if (updates.arrivalCategory !== undefined) {
      updates.studentType = updates.arrivalCategory;
    } else if (updates.studentType !== undefined) {
      updates.arrivalCategory = updates.studentType;
    }
    if (updates.package !== undefined) {
      updates.servicePackage = updates.package;
    } else if (updates.servicePackage !== undefined) {
      updates.package = updates.servicePackage;
    }
    if (updates.email !== undefined) {
      updates.email = updates.email ? updates.email.trim().toLowerCase() : '';
    }
    if (updates.counselor && !updates.counselorId) {
      updates.counselorId = updates.counselor;
    } else if (updates.counselorId && !updates.counselor) {
      updates.counselor = updates.counselorId;
    }
    await updateDoc(doc(db, 'students', studentId), sanitizeForFirestore(updates));
  };

  const deleteStudent = async (studentId: string): Promise<void> => {
    if (currentUser?.role !== 'admin') {
      throw new Error('Unauthorized: Only administrators can delete student profiles.');
    }

    // 1. Delete associated operational tasks cleanly using deleteTask to preserve wallet financial records
    const studentTasks = tasksRef.current.filter(t => t.studentId === studentId);
    for (const t of studentTasks) {
      try {
        await deleteTask(t.id);
      } catch (err) {
        console.error(`Failed to delete associated task ${t.id} for student ${studentId}:`, err);
      }
    }

    // 2. Cleanly delete any associated task requests
    const studentRequests = taskRequests.filter(r => r.studentId === studentId);
    if (studentRequests.length > 0) {
      try {
        const batch = writeBatch(db);
        studentRequests.forEach(req => {
          batch.delete(doc(db, 'taskRequests', req.id));
        });
        await batch.commit();
      } catch (err) {
        console.error(`Failed to delete task requests for student ${studentId}:`, err);
      }
    }

    // 3. Delete student doc from Firestore
    await deleteDoc(doc(db, 'students', studentId));
  };

  const deleteStudents = async (studentIds: string[]): Promise<void> => {
    if (currentUser?.role !== 'admin') {
      throw new Error('Unauthorized: Only administrators can delete student profiles.');
    }
    for (const id of studentIds) {
      await deleteStudent(id);
    }
  };

  // Sign-in, staff accounts and passwords are handled by Express Tracker (Firebase Auth, Admin → Users & Roles).
  const login = (_u: string, _p: string) => false;

  const logout = () => {
    try { localStorage.removeItem(STORAGE_VIEW_KEY); } catch { /* ignore */ }
    signOut(getAuth(app)).catch(() => undefined);
  };

  const addUser = async (_userData: Omit<User, 'id'>) => {
    throw new Error('Add staff in Express Tracker → Users & Roles.');
  };

  const updateUserPassword = async (_userId: string, _newPassword: string) => {
    throw new Error('Passwords are managed with Firebase Auth (password reset on the sign-in page).');
  };

  const markNotificationAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  };

  const markAllNotificationsAsRead = async () => {
    if (!currentUser) return;
    const userUnread = notifications.filter(n => n.userId === currentUser.id && !n.isRead);
    if (userUnread.length === 0) return;

    for (let i = 0; i < userUnread.length; i += 500) {
      const chunk = userUnread.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { isRead: true });
      });
      await batch.commit();
    }
  };

  const clearAllNotifications = async () => {
    if (!currentUser) return;
    const userNotifications = notifications.filter(n => n.userId === currentUser.id);
    if (userNotifications.length === 0) return;

    for (let i = 0; i < userNotifications.length; i += 500) {
      const chunk = userNotifications.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach(n => {
        batch.delete(doc(db, 'notifications', n.id));
      });
      await batch.commit();
    }
  };

  const deleteNotification = async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id));
  };

  const evaluateAndNotifyMaintenanceDue = async (vehicle: Vehicle, currentKm: number) => {
    const numericCurrentKm = Number(currentKm);
    const lastMaintKm = Number(vehicle.lastMaintenanceKm) || 0;
    if (isNaN(numericCurrentKm) || (numericCurrentKm - lastMaintKm) < 10000) {
      return;
    }

    const recipients = users.filter(u => u.role === 'admin' || u.role === 'coordinator');
    for (const recipient of recipients) {
      const cycleKey = `${vehicle.id}:${lastMaintKm}:${recipient.id}`;
      if (dispatchedMaintenanceAlertsRef.current.has(cycleKey)) {
        continue;
      }

      const alreadyNotified = notifications.some(n =>
        n.type === 'maintenance_due' &&
        n.userId === recipient.id &&
        (
          (n.relatedVehicleId === vehicle.id && (n.maintenanceCycleKm ?? 0) === lastMaintKm) ||
          (!n.relatedVehicleId && n.message.includes(`(${vehicle.plateNumber})`) && !n.isRead)
        )
      );

      if (alreadyNotified) {
        dispatchedMaintenanceAlertsRef.current.add(cycleKey);
        continue;
      }

      dispatchedMaintenanceAlertsRef.current.add(cycleKey);
      try {
        await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
          userId: recipient.id,
          title: 'Vehicle Maintenance Required (10,000 KM)',
          message: `Vehicle ${vehicle.name} (${vehicle.plateNumber}) has reached ${numericCurrentKm} km and is due for its 10,000 km periodic service.`,
          createdAt: new Date().toISOString(),
          isRead: false,
          type: 'maintenance_due',
          relatedVehicleId: vehicle.id,
          maintenanceCycleKm: lastMaintKm,
        }));
      } catch (err) {
        dispatchedMaintenanceAlertsRef.current.delete(cycleKey);
        console.error('Failed to send maintenance due notification:', err);
      }
    }
  };

  const addVehicle = async (vehicleData: Omit<Vehicle, 'id'>) => {
    const payload: Omit<Vehicle, 'id'> = { ...vehicleData };
    if (payload.lastMaintenanceKm !== undefined && payload.nextMaintenanceDueKm === undefined) {
      payload.nextMaintenanceDueKm = (Number(payload.lastMaintenanceKm) || 0) + 10000;
    }
    const docRef = await addDoc(collection(db, 'vehicles'), sanitizeForFirestore(payload));
    const currentKm = payload.currentOdometer ?? payload.lastOdometer ?? payload.mileage;
    if (currentKm !== undefined && !isNaN(Number(currentKm))) {
      await evaluateAndNotifyMaintenanceDue({ id: docRef.id, ...payload }, Number(currentKm));
    }
  };

  const updateVehicle = async (vehicleId: string, data: Partial<Vehicle>) => {
    const existingVehicle = vehicles.find(v => v.id === vehicleId);
    const payload: Partial<Vehicle> = { ...data };
    if (payload.lastMaintenanceKm !== undefined && payload.nextMaintenanceDueKm === undefined) {
      payload.nextMaintenanceDueKm = (Number(payload.lastMaintenanceKm) || 0) + 10000;
    }

    await updateDoc(doc(db, 'vehicles', vehicleId), sanitizeForFirestore(payload));

    const mergedVehicle: Vehicle = {
      ...(existingVehicle || {
        id: vehicleId,
        name: payload.name || 'Vehicle',
        plateNumber: payload.plateNumber || '',
        status: payload.status || 'active',
      }),
      ...payload,
    };

    const currentKm =
      payload.currentOdometer ??
      payload.lastOdometer ??
      payload.mileage ??
      mergedVehicle.currentOdometer ??
      mergedVehicle.lastOdometer ??
      mergedVehicle.mileage;

    const lastMaintKm = Number(mergedVehicle.lastMaintenanceKm) || 0;
    if (payload.lastMaintenanceKm !== undefined && currentKm !== undefined && (Number(currentKm) - lastMaintKm) < 10000) {
      const existingKeys: string[] = Array.from(dispatchedMaintenanceAlertsRef.current);
      for (const key of existingKeys) {
        if (key.startsWith(`${vehicleId}:`)) {
          dispatchedMaintenanceAlertsRef.current.delete(key);
        }
      }
    }

    if (currentKm !== undefined && !isNaN(Number(currentKm))) {
      await evaluateAndNotifyMaintenanceDue(mergedVehicle, Number(currentKm));
    }
  };

  const deleteVehicle = async (vehicleId: string) => {
    await deleteDoc(doc(db, 'vehicles', vehicleId));
  };

  const createVehicleLog = async (logData: Omit<VehicleLog, 'id'>) => {
    await addDoc(collection(db, 'vehicleLogs'), sanitizeForFirestore(logData));
    const targetVehicle = vehicles.find(v => v.id === logData.vehicleId);
    const loggedKm = Number(logData.endKm ?? logData.startKm);
    if (targetVehicle && !isNaN(loggedKm) && loggedKm > 0) {
      await evaluateAndNotifyMaintenanceDue(targetVehicle, loggedKm);
    }
  };

  const updateVehicleLog = async (logId: string, data: Partial<VehicleLog>) => {
    await updateDoc(doc(db, 'vehicleLogs', logId), sanitizeForFirestore(data));
    const existingLog = vehicleLogs.find(l => l.id === logId);
    const vehicleId = data.vehicleId || existingLog?.vehicleId;
    const targetVehicle = vehicleId ? vehicles.find(v => v.id === vehicleId) : undefined;
    const loggedKm = Number(data.endKm ?? data.startKm);
    if (targetVehicle && !isNaN(loggedKm) && loggedKm > 0) {
      await evaluateAndNotifyMaintenanceDue(targetVehicle, loggedKm);
    }
  };

  const logExpense = async (expenseData: {
    taskId?: string | null;
    amount: number;
    category: ExpenseCategory;
    vehicleId?: string | null;
    vehicleName?: string;
    vehiclePlateNumber?: string;
    notes?: string;
    receiptUrl: string;
    location?: string;
    timestamp?: string;
  }) => {
    if (!currentUser) throw new Error('No authenticated user');
    const amount = Number(expenseData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Please enter a valid expense amount greater than zero');
    }

    const currentBalance = currentUser.walletBalance ?? 0;
    const newBalance = currentBalance - amount;

    const batch = writeBatch(db);
    const expenseRef = doc(collection(db, 'expenses'));
    const createdAt = new Date().toISOString();
    const timestamp = expenseData.timestamp || createdAt;

    const payload: Omit<Expense, 'id'> = {
      userId: currentUser.id,
      taskId: expenseData.taskId ?? null,
      amount,
      category: expenseData.category,
      vehicleId: expenseData.vehicleId || undefined,
      vehicleName: expenseData.vehicleName || undefined,
      vehiclePlateNumber: expenseData.vehiclePlateNumber || undefined,
      notes: expenseData.notes || '',
      receiptUrl: expenseData.receiptUrl,
      location: expenseData.location || 'Location unavailable',
      timestamp,
      createdAt,
    };

    batch.set(expenseRef, sanitizeForFirestore(payload));

    // Instant wallet deduction via Firestore increment (optimistic offline-first)
    const userRef = doc(db, 'users', currentUser.id);
    batch.update(userRef, {
      walletBalance: increment(-amount)
    });

    await batch.commit();

    // Optimistic local state update
    setCurrentUser(prev => prev ? { ...prev, walletBalance: newBalance } : null);

    // Low Balance Check (Threshold: RM 50)
    const LOW_BALANCE_THRESHOLD = 50;
    if (newBalance < LOW_BALANCE_THRESHOLD) {
      const coordinatorAndAdmins = users.filter(u => u.role === 'coordinator' || u.role === 'admin');
      
      for (const recipient of coordinatorAndAdmins) {
        try {
          await addDoc(collection(db, 'notifications'), sanitizeForFirestore({
            userId: recipient.id,
            title: 'Low Wallet Balance Alert',
            message: `Field Officer ${currentUser.name} has a low wallet balance of ${formatCurrency(newBalance)} (under ${formatCurrency(LOW_BALANCE_THRESHOLD)}). Urgent petty cash top-up required.`,
            createdAt: new Date().toISOString(),
            isRead: false,
            type: 'low_balance',
            relatedTaskId: expenseData.taskId || undefined,
            relatedOfficerId: currentUser.id
          }));
        } catch (err) {
          console.error('Failed to send low balance notification:', err);
        }
      }
    }
  };

  const logTopUp = async (topUpData: {
    amount: number;
    source?: string;
    notes?: string;
    timestamp?: string;
  }) => {
    if (!currentUser) throw new Error('No authenticated user');
    const amount = Number(topUpData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Please enter a valid top-up amount greater than zero');
    }

    const currentBalance = currentUser.walletBalance ?? 0;
    const newBalance = currentBalance + amount;

    const batch = writeBatch(db);
    const topUpRef = doc(collection(db, 'topups'));
    const createdAt = new Date().toISOString();
    const timestamp = topUpData.timestamp || createdAt;

    const payload: Omit<TopUpRecord, 'id'> = {
      userId: currentUser.id,
      amount,
      source: topUpData.source || 'Office Petty Cash',
      notes: topUpData.notes || '',
      timestamp,
      createdAt,
    };

    batch.set(topUpRef, sanitizeForFirestore(payload));

    // Instant wallet addition via Firestore increment (optimistic offline-first)
    const userRef = doc(db, 'users', currentUser.id);
    batch.update(userRef, {
      walletBalance: increment(amount)
    });

    await batch.commit();

    // Optimistic local state update
    setCurrentUser(prev => prev ? { ...prev, walletBalance: newBalance } : null);
  };

  const topUpWallet = async (userId: string, amount: number, source: string = 'Coordinator / Admin Disbursement', notes?: string) => {
    const num = Number(amount);
    if (isNaN(num) || num <= 0) throw new Error('Invalid top-up amount');

    const batch = writeBatch(db);
    const topUpRef = doc(collection(db, 'topups'));
    const createdAt = new Date().toISOString();

    const payload: Omit<TopUpRecord, 'id'> = {
      userId,
      amount: num,
      source,
      notes: notes || `Disbursed by ${currentUser?.name || 'Operations'}`,
      timestamp: createdAt,
      createdAt,
    };

    batch.set(topUpRef, sanitizeForFirestore(payload));

    const userRef = doc(db, 'users', userId);
    batch.update(userRef, {
      walletBalance: increment(num)
    });

    await batch.commit();
  };

  const toggleWalletRecordSettled = async (
    recordType: 'expense' | 'topup',
    recordId: string,
    settled: boolean
  ) => {
    if (!currentUser || currentUser.role !== 'accountant') {
      throw new Error('Unauthorized: Only the accountant can mark wallet records as settled.');
    }
    const collectionName = recordType === 'expense' ? 'expenses' : 'topups';
    const recordRef = doc(db, collectionName, recordId);

    if (settled) {
      await updateDoc(recordRef, sanitizeForFirestore({
        isSettled: true,
        settledAt: new Date().toISOString(),
        settledBy: currentUser.id,
        settledByName: currentUser.name,
      }));
    } else {
      await updateDoc(recordRef, {
        isSettled: false,
        settledAt: deleteField(),
        settledBy: deleteField(),
        settledByName: deleteField(),
      });
    }
  };

  const batchToggleWalletRecordsSettled = async (
    records: WalletRecordRef[],
    settled: boolean
  ): Promise<number> => {
    if (!currentUser || currentUser.role !== 'accountant') {
      throw new Error('Unauthorized: Only the accountant can mark wallet records as settled.');
    }
    const deduped = deduplicateWalletRecordRefs(records);
    if (deduped.length === 0) return 0;

    const settledAtIso = new Date().toISOString();
    const payload = settled
      ? sanitizeForFirestore({
          isSettled: true,
          settledAt: settledAtIso,
          settledBy: currentUser.id,
          settledByName: currentUser.name,
        })
      : {
          isSettled: false,
          settledAt: deleteField(),
          settledBy: deleteField(),
          settledByName: deleteField(),
        };

    const chunks = chunkArray(deduped, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const rec of chunk) {
        const collectionName = rec.recordType === 'expense' ? 'expenses' : 'topups';
        batch.update(doc(db, collectionName, rec.recordId), payload);
      }
      await batch.commit();
    }

    return deduped.length;
  };

  const addOvertimeLog = async (logData: Omit<OvertimeLog, 'id'>) => {
    await addDoc(collection(db, 'overtimeLogs'), sanitizeForFirestore({
      ...logData,
      createdAt: logData.createdAt || new Date().toISOString()
    }));
  };

  const updateOvertimeLog = async (logId: string, data: Partial<OvertimeLog>) => {
    await updateDoc(doc(db, 'overtimeLogs', logId), sanitizeForFirestore(data));
  };

  const deleteOvertimeLog = async (logId: string) => {
    await deleteDoc(doc(db, 'overtimeLogs', logId));
  };

  const dispatchBatchNotifications = async (
    recipientIds: string[],
    notifFactory: (userId: string) => Omit<AppNotification, 'id'>
  ) => {
    const uniqueRecipients = Array.from(new Set(recipientIds)).filter(Boolean);
    if (uniqueRecipients.length === 0) return;

    for (let i = 0; i < uniqueRecipients.length; i += 450) {
      const chunk = uniqueRecipients.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach(uid => {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, sanitizeForFirestore(notifFactory(uid)));
      });
      await batch.commit();
    }
  };

  const createCounselorTask: AppState['createCounselorTask'] = async (payload) => {
    if (!currentUser || (currentUser.role !== 'counselor_manager' && currentUser.role !== 'admin')) {
      throw new Error('Unauthorized: Only Counselors Manager or Admin can create counselor tasks.');
    }

    const nowIso = new Date().toISOString();
    const taskRef = doc(collection(db, 'counselorTasks'));
    const assignedIds = Array.from(new Set(payload.assignedCounselorIds)).filter(Boolean);

    const newTask: Omit<CounselorTask, 'id'> = {
      title: payload.title.trim(),
      titleAr: payload.titleAr?.trim() || undefined,
      description: payload.description?.trim() || undefined,
      category: payload.category,
      priority: payload.priority,
      mode: payload.mode,
      isPinned: Boolean(payload.isPinned),
      targetMode: payload.targetMode,
      assignedCounselorIds: assignedIds,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      deadlineAt: payload.deadlineAt || undefined,
      subTasks: payload.subTasks && payload.subTasks.length > 0 ? payload.subTasks : undefined,
      attachments: payload.attachments && payload.attachments.length > 0 ? payload.attachments : undefined,
      acknowledgments: {},
      progressByCounselor: {},
      comments: [],
    };

    await setDoc(taskRef, sanitizeForFirestore(newTask));

    const deadlineNote = payload.deadlineAt
      ? ` • Due ${new Date(payload.deadlineAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : '';

    await dispatchBatchNotifications(assignedIds, (uid) => ({
      userId: uid,
      title: payload.mode === 'notice' ? 'New Counselor Announcement' : 'New Counselor Task',
      message: `${currentUser.name}: "${newTask.title}"${deadlineNote}`,
      createdAt: nowIso,
      isRead: false,
      type: 'counselor_task_assigned',
      relatedCounselorTaskId: taskRef.id,
    }));

    return taskRef.id;
  };

  const updateCounselorTask: AppState['updateCounselorTask'] = async (taskId, updates, clearDeadline = false) => {
    if (!currentUser || (currentUser.role !== 'counselor_manager' && currentUser.role !== 'admin')) {
      throw new Error('Unauthorized: Only Counselors Manager or Admin can update counselor tasks.');
    }

    const existing = counselorTasks.find(ct => ct.id === taskId);
    const nowIso = new Date().toISOString();

    const sanitized: Record<string, any> = sanitizeForFirestore({
      ...updates,
      updatedAt: nowIso,
    });

    if (clearDeadline) {
      sanitized.deadlineAt = deleteField();
    }

    await updateDoc(doc(db, 'counselorTasks', taskId), sanitized);

    if (existing && Array.isArray(updates.assignedCounselorIds)) {
      const prevSet = new Set(existing.assignedCounselorIds || []);
      const newlyAdded = updates.assignedCounselorIds.filter(id => !prevSet.has(id));
      if (newlyAdded.length > 0) {
        const title = updates.title || existing.title;
        await dispatchBatchNotifications(newlyAdded, (uid) => ({
          userId: uid,
          title: 'New Counselor Task',
          message: `${currentUser.name} assigned you to "${title}".`,
          createdAt: nowIso,
          isRead: false,
          type: 'counselor_task_assigned',
          relatedCounselorTaskId: taskId,
        }));
      }
    }
  };

  const deleteCounselorTask = async (taskId: string) => {
    if (!currentUser || (currentUser.role !== 'counselor_manager' && currentUser.role !== 'admin')) {
      throw new Error('Unauthorized: Only Counselors Manager or Admin can delete counselor tasks.');
    }
    await deleteDoc(doc(db, 'counselorTasks', taskId));
  };

  const toggleCounselorTaskPin = async (taskId: string, isPinned: boolean) => {
    if (!currentUser || (currentUser.role !== 'counselor_manager' && currentUser.role !== 'admin')) {
      throw new Error('Unauthorized');
    }
    await updateDoc(doc(db, 'counselorTasks', taskId), {
      isPinned,
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleCounselorTaskLike = async (taskId: string): Promise<boolean> => {
    if (!currentUser) throw new Error('Not authenticated');
    const existing = counselorTasks.find(ct => ct.id === taskId);
    if (!existing) throw new Error('Counselor task not found');

    const alreadyLiked = Boolean(existing.acknowledgments?.[currentUser.id]);
    const myProgress = existing.progressByCounselor?.[currentUser.id];

    // If counselor already started or completed an action task, keep the seen acknowledgment intact
    if (alreadyLiked && existing.mode === 'action' && (myProgress?.status === 'in_progress' || isCounselorProgressCompleted(myProgress))) {
      return true;
    }

    const fieldPath = `acknowledgments.${currentUser.id}`;
    if (alreadyLiked) {
      await updateDoc(doc(db, 'counselorTasks', taskId), {
        [fieldPath]: deleteField(),
      });
      return false;
    } else {
      await updateDoc(doc(db, 'counselorTasks', taskId), {
        [fieldPath]: {
          counselorId: currentUser.id,
          counselorName: currentUser.name,
          acknowledgedAt: new Date().toISOString(),
        },
      });
      return true;
    }
  };

  const updateCounselorTaskProgress: AppState['updateCounselorTaskProgress'] = async (taskId, status, extra) => {
    if (!currentUser) throw new Error('Not authenticated');
    const existing = counselorTasks.find(ct => ct.id === taskId);
    if (!existing) throw new Error('Counselor task not found');

    const nowIso = new Date().toISOString();
    const prevProgress = existing.progressByCounselor?.[currentUser.id];
    const deadlineMs = existing.deadlineAt ? new Date(existing.deadlineAt).getTime() : NaN;
    const completedLate = status === 'completed' && !Number.isNaN(deadlineMs)
      ? new Date(nowIso).getTime() > deadlineMs
      : false;

    const updates: Record<string, any> = {
      [`progressByCounselor.${currentUser.id}.status`]: status,
      [`progressByCounselor.${currentUser.id}.updatedAt`]: nowIso,
    };

    if (status === 'in_progress') {
      updates[`progressByCounselor.${currentUser.id}.startedAt`] = prevProgress?.startedAt || nowIso;
      updates[`progressByCounselor.${currentUser.id}.completedAt`] = deleteField();
      updates[`progressByCounselor.${currentUser.id}.completedLate`] = deleteField();
    } else if (status === 'completed') {
      updates[`progressByCounselor.${currentUser.id}.startedAt`] = prevProgress?.startedAt || nowIso;
      updates[`progressByCounselor.${currentUser.id}.completedAt`] = nowIso;
      updates[`progressByCounselor.${currentUser.id}.completedLate`] = completedLate;
      if (extra?.completionNote !== undefined) {
        updates[`progressByCounselor.${currentUser.id}.completionNote`] = extra.completionNote.trim();
      }
      if (extra?.completionAttachments && extra.completionAttachments.length > 0) {
        updates[`progressByCounselor.${currentUser.id}.completionAttachments`] = sanitizeForFirestore(extra.completionAttachments);
      }
    } else if (status === 'pending') {
      updates[`progressByCounselor.${currentUser.id}.completedAt`] = deleteField();
      updates[`progressByCounselor.${currentUser.id}.completedLate`] = deleteField();
    }

    // Auto-acknowledge ("Like / Seen") when counselor starts or completes a task
    if ((status === 'in_progress' || status === 'completed') && !existing.acknowledgments?.[currentUser.id]) {
      updates[`acknowledgments.${currentUser.id}`] = {
        counselorId: currentUser.id,
        counselorName: currentUser.name,
        acknowledgedAt: nowIso,
      };
    }

    await updateDoc(doc(db, 'counselorTasks', taskId), updates);
  };

  const toggleCounselorSubTask = async (taskId: string, subTaskId: string, checked: boolean) => {
    if (!currentUser) throw new Error('Not authenticated');
    const existing = counselorTasks.find(ct => ct.id === taskId);
    if (!existing) throw new Error('Counselor task not found');

    const nowIso = new Date().toISOString();
    const prevProgress = existing.progressByCounselor?.[currentUser.id];
    const updates: Record<string, any> = {
      [`progressByCounselor.${currentUser.id}.checkedSubTaskIds`]: checked
        ? arrayUnion(subTaskId)
        : arrayRemove(subTaskId),
      [`progressByCounselor.${currentUser.id}.updatedAt`]: nowIso,
    };

    if (!isCounselorProgressCompleted(prevProgress) && (!prevProgress?.status || (checked && prevProgress.status === 'pending'))) {
      updates[`progressByCounselor.${currentUser.id}.status`] = checked ? 'in_progress' : 'pending';
      if (checked && !prevProgress?.startedAt) {
        updates[`progressByCounselor.${currentUser.id}.startedAt`] = nowIso;
      }
    }

    if (checked && !existing.acknowledgments?.[currentUser.id]) {
      updates[`acknowledgments.${currentUser.id}`] = {
        counselorId: currentUser.id,
        counselorName: currentUser.name,
        acknowledgedAt: nowIso,
      };
    }

    await updateDoc(doc(db, 'counselorTasks', taskId), updates);
  };

  const addCounselorTaskComment = async (taskId: string, text: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    const clean = text.trim();
    if (!clean) return;
    const existing = counselorTasks.find(ct => ct.id === taskId);
    if (!existing) throw new Error('Counselor task not found');

    const nowIso = new Date().toISOString();
    const commentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const commentPayload = sanitizeForFirestore({
      id: commentId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      text: clean,
      createdAt: nowIso,
    });

    await updateDoc(doc(db, 'counselorTasks', taskId), {
      comments: arrayUnion(commentPayload),
      updatedAt: nowIso,
    });

    const recipientIds = currentUser.role === 'counselor'
      ? [existing.createdBy].filter(id => id && id !== currentUser.id)
      : (existing.assignedCounselorIds || []).filter(id => id !== currentUser.id);

    await dispatchBatchNotifications(recipientIds, (uid) => ({
      userId: uid,
      title: `Comment on "${existing.title}"`,
      message: `${currentUser.name}: ${clean.slice(0, 120)}`,
      createdAt: nowIso,
      isRead: false,
      type: 'counselor_task_comment',
      relatedCounselorTaskId: taskId,
    }));
  };

  const nudgeCounselorTask = async (taskId: string, scope: 'unacked' | 'incomplete' = 'unacked'): Promise<number> => {
    if (!currentUser || (currentUser.role !== 'counselor_manager' && currentUser.role !== 'admin')) {
      throw new Error('Unauthorized');
    }
    const existing = counselorTasks.find(ct => ct.id === taskId);
    if (!existing) throw new Error('Counselor task not found');

    if (existing.lastNudgedAt) {
      const elapsedMs = Date.now() - new Date(existing.lastNudgedAt).getTime();
      if (elapsedMs < 5 * 60 * 1000) {
        const minsLeft = Math.ceil((5 * 60 * 1000 - elapsedMs) / 60000);
        throw new Error(`NUDGE_COOLDOWN:${minsLeft}`);
      }
    }

    const targets = (existing.assignedCounselorIds || []).filter(cid => {
      if (scope === 'unacked') return !existing.acknowledgments?.[cid];
      return !isCounselorProgressCompleted(existing.progressByCounselor?.[cid]);
    });

    if (targets.length === 0) return 0;

    const nowIso = new Date().toISOString();
    await dispatchBatchNotifications(targets, (uid) => ({
      userId: uid,
      title: 'Reminder: Counselor Task Pending',
      message: `${currentUser.name} sent a reminder for "${existing.title}". Please review and Like to acknowledge.`,
      createdAt: nowIso,
      isRead: false,
      type: 'counselor_task_reminder',
      relatedCounselorTaskId: taskId,
    }));

    await updateDoc(doc(db, 'counselorTasks', taskId), {
      lastNudgedAt: nowIso,
    });

    return targets.length;
  };

  const saveQCReview = async (payload: {
    taskId: string;
    officerId?: string;
    studentId?: string;
    taskDate?: string;
    grade: QCGrade;
    internalScore?: number;
    errorTags: QCErrorTagId[];
    customTags?: string[];
    comment: string;
    evidenceMedia?: QCEvidenceMedia[];
    needsUrgentCall?: boolean;
    urgentCallReason?: string;
    urgentCallResolved?: boolean;
  }) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Unauthorized: Quality Control is strictly restricted to Admin accounts.');
    }
    const nowIso = new Date().toISOString();
    const existing = qcReviews.find(r => r.taskId === payload.taskId || r.id === payload.taskId);
    const cleanedCustomTags = (payload.customTags || []).map(t => t.trim()).filter(Boolean);
    const needsCall = Boolean(payload.needsUrgentCall);
    const isResolved = needsCall ? Boolean(payload.urgentCallResolved) : false;

    const record: QCTaskReview = {
      id: payload.taskId,
      taskId: payload.taskId,
      officerId: payload.officerId,
      studentId: payload.studentId,
      taskDate: payload.taskDate,
      grade: payload.grade,
      internalScore: payload.internalScore,
      errorTags: payload.errorTags || [],
      customTags: cleanedCustomTags,
      comment: payload.comment.trim(),
      evidenceMedia: payload.evidenceMedia || [],
      needsUrgentCall: needsCall,
      urgentCallReason: needsCall ? (payload.urgentCallReason || '').trim() : '',
      urgentCallResolved: isResolved,
      urgentCallResolvedAt: isResolved ? (existing?.urgentCallResolvedAt || nowIso) : undefined,
      urgentCallResolvedBy: isResolved ? (existing?.urgentCallResolvedBy || currentUser.name) : undefined,
      reviewedBy: existing?.reviewedBy || currentUser.id,
      reviewedByName: currentUser.name,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await setDoc(doc(db, 'qcReviews', payload.taskId), sanitizeForFirestore(record));
  };

  const deleteQCReview = async (taskId: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Unauthorized');
    }
    await deleteDoc(doc(db, 'qcReviews', taskId));
  };

  const toggleQCUrgentCallResolved = async (taskId: string, resolved: boolean) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Unauthorized');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, 'qcReviews', taskId), {
      urgentCallResolved: resolved,
      urgentCallResolvedAt: resolved ? nowIso : deleteField(),
      urgentCallResolvedBy: resolved ? currentUser.name : deleteField(),
      updatedAt: nowIso,
    });
  };

  const saveQCDailyReport = async (date: string, payload: { dailySummary: string; generalAdvice: string }) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Unauthorized');
    }
    const nowIso = new Date().toISOString();
    const existing = qcDailyReports.find(r => r.date === date || r.id === date);
    const record: QCDailyReport = {
      id: date,
      date,
      dailySummary: payload.dailySummary.trim(),
      generalAdvice: payload.generalAdvice.trim(),
      updatedBy: currentUser.id,
      updatedByName: currentUser.name,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(doc(db, 'qcDailyReports', date), sanitizeForFirestore(record));
  };

  const saveQCOfficerEvaluation = async (
    officerId: string,
    payload: { rating: number; notes: string; strengths?: string; improvements?: string }
  ) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Unauthorized');
    }
    const nowIso = new Date().toISOString();
    const existing = qcOfficerEvaluations.find(e => e.officerId === officerId || e.id === officerId);
    const record: QCOfficerEvaluation = {
      id: officerId,
      officerId,
      rating: Math.max(1, Math.min(5, Math.round(payload.rating))),
      notes: payload.notes.trim(),
      strengths: (payload.strengths || '').trim(),
      improvements: (payload.improvements || '').trim(),
      updatedBy: currentUser.id,
      updatedByName: currentUser.name,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(doc(db, 'qcOfficerEvaluations', officerId), sanitizeForFirestore(record));
  };

  return (
    <AppContext.Provider value={{ 
      isAuthLoading, isInitialized, language, setLanguage, theme, setTheme, toggleTheme, t, currentUser, setCurrentUser, login, logout, addUser, updateUserPassword, users, students, tasks, presets, feedbacks, feedbackEntries, notifications, markNotificationAsRead, markAllNotificationsAsRead, clearAllNotifications, deleteNotification,
      taskRequests, createTaskRequest, updateTaskRequestStatus, resendTaskFeedbackEmail,
      startTask, updateTaskStudentEmail, submitTaskFeedback, updateTaskStatus, pendingTaskIds, completingTaskIds, isOnline, retryPendingTaskSync, updateSubTaskStatus, updateTaskNotes, updateTaskAssignee, updateTaskCommunication, removeCommunicationMedia, addMediaToSubTask, removeMediaFromSubTask, assignTask, updateTask, deleteTask, addPreset, updatePreset, addStudent, updateStudent, deleteStudent, deleteStudents,
      vehicles, vehicleLogs, addVehicle, updateVehicle, deleteVehicle, createVehicleLog, updateVehicleLog,
      expenses, topups, logExpense, logTopUp, topUpWallet, toggleWalletRecordSettled, batchToggleWalletRecordsSettled,
      overtimeLogs, addOvertimeLog, updateOvertimeLog, deleteOvertimeLog,
      counselorTasks, createCounselorTask, updateCounselorTask, deleteCounselorTask, toggleCounselorTaskPin, toggleCounselorTaskLike, updateCounselorTaskProgress, toggleCounselorSubTask, addCounselorTaskComment, nudgeCounselorTask,
      qcReviews, qcDailyReports, qcOfficerEvaluations, saveQCReview, deleteQCReview, toggleQCUrgentCallResolved, saveQCDailyReport, saveQCOfficerEvaluation
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within an AppProvider");
  return context;
};
