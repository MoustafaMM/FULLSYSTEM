// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, MapPin, Calendar, Phone, CheckCircle2, Circle, Upload, Check, 
  Plus, X, User, Clock, MessageSquare, AlertCircle, Timer, Hotel, Car, 
  Edit, Star, Mail, Camera, Plane, HeartPulse, GraduationCap, ShieldAlert, 
  MessageSquareText, Save, Loader2, Sparkles, Eye, Layers, ThumbsUp, ExternalLink,
  Globe, BookOpen, Trash2
} from 'lucide-react';
import DeleteStudentConfirmModal from '../components/DeleteStudentConfirmModal';
import { cn } from '../components/layout/Layout';
import DatePicker from '../components/DatePicker';
import { Task, TaskFeedback, TaskPreset, User as UserType, Language, ArrivalCategory, AcademicProgram, ServicePackage } from '../types';
import { COMMON_NATIONALITIES, ACADEMIC_PROGRAMS, SERVICE_PACKAGES } from './StudentsDirectory';
import { getServiceQuestions } from './FeedbackForm';
import RequestTaskModal from '../components/RequestTaskModal';
import { getTaskDisplaySteps } from '../utils/taskSteps';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskScheduleBucket,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  getLocalDateStr,
  hasPresetTemplate,
  isOpenTask,
  normalizeTaskStatus,
} from '../utils/taskClassification';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import PhotoLightboxModal from '../components/PhotoLightboxModal';

const formatDuration = (startStr?: string, endStr?: string) => {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diff = end - start;
  if (diff < 0) return null;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const formatDateTimeUTC8 = (dateStr?: string, lang: Language = 'en') => {
  if (!dateStr) return lang === 'ar' ? 'غير متوفر' : 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  try {
    const formatted = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MY' : 'en-US', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
    return `${formatted} (UTC+8)`;
  } catch {
    return `${date.toLocaleString()} (UTC+8)`;
  }
};

const getSatisfactionMeta = (satisfaction?: TaskFeedback['satisfaction'], lang: Language = 'en') => {
  switch (satisfaction) {
    case 'very_satisfied':
      return {
        label: lang === 'ar' ? 'راضٍ جداً' : 'Very Satisfied',
        emoji: '😍',
        pillClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60',
      };
    case 'satisfied':
      return {
        label: lang === 'ar' ? 'راضٍ' : 'Satisfied',
        emoji: '😊',
        pillClass: 'bg-green-100 dark:bg-emerald-950/60 text-green-800 dark:text-emerald-300 border-green-200 dark:border-emerald-700/60',
      };
    case 'neutral':
      return {
        label: lang === 'ar' ? 'محايد' : 'Neutral',
        emoji: '😐',
        pillClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/60',
      };
    case 'dissatisfied':
      return {
        label: lang === 'ar' ? 'غير راضٍ' : 'Dissatisfied',
        emoji: '🙁',
        pillClass: 'bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700/60',
      };
    case 'very_dissatisfied':
      return {
        label: lang === 'ar' ? 'غير راضٍ جداً' : 'Very Dissatisfied',
        emoji: '😞',
        pillClass: 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700/60',
      };
    default:
      return {
        label: lang === 'ar' ? 'تم التقييم' : 'Evaluated',
        emoji: '⭐',
        pillClass: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
      };
  }
};

const getSubtaskScoreMeta = (score: number | string, lang: Language = 'en') => {
  if (typeof score === 'number') {
    const pillClass =
      score >= 4
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : score === 3
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-red-50 text-red-800 border-red-200';
    return {
      isNumeric: true,
      numericScore: score,
      label: `${score} / 5 ★`,
      pillClass,
    };
  }

  const normalized = String(score).trim().toLowerCase();
  if (normalized === 'good' || normalized === 'yes' || normalized === 'excellent') {
    const label =
      normalized === 'yes'
        ? (lang === 'ar' ? 'نعم، بالكامل 👍' : 'Yes, Completely 👍')
        : (lang === 'ar' ? 'ممتاز 👍' : 'Good 👍');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (normalized === 'acceptable' || normalized === 'partially' || normalized === 'fair') {
    const label =
      normalized === 'partially'
        ? (lang === 'ar' ? 'إلى حد ما 😐' : 'Somewhat / Partially 😐')
        : (lang === 'ar' ? 'مقبول 😐' : 'Acceptable 😐');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (normalized === 'poor' || normalized === 'no') {
    const label =
      normalized === 'no'
        ? (lang === 'ar' ? 'لا 👎' : 'No 👎')
        : (lang === 'ar' ? 'ضعيف 👎' : 'Poor 👎');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-red-50 text-red-800 border-red-200',
    };
  }

  return {
    isNumeric: false,
    label: String(score),
    pillClass: 'bg-slate-100 text-slate-800 border-slate-200',
  };
};

interface StudentFeedbackEntry {
  key: string;
  feedback: TaskFeedback;
  task?: Task;
  preset?: TaskPreset;
  presetName: string;
  officer?: UserType;
  assignedOfficerId?: string;
  completedAt?: string;
  auditMedia: { url: string; timestamp: string; location: string; title: string; type: 'communication' | 'subtask' }[];
  subtaskBreakdown: {
    id: string;
    title?: string;
    question: string;
    score: number | string;
  }[];
}

interface StudentProfileProps {
  studentId: string;
  onBack: () => void;
}

export default function StudentProfile({ studentId, onBack }: StudentProfileProps) {
  const { t, students, tasks, presets, currentUser, users, assignTask, vehicles, updateStudent, deleteStudent, language } = useAppContext();
  const [activeTab, setActiveTab] = useState<'timeline' | 'media'>('timeline');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRequestingTask, setIsRequestingTask] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [customTaskTitleAr, setCustomTaskTitleAr] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [coordinatorNote1, setCoordinatorNote1] = useState('');
  const [coordinatorNote2, setCoordinatorNote2] = useState('');
  const [hotel, setHotel] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [customSubTasks, setCustomSubTasks] = useState<{titleEn: string, titleAr: string, requiresProof?: boolean}[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<'all' | Task['status']>('all');
  const [timelineCategoryFilter, setTimelineCategoryFilter] = useState<'all' | 'student_preset' | 'student_custom'>('all');
  const [selectedMedia, setSelectedMedia] = useState<{url: string, timestamp: string, location: string, title?: string} | null>(null);

  const resetAssignForm = () => {
    setSelectedPreset('');
    setSelectedAssignee('');
    setCustomTaskTitle('');
    setCustomTaskTitleAr('');
    setCoordinatorNote1('');
    setCoordinatorNote2('');
    setHotel('');
    setTaskTime('');
    setTaskDate('');
    setVehicleId('');
    setCustomSubTasks([]);
    setAssignError(null);
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);

  const handleDeleteProfile = async () => {
    if (!student) return;
    setIsDeletingProfile(true);
    try {
      await deleteStudent(student.id);
      toast.success(t('studentDeletedSuccess') || 'Student profile deleted successfully');
      setIsConfirmingDelete(false);
      onBack();
    } catch (err: any) {
      console.error('Failed to delete student profile:', err);
      toast.error(err.message || 'Failed to delete student profile');
    } finally {
      setIsDeletingProfile(false);
    }
  };

  // Real-time Firestore listener for /feedback collection
  const [feedbackCollectionDocs, setFeedbackCollectionDocs] = useState<TaskFeedback[]>([]);
  const [selectedFeedbackKey, setSelectedFeedbackKey] = useState<string | null>(null);
  const mediaSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubFeedback = onSnapshot(
      collection(db, 'feedback'),
      (snapshot) => {
        const docs = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as TaskFeedback));
        setFeedbackCollectionDocs(docs);
      },
      (err) => {
        console.error('Feedback collection snapshot error:', err);
      }
    );
    return () => unsubFeedback();
  }, []);

  // Close feedback inspection modal on Escape key
  useEffect(() => {
    if (!selectedFeedbackKey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFeedbackKey(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFeedbackKey]);

  const student = students.find(s => s.id === studentId);
  const studentTasks = tasks.filter(t => t.studentId === studentId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Link & merge student feedback from both studentTasks (feedbackSubmitted == true / task.feedback) and /feedback collection (by taskId or studentEmail)
  const studentFeedbackEntries = useMemo<StudentFeedbackEntry[]>(() => {
    if (!student) return [];

    const entries: StudentFeedbackEntry[] = [];
    const consumedFeedbackDocIds = new Set<string>();

    const buildAuditMediaForTask = (task?: Task, presetName: string = 'Task') => {
      const mediaList: { url: string; timestamp: string; location: string; title: string; type: 'communication' | 'subtask' }[] = [];
      if (!task) return mediaList;

      if (task.studentCommunicationMedia) {
        task.studentCommunicationMedia.forEach(m => {
          mediaList.push({
            url: m.url,
            timestamp: m.timestamp,
            location: m.location || 'Location unavailable',
            title: `Student Communication (${presetName})`,
            type: 'communication',
          });
        });
      }

      if (task.subTasks) {
        task.subTasks.forEach(st => {
          if (st.media) {
            st.media.forEach(m => {
              mediaList.push({
                url: m.url,
                timestamp: m.timestamp,
                location: m.location || 'Location unavailable',
                title: `${language === 'ar' ? (st.titleAr || st.titleEn) : st.titleEn} (${presetName})`,
                type: 'subtask',
              });
            });
          }
        });
      }

      return mediaList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    const buildSubtaskBreakdown = (fb: TaskFeedback, preset?: TaskPreset, task?: Task) => {
      const definedQuestions = getServiceQuestions(preset, task);
      const breakdown: { id: string; title?: string; question: string; score: number | string }[] = [];

      if (fb.subtaskRatings && Object.keys(fb.subtaskRatings).length > 0) {
        Object.entries(fb.subtaskRatings).forEach(([qId, item]) => {
          const matchedDef = definedQuestions.find(q => q.id === qId);
          const title = matchedDef
            ? (language === 'ar' ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
            : undefined;
          const question =
            language === 'ar' && item.questionAr
              ? item.questionAr
              : item.questionEn || (matchedDef ? (language === 'ar' ? matchedDef.questionAr : matchedDef.questionEn) : qId);
          breakdown.push({
            id: qId,
            title,
            question,
            score: item.score,
          });
        });
      } else if (fb.answers && fb.answers.length > 0) {
        fb.answers.forEach(ans => {
          const matchedDef = definedQuestions.find(q => q.id === ans.questionId);
          const title = matchedDef
            ? (language === 'ar' ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
            : undefined;
          const question = language === 'ar' && ans.questionAr ? ans.questionAr : ans.question;
          const score = typeof ans.answer === 'boolean' ? (ans.answer ? 'Yes' : 'No') : ans.answer;
          breakdown.push({
            id: ans.questionId,
            title,
            question,
            score,
          });
        });
      } else if (fb.dynamicAnswers && Object.keys(fb.dynamicAnswers).length > 0) {
        Object.entries(fb.dynamicAnswers).forEach(([qId, val]) => {
          const matchedDef = definedQuestions.find(q => q.id === qId);
          const title = matchedDef
            ? (language === 'ar' ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
            : undefined;
          const question = matchedDef
            ? (language === 'ar' ? matchedDef.questionAr : matchedDef.questionEn)
            : qId;
          breakdown.push({
            id: qId,
            title,
            question,
            score: typeof val === 'number' || typeof val === 'string' ? val : String(val),
          });
        });
      }

      return breakdown;
    };

    // 1. Link feedback via studentTasks (where feedbackSubmitted == true, task.feedback exists, or /feedback doc matches taskId)
    studentTasks.forEach(task => {
      const matchingCollectionDocs = feedbackCollectionDocs.filter(f => f.taskId === task.id);
      matchingCollectionDocs.forEach(d => {
        if (d.id) consumedFeedbackDocIds.add(d.id);
      });

      const latestCollectionDoc = matchingCollectionDocs.sort(
        (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
      )[0];

      const hasFeedback = (task.feedbackSubmitted && task.feedback) || !!task.feedback || !!latestCollectionDoc;
      if (!hasFeedback) return;

      const mergedFeedback: TaskFeedback = {
        ...(task.feedback || {}),
        ...(latestCollectionDoc || {}),
        taskId: task.id,
        rating: latestCollectionDoc?.rating ?? task.feedback?.rating ?? 5,
        satisfaction: latestCollectionDoc?.satisfaction ?? task.feedback?.satisfaction ?? 'satisfied',
        subtaskRatings: latestCollectionDoc?.subtaskRatings || task.feedback?.subtaskRatings,
        comments: latestCollectionDoc?.comments ?? task.feedback?.comments,
        answers: latestCollectionDoc?.answers || task.feedback?.answers,
        dynamicAnswers: latestCollectionDoc?.dynamicAnswers || task.feedback?.dynamicAnswers,
        submittedAt: latestCollectionDoc?.submittedAt || task.feedback?.submittedAt || task.completedAt || task.createdAt,
      };

      const preset = presets.find(p => p.id === task.presetId);
      const presetName = getTaskDisplayTitle(task, presets, language);

      const assignedOfficerId = task.assigneeId || student.assignedOfficerId;
      const officer = users.find(u => u.id === assignedOfficerId);

      entries.push({
        key: `task-${task.id}`,
        feedback: mergedFeedback,
        task,
        preset,
        presetName,
        officer,
        assignedOfficerId,
        completedAt: task.completedAt || mergedFeedback.submittedAt,
        auditMedia: buildAuditMediaForTask(task, presetName),
        subtaskBreakdown: buildSubtaskBreakdown(mergedFeedback, preset, task),
      });
    });

    // 2. Also link any unconsumed /feedback docs matching studentEmail (if any exist without a direct studentTasks match)
    const normalizedStudentEmail = student.email?.trim().toLowerCase();
    if (normalizedStudentEmail) {
      feedbackCollectionDocs.forEach(docItem => {
        if (docItem.id && consumedFeedbackDocIds.has(docItem.id)) return;
        const docEmail = docItem.studentEmail?.trim().toLowerCase();
        if (docEmail && docEmail === normalizedStudentEmail) {
          const linkedTask = tasks.find(t => t.id === docItem.taskId);
          const preset = linkedTask ? presets.find(p => p.id === linkedTask.presetId) : undefined;
          const presetName = linkedTask
            ? getTaskDisplayTitle(linkedTask, presets, language)
            : (language === 'ar' ? 'خدمة لوجستية' : 'Logistics Service');
          const assignedOfficerId = linkedTask?.assigneeId || student.assignedOfficerId;
          const officer = users.find(u => u.id === assignedOfficerId);

          entries.push({
            key: `fb-${docItem.id || docItem.taskId}`,
            feedback: docItem,
            task: linkedTask,
            preset,
            presetName,
            officer,
            assignedOfficerId,
            completedAt: linkedTask?.completedAt || docItem.submittedAt,
            auditMedia: buildAuditMediaForTask(linkedTask, presetName),
            subtaskBreakdown: buildSubtaskBreakdown(docItem, preset, linkedTask),
          });
        }
      });
    }

    return entries.sort(
      (a, b) => new Date(b.feedback.submittedAt || 0).getTime() - new Date(a.feedback.submittedAt || 0).getTime()
    );
  }, [student, studentTasks, feedbackCollectionDocs, presets, users, tasks, language]);

  const activeFeedbackModalEntry = useMemo(() => {
    if (!selectedFeedbackKey) return null;
    return studentFeedbackEntries.find(e => e.key === selectedFeedbackKey) || null;
  }, [selectedFeedbackKey, studentFeedbackEntries]);

  // Counselor Remarks state & live sync handler
  const [counselorRemarks, setCounselorRemarks] = useState(student?.counselorRemarks || '');
  const [remarksSyncStatus, setRemarksSyncStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (student?.counselorRemarks !== undefined) {
      setCounselorRemarks(student.counselorRemarks);
    }
  }, [student?.counselorRemarks]);

  const handleSaveRemarks = async (valueToSave?: string) => {
    const text = (valueToSave !== undefined ? valueToSave : counselorRemarks).trim();
    if (text === (student?.counselorRemarks || '').trim()) return;

    setRemarksSyncStatus('saving');
    try {
      await updateDoc(doc(db, 'students', studentId), {
        counselorRemarks: text
      });
      setRemarksSyncStatus('saved');
      setTimeout(() => setRemarksSyncStatus('idle'), 2500);
      toast.success(t('remarksSaved'));
    } catch (err: any) {
      console.error('Error updating counselorRemarks in Firestore:', err);
      setRemarksSyncStatus('idle');
      toast.error('Failed to sync counselor remarks to Firestore');
    }
  };

  // Visual Journey Stages Definition
  const journeyStages = useMemo(() => {
    const stagesDef = [
      {
        id: 'arrival',
        title: t('airportArrival'),
        icon: Plane,
        aliases: ['normal reception', 'airport reception', 'arrival', 'استقبال عادي', 'الاستقبال في المطار'],
      },
      {
        id: 'accommodation',
        title: t('accommodationOnboarding'),
        icon: Hotel,
        aliases: ['accommodation check-in', 'property viewing', 'accommodation', 'hotel', 'تسكين', 'معاينة سكن'],
      },
      {
        id: 'medical',
        title: t('medicalExam'),
        icon: HeartPulse,
        aliases: ['medical examination', 'medical', 'فحص طبي'],
      },
      {
        id: 'university',
        title: t('universityReg'),
        icon: GraduationCap,
        aliases: ['university registration', 'registration', 'تسجيل جامعي'],
      },
    ];

    if (!student) return [];

    return stagesDef.map((stageDef, index) => {
      // 1. Check if explicitly in student.completedStages
      const isMarkedCompleted = (student.completedStages || []).some(cs =>
        stageDef.aliases.some(alias => cs.toLowerCase().includes(alias.toLowerCase()))
      );

      // 2. Check linked non-cancelled tasks matching this stage (latest created first)
      const matchingTasks = studentTasks.filter(task => {
        if (normalizeTaskStatus(task) === 'cancelled') return false;
        const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
        const nameEn = (task.customTitle || preset?.nameEn || '').toLowerCase();
        const nameAr = (task.customTitleAr || preset?.nameAr || '').toLowerCase();
        return stageDef.aliases.some(alias => nameEn.includes(alias) || nameAr.includes(alias));
      });

      const completedTask = matchingTasks.find(t => normalizeTaskStatus(t) === 'completed');
      const inProgressTask = matchingTasks.find(t => normalizeTaskStatus(t) === 'in_progress');
      const pendingTask = matchingTasks.find(t => normalizeTaskStatus(t) === 'pending');

      const hasNewerPendingThanCompleted = Boolean(
        pendingTask &&
        (!completedTask ||
          new Date(pendingTask.createdAt || 0).getTime() >=
            new Date(completedTask.completedAt || completedTask.createdAt || 0).getTime())
      );

      let status: 'completed' | 'in_progress' | 'pending' | 'upcoming' = 'upcoming';
      let timestamp: string | undefined = undefined;
      let note: string | undefined = undefined;

      // Active work (or a newly queued redo task) takes precedence over prior completion
      if (inProgressTask) {
        status = 'in_progress';
        timestamp = inProgressTask.startedAt || inProgressTask.taskDate || inProgressTask.createdAt;
      } else if (pendingTask && (hasNewerPendingThanCompleted || (!completedTask && !isMarkedCompleted))) {
        status = 'pending';
        timestamp = pendingTask.taskDate || pendingTask.createdAt;
        note = pendingTask.taskTime ? `Time: ${pendingTask.taskTime}` : undefined;
      } else if (isMarkedCompleted || completedTask) {
        status = 'completed';
        timestamp = completedTask?.completedAt || student.arrivalDate;
      } else if (pendingTask) {
        status = 'pending';
        timestamp = pendingTask.taskDate || pendingTask.createdAt;
        note = pendingTask.taskTime ? `Time: ${pendingTask.taskTime}` : undefined;
      }

      return {
        ...stageDef,
        stepNumber: index + 1,
        status,
        timestamp,
        note,
        matchingTaskCount: matchingTasks.length
      };
    });
  }, [student, studentTasks, presets, t]);

  // Aggregated Media Vault: Includes both SubTask Media proofs and Student Communication Media screenshots
  const allStudentMedia = useMemo(() => {
    const items: { url: string; timestamp: string; location: string; title: string; type: 'communication' | 'subtask' }[] = [];
    studentTasks.forEach(task => {
      const preset = presets.find(p => p.id === task.presetId);
      const taskName = (language === 'ar' ? (task.customTitleAr || task.customTitle) : task.customTitle) || preset?.nameEn || 'Task';

      if (task.studentCommunicationMedia) {
        task.studentCommunicationMedia.forEach(m => {
          items.push({
            url: m.url,
            timestamp: m.timestamp,
            location: m.location || 'Location unavailable',
            title: `Student Communication (${taskName})`,
            type: 'communication'
          });
        });
      }

      if (task.subTasks) {
        task.subTasks.forEach(st => {
          if (st.media) {
            st.media.forEach(m => {
              items.push({
                url: m.url,
                timestamp: m.timestamp,
                location: m.location || 'Location unavailable',
                title: `${st.titleEn} (${taskName})`,
                type: 'subtask'
              });
            });
          }
        });
      }
    });

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [studentTasks, presets]);

  // Strict Access Guard: If logged in as Counselor, validate that student is assigned to this counselor
  const isCounselor = currentUser?.role === 'counselor';
  const isAuthorizedCounselor = student && (
    (student.counselorId && student.counselorId === currentUser?.id) ||
    (student.counselor && student.counselor === currentUser?.id)
  );

  if (isCounselor && !isAuthorizedCounselor) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-100 shadow-sm">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t('accessDenied')}</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          {t('accessDeniedDesc')} This student profile is restricted to their assigned academic counselor.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-95"
        >
          <ArrowLeft size={16} />
          <span>{t('backToDashboard')}</span>
        </button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={40} className="text-slate-300 mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">Student Not Found</h3>
        <p className="text-sm text-slate-500 mb-4">The requested student document could not be located in Firestore.</p>
        <button onClick={onBack} className="text-sm font-semibold text-red-600 hover:underline">
          Return Back
        </button>
      </div>
    );
  }

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPreset(val);
    setAssignError(null);
    if (val === 'custom') {
      setCustomTaskTitle('');
      setCustomTaskTitleAr('');
      // Seed with 1 initial empty step for custom task
      setCustomSubTasks([{ titleEn: '', titleAr: '', requiresProof: false }]);
    } else {
      const preset = presets.find(p => p.id === val);
      if (preset) {
        setCustomSubTasks(preset.defaultSubTasks.map(st => ({
          titleEn: st.titleEn,
          titleAr: st.titleAr,
          requiresProof: !!st.requiresProof
        })));
      } else {
        setCustomSubTasks([]);
      }
    }
  };

  const handleAssignTask = async () => {
    if (!selectedPreset) {
      setAssignError(t('selectPreset'));
      return;
    }
    if (!selectedAssignee) {
      setAssignError(t('selectAssignee'));
      return;
    }

    const isCustom = selectedPreset === 'custom';
    let preset: (typeof presets)[0] | undefined = undefined;

    if (isCustom) {
      if (!customTaskTitle.trim()) {
        setAssignError(t('customTitleRequired'));
        return;
      }
      if (customSubTasks.length === 0) {
        setAssignError(t('atLeastOneSubtaskRequired'));
        return;
      }
    } else {
      preset = presets.find(p => p.id === selectedPreset);
      if (!preset) {
        setAssignError(t('selectPreset'));
        return;
      }
      if (customSubTasks.length === 0) {
        setAssignError(t('atLeastOneSubtaskRequired'));
        return;
      }
    }

    setAssignError(null);
    try {
      await assignTask({
        studentId,
        studentEmail: student.email?.trim() || undefined,
        presetId: isCustom ? undefined : preset!.id,
        customTitle: isCustom ? customTaskTitle.trim() : undefined,
        customTitleAr: isCustom && customTaskTitleAr.trim() ? customTaskTitleAr.trim() : undefined,
        assigneeId: selectedAssignee,
        status: 'pending',
        coordinatorNote1: coordinatorNote1.trim() || undefined,
        coordinatorNote2: coordinatorNote2.trim() || undefined,
        hotel: hotel.trim() || undefined,
        taskTime: taskTime || undefined,
        taskDate: taskDate || undefined,
        vehicleId: vehicleId || undefined,
        subTasks: customSubTasks.map((st, i) => ({
          id: `st-${Date.now()}-${i}`,
          titleEn: st.titleEn.trim() || `Step ${i + 1}`,
          titleAr: st.titleAr.trim() || st.titleEn.trim() || `خطوة ${i + 1}`,
          isCompleted: false,
          requiresProof: !!st.requiresProof,
        }))
      });

      setIsAssigning(false);
      resetAssignForm();
    } catch (error: any) {
      console.error("Assign task error:", error);
      setAssignError(`Failed to assign task: ${error.message || 'Unknown error'}`);
    }
  };

  const handleOpenEdit = () => {
    if (!student) return;
    setEditStudent({
      fullName: student.fullName || '',
      passportNumber: student.passportNumber || '',
      nationality: student.nationality || '',
      studyIntake: student.studyIntake || '',
      arrivalCategory: student.arrivalCategory || (student as any).studentType || 'Student',
      program: student.program || 'Bachelor',
      package: student.package || (student as any).servicePackage || 'Free',
      university: student.university || '',
      contactInfo: student.contactInfo || '',
      email: student.email || '',
      counselor: student.counselor || '',
      flightDetails: {
        airline: student.flightDetails?.airline || '',
        flightNumber: student.flightDetails?.flightNumber || '',
        date: student.flightDetails?.date || '',
        time: student.flightDetails?.time || ''
      },
      accommodationDetails: {
        hotelName: student.accommodationDetails?.hotelName || '',
        checkInDate: student.accommodationDetails?.checkInDate || '',
        checkOutDate: student.accommodationDetails?.checkOutDate || ''
      }
    });
    setIsEditing(true);
  };

  const handleUpdateStudent = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!editStudent.fullName?.trim() || 
        !editStudent.passportNumber?.trim() || 
        !editStudent.nationality?.trim() || 
        !editStudent.studyIntake?.trim() || 
        !editStudent.arrivalCategory || 
        !editStudent.program || 
        !editStudent.package ||
        !editStudent.email?.trim() ||
        !editStudent.counselor) {
      setEditError('Please fill in all mandatory fields (Full Name, Passport Number, Nationality, Study Intake, Category, Program, Package, Email, Counselor).');
      return;
    }
    if (!emailRegex.test(editStudent.email.trim())) {
      setEditError(t('invalidEmailFormat') || 'Please enter a valid email address.');
      return;
    }
    setEditError(null);
    try {
      const cleanedPassport = editStudent.passportNumber.trim().toUpperCase();
      await updateStudent(studentId, {
        fullName: editStudent.fullName.trim(),
        passportNumber: cleanedPassport,
        nationality: editStudent.nationality.trim(),
        studyIntake: editStudent.studyIntake.trim(),
        arrivalCategory: editStudent.arrivalCategory as ArrivalCategory,
        studentType: editStudent.arrivalCategory as ArrivalCategory,
        program: editStudent.program as AcademicProgram,
        package: editStudent.package as ServicePackage,
        servicePackage: editStudent.package as ServicePackage,
        university: editStudent.university.trim(),
        contactInfo: editStudent.contactInfo.trim(),
        email: editStudent.email.trim().toLowerCase(),
        counselor: editStudent.counselor,
        flightDetails: editStudent.flightDetails,
        accommodationDetails: editStudent.accommodationDetails,
      });
      setIsEditing(false);
      toast.success('Student profile updated successfully');
    } catch (error: any) {
      setEditError('An error occurred while updating the student.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> Back to Directory
        </button>
        <div className="flex gap-2">
          {currentUser.role === 'counselor' && (
            <button 
              type="button"
              onClick={() => setIsRequestingTask(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm shadow-sm cursor-pointer"
            >
              <Plus size={16} /> Request Task from Coordinator
            </button>
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
            <button 
              onClick={() => setIsAssigning(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm"
            >
              <Plus size={16} /> {t('assignTask')}
            </button>
          )}
        </div>
      </div>

      {/* Master File Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-start justify-between">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h2 className="text-3xl font-bold text-slate-900">{student.fullName}</h2>
              {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
                <button 
                  onClick={handleOpenEdit}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm shadow-sm"
                >
                  <Edit size={16} /> Edit Profile
                </button>
              )}
              {currentUser.role === 'admin' && (
                <button 
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm shadow-sm cursor-pointer"
                >
                  <Trash2 size={16} /> {t('deleteStudentProfile') || 'Delete Profile'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mb-3">
              <div className="flex items-center gap-1.5"><MapPin size={16} className="text-slate-400" /> {student.university}</div>
              <div className="flex items-center gap-1.5"><Phone size={16} className="text-slate-400" /> {student.contactInfo}</div>
              {student.email && (
                <div className="flex items-center gap-1.5"><Mail size={16} className="text-slate-400" /> {student.email}</div>
              )}
              <div className="flex items-center gap-1.5"><User size={16} className="text-slate-400" /> {t('counselor')}: {users.find(u => u.id === student.counselor)?.name || student.counselor}</div>
              <div className="flex items-center gap-1.5"><Calendar size={16} className="text-slate-400" /> Arrived: {student.arrivalDate}</div>
            </div>

            {/* Demographics & Academic Details */}
            <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-sm text-slate-600 mb-3 py-2 px-3 bg-slate-50/80 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5">
                <Globe size={15} className="text-slate-400" />
                <span className="text-slate-500 font-medium">{t('nationality')}:</span>
                <span className="font-semibold text-slate-900">{student.nationality || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <GraduationCap size={15} className="text-slate-400" />
                <span className="text-slate-500 font-medium">{t('program')}:</span>
                <span className="font-semibold text-slate-900">{student.program || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={15} className="text-slate-400" />
                <span className="text-slate-500 font-medium">{t('studyIntake')}:</span>
                <span className="font-semibold text-slate-900">{student.studyIntake || 'Not specified'}</span>
              </div>
            </div>

            {student.flightDetails && student.flightDetails.airline && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="font-semibold text-slate-700">Flight:</div>
                <div>{student.flightDetails.airline} - {student.flightDetails.flightNumber}</div>
                {student.flightDetails.date && <div><Calendar size={12} className="inline mr-1" />{student.flightDetails.date}</div>}
                {student.flightDetails.time && <div><Clock size={12} className="inline mr-1" />{student.flightDetails.time}</div>}
              </div>
            )}

            {student.accommodationDetails && student.accommodationDetails.hotelName && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="font-semibold text-slate-700">Accommodation:</div>
                <div className="flex items-center gap-1"><Hotel size={12} /> {student.accommodationDetails.hotelName}</div>
                {student.accommodationDetails.checkInDate && <div>Check-in: {student.accommodationDetails.checkInDate}</div>}
                {student.accommodationDetails.checkOutDate && <div>Check-out: {student.accommodationDetails.checkOutDate}</div>}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200 font-mono">
                Passport: {student.passportNumber}
              </span>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-2xs",
                (student.arrivalCategory || (student as any).studentType) === 'Tourism'
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-blue-50 border-blue-300 text-blue-800"
              )}>
                {(student.arrivalCategory || (student as any).studentType) === 'Tourism' 
                  ? <Plane size={13} className="text-amber-600" /> 
                  : <GraduationCap size={13} className="text-blue-600" />}
                {(student.arrivalCategory || (student as any).studentType) === 'Tourism' ? 'Tourism Category' : 'Student Category'}
              </span>
              {(student.package || (student as any).servicePackage) && (
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-2xs",
                  (student.package || (student as any).servicePackage) === '500$' ? "bg-purple-50 border-purple-300 text-purple-800" :
                  (student.package || (student as any).servicePackage) === '300$' ? "bg-emerald-50 border-emerald-300 text-emerald-800" :
                  (student.package || (student as any).servicePackage) === '300$(Free)' ? "bg-teal-50 border-teal-300 text-teal-800" :
                  "bg-slate-50 border-slate-300 text-slate-800"
                )}>
                  <Sparkles size={13} className={(student.package || (student as any).servicePackage) === '500$' ? "text-purple-600" : (student.package || (student as any).servicePackage) === '300$' ? "text-emerald-600" : (student.package || (student as any).servicePackage) === '300$(Free)' ? "text-teal-600" : "text-slate-600"} />
                  {(student.package || (student as any).servicePackage)} Package
                </span>
              )}
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border",
                student.status === 'completed' ? "bg-green-50 border-green-200 text-green-700" :
                student.status === 'in_progress' ? "bg-red-50 border-red-200 text-red-800" :
                "bg-slate-50 border-slate-200 text-slate-700"
              )}>
                {t(student.status)}
              </span>
            </div>
          </div>
          
          <div className="shrink-0 bg-slate-50 rounded-lg p-4 border border-slate-100 min-w-[200px]">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Completed Stages</h4>
            <div className="flex flex-wrap gap-2">
              {student.completedStages.map((stage, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-md">
                  <Check size={12} /> {stage}
                </span>
              ))}
              {student.completedStages.length === 0 && <span className="text-sm text-slate-400">None yet</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Journey Timeline Stepper */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{t('journeyTimeline')}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Visual logistics progression tracking airport reception, accommodation onboarding, medical examination, and university enrollment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              {journeyStages.filter(s => s.status === 'completed').length} / {journeyStages.length} {t('completed')}
            </span>
          </div>
        </div>

        {/* Stepper Grid Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
          {journeyStages.map((stage) => {
            const Icon = stage.icon;

            return (
              <div 
                key={stage.id} 
                className={`relative rounded-2xl p-4 border transition-all ${
                  stage.status === 'completed'
                    ? 'bg-emerald-50/60 border-emerald-200/90 shadow-2xs'
                    : stage.status === 'in_progress'
                    ? 'bg-blue-50/70 border-blue-300 shadow-xs ring-2 ring-blue-500/20'
                    : stage.status === 'pending'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-slate-50/70 border-slate-200/80 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    stage.status === 'completed'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : stage.status === 'in_progress'
                      ? 'bg-blue-600 text-white animate-pulse shadow-sm'
                      : stage.status === 'pending'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    <Icon size={20} />
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    stage.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : stage.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                      : stage.status === 'pending'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {stage.status === 'completed' ? t('completedStage') :
                     stage.status === 'in_progress' ? t('inProgressStage') :
                     
                     stage.status === 'pending' ? t('pending') :
                     t('upcomingStage')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-slate-400 font-mono">0{stage.stepNumber}.</span>
                    <h4 className="font-bold text-slate-900 text-sm">{stage.title}</h4>
                  </div>
                  {stage.timestamp && (
                    <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Clock size={11} className="shrink-0" />
                      <span>{new Date(stage.timestamp).toLocaleDateString()} {new Date(stage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                  )}
                  {stage.note && (
                    <p className="text-[10px] font-semibold text-slate-600 bg-white/70 px-2 py-0.5 rounded border border-slate-200/60 mt-1 inline-block">
                      {stage.note}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Counselor Remarks Card */}
      <div className="bg-white rounded-2xl border border-purple-200/90 shadow-sm p-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-purple-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl border border-purple-100">
              <MessageSquareText size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{t('counselorRemarks')}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  Live Operations Sync
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Remarks entered here sync in real-time to the Firestore student record for the Operations Coordinator in Live Operations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(currentUser.role === 'accountant' || currentUser.role === 'counselor_manager') ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Read-Only View
              </span>
            ) : (
              <>
                {remarksSyncStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Loader2 size={12} className="animate-spin text-amber-600" />
                    <span>{t('savingRemarks')}</span>
                  </span>
                )}
                {remarksSyncStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <Check size={12} className="text-emerald-600" />
                    <span>{t('remarksSaved')}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleSaveRemarks()}
                  disabled={remarksSyncStatus === 'saving' || counselorRemarks.trim() === (student.counselorRemarks || '').trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-95"
                >
                  <Save size={13} />
                  <span>{t('saveRemarks')}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <textarea
          rows={3}
          value={counselorRemarks}
          readOnly={currentUser.role === 'accountant' || currentUser.role === 'counselor_manager'}
          disabled={currentUser.role === 'accountant' || currentUser.role === 'counselor_manager'}
          onChange={(e) => {
            if (currentUser.role !== 'accountant' && currentUser.role !== 'counselor_manager') setCounselorRemarks(e.target.value);
          }}
          onBlur={() => {
            if (currentUser.role !== 'accountant' && currentUser.role !== 'counselor_manager') handleSaveRemarks();
          }}
          placeholder={t('counselorRemarksPlaceholder')}
          className={cn(
            "w-full p-3.5 bg-slate-50/60 focus:bg-white border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-xl text-xs sm:text-sm text-slate-800 leading-relaxed resize-none transition-all placeholder:text-slate-400",
            (currentUser.role === 'accountant' || currentUser.role === 'counselor_manager') && "cursor-default bg-slate-50 text-slate-700"
          )}
        />
        {currentUser.role !== 'accountant' && currentUser.role !== 'counselor_manager' && (
          <div className="flex justify-between items-center mt-2 text-[11px] text-slate-400">
            <span>Tip: Press "Save Remarks" or click outside the text area to push real-time updates to Operations.</span>
            <span>{counselorRemarks.length} characters</span>
          </div>
        )}
      </div>

      {/* Dedicated Student Service Feedback Summary Card */}
      <div className="bg-white rounded-2xl border border-amber-200/90 shadow-sm p-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200/80 shadow-2xs">
              <ThumbsUp size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {language === 'ar' ? t('studentServiceFeedback') : 'Student Service Feedback'}
                </h3>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-Time CSAT Sync</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {language === 'ar'
                  ? 'تقييمات رضا الطالب المسجلة وملاحظاته التفصيلية حول مراحل الخدمة اللوجستية.'
                  : 'Submitted student evaluations, CSAT star ratings, and granular service milestone feedback.'}
              </p>
            </div>
          </div>

          {studentFeedbackEntries.length > 0 && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center gap-1.5 bg-amber-50/90 border border-amber-200 px-3 py-1.5 rounded-xl">
                <Star size={15} className="fill-amber-400 text-amber-400" />
                <span className="text-xs font-black text-slate-900">
                  {(
                    studentFeedbackEntries.reduce((acc, item) => acc + (item.feedback.rating || 0), 0) /
                    studentFeedbackEntries.length
                  ).toFixed(1)}{' '}
                  / 5.0
                </span>
                <span className="text-[11px] font-semibold text-slate-600">
                  ({studentFeedbackEntries.length}{' '}
                  {studentFeedbackEntries.length === 1
                    ? (language === 'ar' ? 'تقييم' : 'Evaluation')
                    : (language === 'ar' ? 'تقييمات' : 'Evaluations')})
                </span>
              </div>
            </div>
          )}
        </div>

        {studentFeedbackEntries.length === 0 ? (
          <div className="py-8 px-4 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2.5 border border-slate-200/60">
              <Star size={22} />
            </div>
            <h4 className="text-sm font-bold text-slate-700">
              {t('noFeedbackYet')}
            </h4>
            <p className="text-xs text-slate-600 max-w-md mt-1 leading-relaxed">
              {studentTasks.some(tk => tk.feedbackEmailSent)
                ? (language === 'ar'
                    ? 'تم إرسال رابط التقييم إلى بريد الطالب. سيظهر التقييم هنا تلقائياً فور إرساله.'
                    : 'A feedback evaluation link has been dispatched to the student. Responses will appear here automatically in real time.')
                : (language === 'ar'
                    ? 'سيتم إرسال استبيان التقييم تلقائياً للطالب عند اكتمال المهمة اللوجستية.'
                    : 'Once a logistics task is marked completed, the student receives an evaluation link and their response will sync here live.')}
            </p>
          </div>
        ) : (
          <div className={cn(
            "grid gap-4",
            studentFeedbackEntries.length > 1 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          )}>
            {studentFeedbackEntries.map((entry) => {
              const { feedback, presetName, officer } = entry;
              const satMeta = getSatisfactionMeta(feedback.satisfaction, language);
              const submittedFormatted = formatDateTimeUTC8(feedback.submittedAt, language);
              const isNegativeFeedback =
                Number(feedback.rating) < 4 ||
                feedback.satisfaction === 'dissatisfied' ||
                feedback.satisfaction === 'very_dissatisfied';

              return (
                <div
                  key={entry.key}
                  className={cn(
                    "rounded-2xl border p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4",
                    isNegativeFeedback
                      ? "border-red-200/90 bg-gradient-to-br from-white via-rose-50/25 to-red-50/40 dark:from-[#161f33] dark:via-[#141c2d] dark:to-[#221520]"
                      : "border-slate-300/80 bg-gradient-to-br from-white via-slate-50/50 to-amber-50/30 dark:from-[#162033] dark:via-[#141d2f] dark:to-[#1d1c2b]"
                  )}
                >
                  <div className="space-y-3.5">
                    {/* Top Row: Star Rating + Satisfaction Pill */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50/90 border border-amber-200/80">
                        <div className="flex items-center gap-0.5 text-amber-400" aria-label={`CSAT Rating ${feedback.rating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={16}
                              className={cn(
                                "transition-transform",
                                star <= feedback.rating
                                  ? "fill-amber-400 text-amber-400 drop-shadow-2xs"
                                  : "text-slate-300 fill-slate-200 dark:text-slate-700 dark:fill-slate-800"
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-xs sm:text-sm font-black text-slate-900">
                          {feedback.rating}/5
                        </span>
                      </div>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shadow-2xs",
                          satMeta.pillClass
                        )}
                      >
                        <span>{satMeta.emoji}</span>
                        <span>{satMeta.label}</span>
                      </span>
                    </div>

                    {/* Linked Task / Preset Name & Timestamp in UTC+8 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200/80 text-xs font-extrabold">
                          <Layers size={13} className="text-red-600 dark:text-red-400 shrink-0" />
                          <span>{presetName}</span>
                        </span>
                        {officer && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                            <User size={12} className="text-slate-400" />
                            <span>{officer.name}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <Clock size={12} className="text-slate-400 shrink-0" />
                        <span>{submittedFormatted}</span>
                      </div>
                    </div>

                    {/* Quick Preview Snippet of Open Comments */}
                    <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                          <MessageSquare size={11} className="text-slate-400" />
                          <span>{language === 'ar' ? 'ملاحظات الطالب' : 'Student Comment Preview'}</span>
                        </span>
                        {entry.subtaskBreakdown.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
                            {entry.subtaskBreakdown.length} {language === 'ar' ? 'معايير مقيّمة' : 'Milestones Rated'}
                          </span>
                        )}
                      </div>
                      {feedback.comments ? (
                        <p className="text-xs sm:text-sm text-slate-700 italic line-clamp-2 leading-relaxed">
                          &ldquo;{feedback.comments}&rdquo;
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          {language === 'ar'
                            ? 'لم يضف الطالب أي تعليقات نصية إضافية.'
                            : 'No open written comments submitted for this evaluation.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Button: View Full Feedback Details */}
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedFeedbackKey(entry.key)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-red-600 dark:hover:bg-red-600 text-white text-xs font-bold rounded-xl border border-slate-900 dark:border-slate-700 shadow-xs transition-all cursor-pointer active:scale-95"
                    >
                      <Eye size={14} />
                      <span>{language === 'ar' ? t('viewFullFeedbackDetails') : 'View Full Feedback Details'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div ref={mediaSectionRef} className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('timeline')}
          className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'timeline' ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700")}
        >
          {t('timeline')}
        </button>
        <button 
          onClick={() => setActiveTab('media')}
          className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'media' ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700")}
        >
          {t('mediaVault')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {activeTab === 'timeline' && (() => {
          const todayStr = getLocalDateStr();
          const filteredTimelineTasks = studentTasks.filter(task => {
            if (timelineStatusFilter !== 'all' && normalizeTaskStatus(task) !== timelineStatusFilter) return false;
            if (timelineCategoryFilter !== 'all' && getTaskCategory(task) !== timelineCategoryFilter) return false;
            return true;
          });

          return (
            <div className="space-y-6">
              {/* Timeline Filter Pills: Separate by Status & Category */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: 'all', label: t('all') || 'All' },
                    { id: 'in_progress', label: t('in_progress') || 'In Progress' },
                    { id: 'pending', label: t('pending') || 'Pending' },
                    { id: 'completed', label: t('completed') || 'Completed' },
                    { id: 'cancelled', label: t('cancelled') || 'Cancelled' },
                  ] as const).map(opt => {
                    const count = opt.id === 'all' ? studentTasks.length : studentTasks.filter(tk => normalizeTaskStatus(tk) === opt.id).length;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTimelineStatusFilter(opt.id)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                          timelineStatusFilter === opt.id
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {opt.label} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
                  {([
                    { id: 'all', label: t('allCategories') || 'All Types' },
                    { id: 'student_preset', label: t('studentPresetCategory') || 'SOP' },
                    { id: 'student_custom', label: t('studentCustomCategory') || 'Custom' },
                  ] as const).map(catOpt => (
                    <button
                      key={catOpt.id}
                      type="button"
                      onClick={() => setTimelineCategoryFilter(catOpt.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer",
                        timelineCategoryFilter === catOpt.id
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {catOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTimelineTasks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  {t('noTasks') || 'No tasks match the selected filters.'}
                </div>
              ) : (
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {filteredTimelineTasks.map((task) => {
                    const assignee = users.find(u => u.id === task.assigneeId);
                    const duration = formatDuration(task.startedAt || task.createdAt, task.completedAt);
                    const linkedFeedbackEntry = studentFeedbackEntries.find(e => e.task?.id === task.id);
                    const displayFeedback = linkedFeedbackEntry?.feedback || task.feedback;
                    const taskCategory = getTaskCategory(task);
                    const effectiveStatus = normalizeTaskStatus(task);
                    const serviceLabel = getTaskServiceLabel(task, presets, language);
                    const scheduleBucket = getTaskScheduleBucket(task, todayStr);
                    const taskIsOpen = isOpenTask(task);
                    
                    return (
                      <div key={task.id} className="relative flex flex-col md:flex-row items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mb-8 md:mb-0">
                        <div className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 absolute md:relative left-[-2rem] md:left-auto",
                          effectiveStatus === 'completed' ? "bg-emerald-50 text-emerald-600" :
                          effectiveStatus === 'in_progress' ? "bg-blue-50 text-blue-600" :
                          effectiveStatus === 'cancelled' ? "bg-rose-50 text-rose-600" :
                          "bg-amber-50 text-amber-600"
                        )}>
                          {effectiveStatus === 'completed' ? <CheckCircle2 className="text-emerald-600" size={20} /> :
                           effectiveStatus === 'in_progress' ? <Clock className="text-blue-600" size={20} /> :
                           effectiveStatus === 'cancelled' ? <X className="text-rose-600" size={20} /> :
                           <Circle className="text-amber-600" size={20} />}
                        </div>
                        <div className={cn(
                          "w-full md:w-[calc(50%-2.5rem)] p-5 rounded-xl border shadow-sm bg-white ml-6 md:ml-0",
                          effectiveStatus === 'cancelled' ? "border-rose-200/80 opacity-85" :
                          effectiveStatus === 'in_progress' ? "border-blue-200" :
                          effectiveStatus === 'pending' ? "border-amber-200/80" :
                          "border-slate-200"
                        )}>
                          
                          {/* Header */}
                          <div className="flex flex-col gap-3 mb-4 pb-3 border-b border-slate-100">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border",
                                    taskCategory === 'student_custom'
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  )}>
                                    {taskCategory === 'student_custom'
                                      ? (t('studentCustomCategory') || 'Student Custom')
                                      : (t('studentPresetCategory') || 'Student SOP')}
                                  </span>
                                  {taskIsOpen && scheduleBucket === 'overdue' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                                      {language === 'ar' ? 'متأخرة' : 'Overdue'}
                                    </span>
                                  )}
                                  {taskIsOpen && scheduleBucket === 'unscheduled' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                      {language === 'ar' ? 'غير مجدولة' : 'Unscheduled'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold text-slate-900 text-base">
                                  {serviceLabel}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Calendar size={12} /> {formatDateDDMMYYYY(task.createdAt)}
                                  </span>
                                  {duration && (
                                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                                      <Timer size={12} /> {duration}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={cn(
                                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0",
                                getTaskStatusBadgeClasses(effectiveStatus)
                              )}>
                                {t(effectiveStatus) || effectiveStatus.replace('_', ' ')}
                              </span>
                            </div>
                      
                      {/* Assignee Badge & Email */}
                      <div className="flex flex-wrap items-center gap-2">
                        {assignee && (
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2 w-fit">
                            {assignee.avatar ? (
                              <img src={assignee.avatar} alt={assignee.name} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                <User size={12} />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase leading-none">Assigned to</span>
                              <span className="text-xs font-medium text-slate-700 leading-tight">{assignee.name}</span>
                            </div>
                          </div>
                        )}
                        {task.studentEmail && (
                          <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-900 font-medium">
                            <Mail size={13} className="text-red-500 shrink-0" />
                            <span className="truncate">{task.studentEmail}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Metadata Badges */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {task.taskDate && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                          <Calendar size={12} />
                          {formatDateDDMMYYYY(task.taskDate)}
                        </span>
                      )}
                      {task.taskTime && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                          <Clock size={12} />
                          {task.taskTime}
                        </span>
                      )}
                      {task.hotel && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                          <Hotel size={12} />
                          {task.hotel}
                        </span>
                      )}
                      {task.vehicleId && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                          <Car size={12} />
                          {vehicles?.find(v => v.id === task.vehicleId)?.name || task.vehicleId}
                        </span>
                      )}
                    </div>
                    
                    {/* Notes */}
                    {(task.coordinatorNote1 || task.coordinatorNote2 || task.notes) && (
                      <div className="mb-4 space-y-2">
                        {task.coordinatorNote1 && (
                          <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex items-start gap-2">
                            <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-900 leading-relaxed font-medium">Note 1: {task.coordinatorNote1}</p>
                          </div>
                        )}
                        {task.coordinatorNote2 && (
                          <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex items-start gap-2">
                            <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-900 leading-relaxed font-medium">Note 2: {task.coordinatorNote2}</p>
                          </div>
                        )}
                        {task.notes && (() => {
                          const studentReportTs = task.notesUpdatedAt || (task.status === 'completed' ? task.completedAt : undefined);
                          const formattedStudentReportTime = (() => {
                            if (!studentReportTs) return null;
                            try {
                              const d = new Date(studentReportTs);
                              if (Number.isNaN(d.getTime())) return null;
                              const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              return `${formatDateDDMMYYYY(d)} • ${timeStr}`;
                            } catch {
                              return null;
                            }
                          })();

                          return (
                            <div className="bg-amber-50 border-l-2 border-amber-400 p-3 rounded-r-lg text-sm space-y-1">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-xs uppercase tracking-wide">
                                  <MessageSquare size={12} /> {t('logisticReport') || 'Logistic Report'}
                                </div>
                                {formattedStudentReportTime && (
                                  <span className="text-[10px] text-amber-800/80 font-medium flex items-center gap-1">
                                    <Clock size={10} />
                                    <span>{formattedStudentReportTime}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-amber-900 leading-relaxed text-xs">{task.notes}</p>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Subtasks */}
                    <div className="space-y-3">
                      {getTaskDisplaySteps(task).map(st => (
                        <div key={st.id} className="flex flex-col gap-1.5">
                          <div className="flex items-start gap-2 text-sm">
                            <div className="mt-0.5">
                              {st.isCompleted ? <CheckCircle2 size={16} className="text-green-500 shrink-0" /> : <Circle size={16} className="text-slate-300 shrink-0" />}
                            </div>
                            <div className="flex flex-col flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn(
                                  "font-medium leading-snug", 
                                  st.isCompleted ? "text-slate-500 line-through" : "text-slate-700"
                                )}>
                                  {language === 'ar' && st.titleAr ? st.titleAr : st.titleEn}
                                </span>
                                {st.isCommunicationStep && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                    Student Contact
                                  </span>
                                )}
                              </div>
                              
                              {/* Subtask specific info */}
                              {(st.completedAt || (st.media && st.media.length > 0)) && (
                                <div className="flex flex-col gap-2 mt-1.5">
                                  {st.completedAt && (
                                    <span className="text-xs font-medium text-green-600 bg-green-50 w-fit px-1.5 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                      <Clock size={10} /> 
                                      {new Date(st.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                  
                                  {st.media && st.media.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                      {st.media.map((m, mIdx) => (
                                        <div 
                                          key={mIdx} 
                                          className="w-12 h-12 rounded-md overflow-hidden cursor-pointer border border-slate-200 hover:border-red-400 transition-colors group relative shadow-sm"
                                          onClick={() => setSelectedMedia(m)}
                                        >
                                          <img src={m.url} alt="Proof" className="w-full h-full object-cover" />
                                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Upload size={12} className="text-white" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Student Feedback */}
                    {displayFeedback && (() => {
                      const timelineSatMeta = getSatisfactionMeta(displayFeedback.satisfaction, language);
                      const isNegativeTimeline =
                        Number(displayFeedback.rating) < 4 ||
                        displayFeedback.satisfaction === 'dissatisfied' ||
                        displayFeedback.satisfaction === 'very_dissatisfied';
                      const isNeutralTimeline =
                        !isNegativeTimeline &&
                        (Number(displayFeedback.rating) === 3 || displayFeedback.satisfaction === 'neutral');

                      return (
                        <div
                          className={cn(
                            "mt-5 p-4 rounded-xl border text-xs",
                            isNegativeTimeline
                              ? "bg-red-50/80 border-red-200/80"
                              : isNeutralTimeline
                              ? "bg-amber-50/80 border-amber-200/80"
                              : "bg-emerald-50/80 border-emerald-200/80"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex text-amber-400">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={14}
                                    className={
                                      star <= displayFeedback.rating
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-300 dark:text-slate-700'
                                    }
                                  />
                                ))}
                              </div>
                              <span
                                className={cn(
                                  "font-bold ml-1",
                                  isNegativeTimeline
                                    ? "text-red-950"
                                    : isNeutralTimeline
                                    ? "text-amber-950"
                                    : "text-emerald-950"
                                )}
                              >
                                {displayFeedback.rating}/5 {t('studentFeedback')}
                              </span>
                            </div>
                            {displayFeedback.satisfaction && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border",
                                  timelineSatMeta.pillClass
                                )}
                              >
                                <span>{timelineSatMeta.emoji}</span>
                                <span>{timelineSatMeta.label}</span>
                              </span>
                            )}
                          </div>
                          {displayFeedback.comments && (
                            <p className="text-slate-700 italic bg-white/90 dark:bg-slate-950/75 p-3 rounded-lg border border-slate-200/80 leading-relaxed line-clamp-2">
                              &ldquo;{displayFeedback.comments}&rdquo;
                            </p>
                          )}
                          <div
                            className={cn(
                              "mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-2",
                              isNegativeTimeline
                                ? "border-red-200/60"
                                : isNeutralTimeline
                                ? "border-amber-200/60"
                                : "border-emerald-200/60"
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                isNegativeTimeline
                                  ? "text-red-700"
                                  : isNeutralTimeline
                                  ? "text-amber-800"
                                  : "text-emerald-700"
                              )}
                            >
                              Submitted: {formatDateTimeUTC8(displayFeedback.submittedAt, language)}
                            </span>
                            {linkedFeedbackEntry && (
                              <button
                                type="button"
                                onClick={() => setSelectedFeedbackKey(linkedFeedbackEntry.key)}
                                className={cn(
                                  "inline-flex items-center gap-1 text-[11px] font-bold hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 cursor-pointer",
                                  isNegativeTimeline
                                    ? "text-red-900"
                                    : isNeutralTimeline
                                    ? "text-amber-900"
                                    : "text-emerald-900"
                                )}
                              >
                                <Eye size={12} />
                                <span>{language === 'ar' ? t('viewFullFeedbackDetails') : 'View Full Feedback Details'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )
            })}
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'media' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {allStudentMedia.map((item, idx) => (
              <div 
                key={idx} 
                className="aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-50 relative group cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                onClick={() => setSelectedMedia(item)}
              >
                <img src={item.url} alt="Proof" className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 pointer-events-none">
                  <span className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow",
                    item.type === 'communication' 
                      ? "bg-blue-600/90 text-white" 
                      : "bg-slate-900/80 text-white"
                  )}>
                    {item.type === 'communication' ? 'Communication' : 'Field Proof'}
                  </span>
                </div>
                <div className="absolute inset-0 bg-slate-900/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center text-white">
                  <span className="text-xs font-bold mb-1 line-clamp-1">{item.title}</span>
                  <span className="text-[11px] text-slate-200 mb-1">{new Date(item.timestamp).toLocaleString()}</span>
                  <span className="text-[10px] text-slate-300 line-clamp-2">{item.location}</span>
                </div>
              </div>
            ))}
            {allStudentMedia.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 flex flex-col items-center">
                <Upload size={32} className="mb-2 text-slate-300" />
                <p>{t('noMedia')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {isAssigning && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] sm:max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">{t('assignTask')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign a new logistics SOP task to <span className="font-semibold text-slate-800">{student.fullName}</span>
                </p>
              </div>
              <button 
                onClick={() => { setIsAssigning(false); resetAssignForm(); }} 
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-white">
              {assignError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-100 font-medium">
                  {assignError}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('selectPreset')}</label>
                <select 
                  value={selectedPreset}
                  onChange={handlePresetChange}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
                >
                  <option value="">-- {t('selectPreset')} --</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{language === 'ar' ? (p.nameAr || p.nameEn) : p.nameEn}</option>
                  ))}
                  <option value="custom" className="font-semibold text-red-600">
                    ✨ {t('customTaskOption')}
                  </option>
                </select>
              </div>

              {/* Dynamic Form Fields for Custom Task */}
              {selectedPreset === 'custom' && (
                <div className="p-4 bg-red-50/60 border border-red-200/80 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wider">
                    <Sparkles size={14} className="text-red-600" />
                    <span>{t('customTaskOption')}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t('customTaskTitle')} <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={customTaskTitle}
                      onChange={e => setCustomTaskTitle(e.target.value)}
                      placeholder={t('customTaskTitlePlaceholder')}
                      className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t('customTaskTitleAr')}
                    </label>
                    <input 
                      type="text" 
                      value={customTaskTitleAr}
                      onChange={e => setCustomTaskTitleAr(e.target.value)}
                      placeholder={t('customTaskTitlePlaceholderAr')}
                      dir="rtl"
                      className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-right"
                    />
                  </div>
                </div>
              )}
              
              {selectedPreset && (
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        {selectedPreset === 'custom' ? t('customChecklistDesc') : t('taskSopSteps')}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {customSubTasks.length} {customSubTasks.length === 1 ? 'step' : 'steps'} &bull; {customSubTasks.filter(st => st.requiresProof).length} proof required
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomSubTasks([...customSubTasks, { titleEn: '', titleAr: '', requiresProof: false }])}
                      className="text-xs bg-red-50 text-red-600 hover:bg-red-100 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} /> {t('addSubtask')}
                    </button>
                  </div>
                  
                  {customSubTasks.length === 0 ? (
                    <div className="text-center py-4 bg-white/60 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      No checklist steps yet. Click &quot;{t('addSubtask')}&quot; to add one.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {customSubTasks.map((st, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <input 
                            type="text" 
                            value={st.titleEn}
                            onChange={(e) => {
                              const newTasks = [...customSubTasks];
                              newTasks[idx].titleEn = e.target.value;
                              setCustomSubTasks(newTasks);
                            }}
                            placeholder="English Step Title"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                          />
                          <input 
                            type="text" 
                            value={st.titleAr}
                            onChange={(e) => {
                              const newTasks = [...customSubTasks];
                              newTasks[idx].titleAr = e.target.value;
                              setCustomSubTasks(newTasks);
                            }}
                            placeholder="Arabic (العربية)"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 text-right bg-white"
                            dir="rtl"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newTasks = [...customSubTasks];
                              newTasks[idx].requiresProof = !newTasks[idx].requiresProof;
                              setCustomSubTasks(newTasks);
                            }}
                            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors shrink-0 ${
                              st.requiresProof ? 'bg-red-50 text-red-700 border-red-200 shadow-2xs font-semibold' : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
                            }`}
                            title={st.requiresProof ? "Photo proof required" : "Photo proof optional"}
                          >
                            <Camera size={13} className={st.requiresProof ? "text-red-600" : "text-slate-400"} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              const newTasks = customSubTasks.filter((_, i) => i !== idx);
                              setCustomSubTasks(newTasks);
                            }}
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0"
                            title="Remove step"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('selectAssignee')}</label>
                <select 
                  value={selectedAssignee}
                  onChange={e => setSelectedAssignee(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                >
                  <option value="">-- {t('selectAssignee')} --</option>
                  {users.filter(u => u.role === 'field_officer').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('coordinatorNote1')} (Optional)</label>
                <textarea 
                  value={coordinatorNote1}
                  onChange={e => setCoordinatorNote1(e.target.value)}
                  rows={2}
                  placeholder="Special instructions or reminders for the officer..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-xs resize-none"
                ></textarea>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('coordinatorNote2')} (Optional)</label>
                <textarea 
                  value={coordinatorNote2}
                  onChange={e => setCoordinatorNote2(e.target.value)}
                  rows={2}
                  placeholder="Secondary instructions or contacts..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-xs resize-none"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('taskDate')} (Optional)</label>
                  <DatePicker value={taskDate} onChange={setTaskDate} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('taskTime')} (Optional)</label>
                  <input 
                    type="time" 
                    value={taskTime}
                    onChange={e => setTaskTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('hotel')} (Optional)</label>
                <input 
                  type="text" 
                  value={hotel}
                  onChange={e => setHotel(e.target.value)}
                  placeholder="Hotel / Residence Name"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('vehicleId')} (Optional)</label>
                <select 
                  value={vehicleId}
                  onChange={e => setVehicleId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                >
                  <option value="">-- Select Vehicle --</option>
                  {vehicles?.filter(v => v.status === 'active').map(v => (
                    <option key={v.id} value={v.id}>{v.name} - {v.plateNumber}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Sticky Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0 z-10 shrink-0">
              <button 
                type="button"
                onClick={() => { setIsAssigning(false); resetAssignForm(); }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
              <button 
                type="button"
                onClick={handleAssignTask}
                disabled={!selectedPreset || !selectedAssignee || (selectedPreset === 'custom' && !customTaskTitle.trim()) || customSubTasks.length === 0}
                className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all active:scale-95"
              >
                {t('assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Lightbox Modal with Mobile-Optimized Back & X buttons */}
      <PhotoLightboxModal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        imageUrl={selectedMedia?.url || null}
        title={selectedMedia?.title}
        timestamp={selectedMedia?.timestamp}
        location={selectedMedia?.location}
      />

      {isEditing && editStudent && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Edit Student</h3>
              <button onClick={() => { setIsEditing(false); setEditError(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            {editError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
                {editError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('fullName')} *</label>
                <input 
                  type="text" 
                  value={editStudent.fullName}
                  onChange={e => setEditStudent({...editStudent, fullName: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('passportNumber')} *</label>
                <input 
                  type="text" 
                  value={editStudent.passportNumber}
                  onChange={e => setEditStudent({...editStudent, passportNumber: e.target.value.toUpperCase()})}
                  onBlur={e => setEditStudent(prev => ({ ...prev, passportNumber: e.target.value.trim().toUpperCase() }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('nationality')} *</label>
                <input 
                  type="text" 
                  list="profile-nationalities-list"
                  value={editStudent.nationality || ''}
                  onChange={e => setEditStudent({...editStudent, nationality: e.target.value})}
                  placeholder="e.g. Yemeni, Saudi, Egyptian..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm bg-white"
                  required
                />
                <datalist id="profile-nationalities-list">
                  {COMMON_NATIONALITIES.map(nat => (
                    <option key={nat} value={nat} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('studyIntake')} *</label>
                <input 
                  type="text" 
                  value={editStudent.studyIntake || ''}
                  onChange={e => setEditStudent({...editStudent, studyIntake: e.target.value})}
                  placeholder='e.g. "October 2026" or "Feb 2027"'
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('arrivalCategory')} *</label>
                <select 
                  value={editStudent.arrivalCategory || 'Student'}
                  onChange={e => setEditStudent({...editStudent, arrivalCategory: e.target.value as ArrivalCategory})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-sm font-medium"
                  required
                >
                  <option value="Student">Student</option>
                  <option value="Tourism">Tourism</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('program')} *</label>
                <select 
                  value={editStudent.program || 'Bachelor'}
                  onChange={e => setEditStudent({...editStudent, program: e.target.value as AcademicProgram})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-sm font-medium"
                  required
                >
                  {ACADEMIC_PROGRAMS.map(prog => (
                    <option key={prog} value={prog}>{prog}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('package') || 'Package'} *</label>
                <select 
                  value={editStudent.package || 'Free'}
                  onChange={e => setEditStudent({...editStudent, package: e.target.value as ServicePackage})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-sm font-medium"
                  required
                >
                  {SERVICE_PACKAGES.map(pkg => (
                    <option key={pkg} value={pkg}>{pkg}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('studentEmail')} *</label>
                <input 
                  type="email" 
                  required
                  value={editStudent.email || ''}
                  onChange={e => setEditStudent({...editStudent, email: e.target.value})}
                  placeholder="e.g. student@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('university')}</label>
                <input 
                  type="text" 
                  value={editStudent.university}
                  onChange={e => setEditStudent({...editStudent, university: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('contact')}</label>
                <input 
                  type="text" 
                  value={editStudent.contactInfo}
                  onChange={e => setEditStudent({...editStudent, contactInfo: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('counselor')} *</label>
                <select 
                  value={editStudent.counselor}
                  onChange={e => setEditStudent({...editStudent, counselor: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-sm"
                >
                  <option value="">{t('selectCounselor') || 'Select Counselor'}</option>
                  {users
                    .filter(u => u.role === 'counselor')
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 mb-3 text-sm">Flight Details (Optional)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Airline</label>
                    <input type="text" value={editStudent.flightDetails?.airline || ''} onChange={e => setEditStudent({...editStudent, flightDetails: {...(editStudent.flightDetails || {}), airline: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Flight Number</label>
                    <input type="text" value={editStudent.flightDetails?.flightNumber || ''} onChange={e => setEditStudent({...editStudent, flightDetails: {...(editStudent.flightDetails || {}), flightNumber: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                    <input type="date" value={editStudent.flightDetails?.date || ''} onChange={e => setEditStudent({...editStudent, flightDetails: {...(editStudent.flightDetails || {}), date: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                    <input type="time" value={editStudent.flightDetails?.time || ''} onChange={e => setEditStudent({...editStudent, flightDetails: {...(editStudent.flightDetails || {}), time: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 mb-3 text-sm">Accommodation (Optional)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Hotel / Residence Name</label>
                    <input type="text" value={editStudent.accommodationDetails?.hotelName || ''} onChange={e => setEditStudent({...editStudent, accommodationDetails: {...(editStudent.accommodationDetails || {}), hotelName: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Check In</label>
                    <input type="date" value={editStudent.accommodationDetails?.checkInDate || ''} onChange={e => setEditStudent({...editStudent, accommodationDetails: {...(editStudent.accommodationDetails || {}), checkInDate: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Check Out</label>
                    <input type="date" value={editStudent.accommodationDetails?.checkOutDate || ''} onChange={e => setEditStudent({...editStudent, accommodationDetails: {...(editStudent.accommodationDetails || {}), checkOutDate: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => { setIsEditing(false); setEditError(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleUpdateStudent}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Details Modal / Inspection Drawer */}
      {activeFeedbackModalEntry && (() => {
        const {
          feedback,
          task,
          presetName,
          officer,
          assignedOfficerId,
          completedAt,
          auditMedia,
          subtaskBreakdown,
        } = activeFeedbackModalEntry;
        const satMeta = getSatisfactionMeta(feedback.satisfaction, language);
        const taskDuration = formatDuration(task?.startedAt || task?.createdAt, task?.completedAt);

        const handleJumpToAuditProofs = () => {
          setSelectedFeedbackKey(null);
          setActiveTab('media');
          setTimeout(() => {
            mediaSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        };

        return (
          <div
            className="fixed inset-0 bg-slate-900/65 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setSelectedFeedbackKey(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-inspection-modal-title"
          >
            <div
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-7 sticky top-0 z-10 border-b border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 text-white text-xs font-extrabold tracking-wide shadow-xs">
                        <Layers size={13} />
                        <span>{presetName}</span>
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border",
                          satMeta.pillClass
                        )}
                      >
                        <span>{satMeta.emoji}</span>
                        <span>{satMeta.label}</span>
                      </span>
                    </div>

                    <h3 id="feedback-inspection-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-white">
                      {student.fullName}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={13} className="text-red-400" />
                        <span>
                          {language === 'ar' ? 'تاريخ الإنجاز:' : 'Completed:'}{' '}
                          <strong className="text-white">{formatDateTimeUTC8(completedAt, language)}</strong>
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-400" />
                        <span>
                          {language === 'ar' ? 'تاريخ التقييم:' : 'Submitted:'}{' '}
                          <strong className="text-white">{formatDateTimeUTC8(feedback.submittedAt, language)}</strong>
                        </span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFeedbackKey(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors shrink-0 cursor-pointer"
                    aria-label="Close Feedback Details"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Overall CSAT Star Score Bar */}
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      {language === 'ar' ? 'تقييم الرضا العام (CSAT):' : 'Overall CSAT Star Score:'}
                    </span>
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={18}
                          className={cn(
                            star <= feedback.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-600 fill-slate-800"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-black text-amber-400 ml-1">
                      {feedback.rating} / 5
                    </span>
                  </div>

                  {(feedback.studentEmail || student.email) && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                      <Mail size={12} className="text-red-400" />
                      <span>{feedback.studentEmail || student.email}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 bg-white">
                {/* 1. Granular Subtask Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-100">
                        <Layers size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          {language === 'ar' ? t('subtaskBreakdown') : 'Granular Subtask Breakdown'}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {language === 'ar'
                            ? 'تقييمات الطالب التفصيلية لكل خطوة ومعيار ضمن الخدمة اللوجستية.'
                            : `Preset-specific milestone questions and individual ratings for ${presetName}.`}
                        </p>
                      </div>
                    </div>
                    {subtaskBreakdown.length > 0 && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {subtaskBreakdown.length} {language === 'ar' ? 'معايير' : 'Items'}
                      </span>
                    )}
                  </div>

                  {subtaskBreakdown.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 text-center">
                      {language === 'ar'
                        ? 'لم يتم تسجيل تقييمات فرعية إضافية لهذا التقييم.'
                        : 'No granular subtask ratings were recorded for this evaluation.'}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {subtaskBreakdown.map((item, idx) => {
                        const scoreMeta = getSubtaskScoreMeta(item.score, language);
                        return (
                          <div
                            key={item.id || idx}
                            className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                                {idx + 1}
                              </span>
                              <div className="space-y-0.5">
                                {item.title && (
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                                    {item.title}
                                  </span>
                                )}
                                <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                                  {item.question}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {scoreMeta.isNumeric && scoreMeta.numericScore !== undefined && (
                                <div className="flex items-center gap-0.5 text-amber-400">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      size={13}
                                      className={cn(
                                        s <= scoreMeta.numericScore!
                                          ? "fill-amber-400 text-amber-400"
                                          : "text-slate-200 fill-slate-100 dark:text-slate-700 dark:fill-slate-800"
                                      )}
                                    />
                                  ))}
                                </div>
                              )}
                              <span
                                className={cn(
                                  "px-3 py-1 rounded-xl text-xs font-extrabold border shadow-2xs",
                                  scoreMeta.pillClass
                                )}
                              >
                                {scoreMeta.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Student Comments & Remarks */}
                <div className="space-y-2.5 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {language === 'ar' ? t('studentCommentsRemarks') : 'Student Comments & Remarks'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {language === 'ar'
                          ? 'النص الكامل لملاحظات الطالب ومقترحاته حول الخدمة.'
                          : 'Unabridged student feedback notes, observations, and suggestions.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80">
                    {feedback.comments ? (
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap italic">
                        &ldquo;{feedback.comments}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        {language === 'ar'
                          ? 'لم يقم الطالب بإدخال أي ملاحظات أو تعليقات إضافية.'
                          : 'No written comments or additional remarks were provided by the student.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Assigned Officer & Audit Link */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                      <Camera size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {language === 'ar' ? t('assignedOfficerAudit') : 'Assigned Officer & Audit Link'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {language === 'ar'
                          ? 'الموظف الميداني المسؤول عن تنفيذ الخدمة وصور إثباتات التدقيق المرتبطة.'
                          : 'Field officer who executed the service and direct access to GPS-watermarked task audit proofs.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Officer Info */}
                      <div className="flex items-center gap-3">
                        {officer?.avatar ? (
                          <img
                            src={officer.avatar}
                            alt={officer.name}
                            className="w-11 h-11 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-xs"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center text-sm font-bold border-2 border-white dark:border-slate-700 shadow-xs">
                            {officer?.name ? officer.name.charAt(0).toUpperCase() : <User size={18} />}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {officer?.name || (language === 'ar' ? 'موظف العمليات الميدانية' : 'Field Operations Officer')}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                              {t('field_officer')}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-0.5">
                            {assignedOfficerId && (
                              <span>ID: <code className="text-[11px] font-mono text-slate-700">{assignedOfficerId}</code></span>
                            )}
                            {taskDuration && (
                              <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                                <Timer size={12} /> Duration: {taskDuration}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Direct Link Button to View Associated Task Audit Proof Photos */}
                      <button
                        type="button"
                        onClick={() => {
                          if (auditMedia.length > 0) {
                            setSelectedMedia(auditMedia[0]);
                          } else {
                            handleJumpToAuditProofs();
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-900 dark:hover:bg-red-600 text-slate-900 hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
                      >
                        <ExternalLink size={14} />
                        <span>
                          {language === 'ar' ? t('viewTaskAuditPhotos') : 'View Task Audit Proof Photos'}
                          {auditMedia.length > 0 ? ` (${auditMedia.length})` : ''}
                        </span>
                      </button>
                    </div>

                    {/* Inline Task Audit Proof Thumbnails */}
                    {auditMedia.length > 0 ? (
                      <div className="pt-3 border-t border-slate-200/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {language === 'ar' ? 'إثباتات المهمة المرفقة:' : 'Attached Task Audit Proofs:'}
                          </span>
                          <button
                            type="button"
                            onClick={handleJumpToAuditProofs}
                            className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                          >
                            {language === 'ar' ? 'فتح خزنة الوسائط الكاملة ←' : 'Open Full Media Vault →'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                          {auditMedia.map((mediaItem, mIdx) => (
                            <button
                              type="button"
                              key={mIdx}
                              onClick={() => setSelectedMedia(mediaItem)}
                              className="group relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 hover:border-red-500 shrink-0 shadow-2xs transition-all cursor-pointer"
                              title={mediaItem.title}
                            >
                              <img src={mediaItem.url} alt={mediaItem.title} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye size={14} className="text-white" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {language === 'ar'
                            ? 'لا توجد صور إثبات مرفوعة لهذه المهمة بعد.'
                            : 'No audit proof photos uploaded for this specific task yet.'}
                        </span>
                        <button
                          type="button"
                          onClick={handleJumpToAuditProofs}
                          className="font-bold text-red-600 hover:underline cursor-pointer"
                        >
                          {t('mediaVault')} →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 sticky bottom-0 z-10">
                <span className="text-[11px] text-slate-400 font-medium">
                  Task ID: <code className="font-mono text-slate-700">{feedback.taskId}</code>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFeedbackKey(null)}
                  className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close Details'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {student && (
        <RequestTaskModal
          isOpen={isRequestingTask}
          onClose={() => setIsRequestingTask(false)}
          preSelectedStudentId={student.id}
        />
      )}

      {isConfirmingDelete && student && (
        <DeleteStudentConfirmModal
          isOpen={isConfirmingDelete}
          students={[student]}
          onClose={() => setIsConfirmingDelete(false)}
          onConfirm={handleDeleteProfile}
          isDeleting={isDeletingProfile}
        />
      )}
    </div>
  );
}
