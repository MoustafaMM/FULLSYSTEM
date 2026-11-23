import { doc, collection, setDoc, updateDoc, Firestore, FieldValue } from 'firebase/firestore';
import { Task, Student, TaskPreset, User } from '../types';
import { getFeedbackEmailPayload } from './feedbackEmailTemplate';
import { normalizeTaskStatus, hasValidCompletedAt, isOpenTask } from './taskClassification';

const isFirestoreSentinel = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof FieldValue) return true;
  const proto = Object.getPrototypeOf(value);
  return proto !== null && proto !== Object.prototype && typeof (value as { _methodName?: unknown })._methodName === 'string';
};

/**
 * Recursive utility to strip undefined values from objects and arrays for Firestore
 * while preserving Firestore FieldValue sentinels (e.g., deleteField(), serverTimestamp()).
 */
export const sanitizeForFirestore = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return undefined as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    if (isFirestoreSentinel(data)) {
      return data;
    }
    const res: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const sanitizedVal = sanitizeForFirestore(value);
        if (sanitizedVal !== undefined) {
          res[key] = sanitizedVal;
        }
      }
    }
    return res;
  }
  return data;
};

/**
 * Resolves a human-readable title for a task across custom titles, presets, and languages.
 */
export const resolveCompletionTaskTitle = (
  task: Partial<Task>,
  preset?: TaskPreset,
  language: 'en' | 'ar' = 'en'
): string => {
  const hasRealPreset = Boolean(task.presetId && task.presetId !== 'custom');
  const isLegacyCopiedCustom = Boolean(
    task.isNonStudentTask &&
    hasRealPreset &&
    task.customTitle?.trim() &&
    task.nonStudentTitle?.trim() &&
    task.customTitle.trim() === task.nonStudentTitle.trim()
  );

  if (!isLegacyCopiedCustom && language === 'ar' && task.customTitleAr?.trim()) {
    return task.customTitleAr.trim();
  }
  if (!isLegacyCopiedCustom && task.customTitle?.trim()) {
    return task.customTitle.trim();
  }
  if (task.nonStudentTitle?.trim()) {
    return task.nonStudentTitle.trim();
  }
  if (preset) {
    if (language === 'ar' && preset.nameAr) return preset.nameAr;
    if (preset.nameEn) return preset.nameEn;
    if (preset.nameAr) return preset.nameAr;
  }
  return 'Logistics Service';
};

export const LOGISTIC_REPORT_REQUIRED_ERROR =
  'Logistic Report is compulsory to fill before finishing the task.';

/**
 * Checks whether a Logistic Report (task.notes) contains non-whitespace content.
 */
export const hasValidLogisticReport = (notes?: string | null): boolean => {
  return typeof notes === 'string' && notes.trim().length > 0;
};

/**
 * Resolves the effective Logistic Report after applying an optional override (e.g. unsaved draft notes).
 */
export const resolveEffectiveLogisticReport = (
  existingNotes?: string | null,
  overrideNotes?: string | null
): string => {
  if (overrideNotes !== undefined && overrideNotes !== null) {
    return overrideNotes.trim();
  }
  return typeof existingNotes === 'string' ? existingNotes.trim() : '';
};

/**
 * Enforces that a compulsory Logistic Report exists before completing a task.
 * Returns the trimmed report text or throws an error if empty/whitespace-only.
 */
export const assertLogisticReportForCompletion = (
  existingNotes?: string | null,
  overrideNotes?: string | null
): string => {
  const effectiveReport = resolveEffectiveLogisticReport(existingNotes, overrideNotes);
  if (!hasValidLogisticReport(effectiveReport)) {
    throw new Error(LOGISTIC_REPORT_REQUIRED_ERROR);
  }
  return effectiveReport;
};

export const CANNOT_REVERT_COMPLETED_TASK_ERROR =
  'This task is already completed and cannot be reopened or reverted from field execution.';

export const CANNOT_MODIFY_CANCELLED_TASK_ERROR =
  'This task is cancelled and cannot be restarted or modified.';

/**
 * Guards operational status execution updates (e.g., startTask / updateTaskStatus)
 * against accidentally reverting an already completed or cancelled task back to pending/in_progress.
 * Intentional reopening by Coordinators/Admins must go explicitly through EditTaskModal -> updateTask.
 */
export const assertExecutionStatusTransition = (
  currentTask: Partial<Task> | undefined,
  nextStatus: Task['status']
): void => {
  if (!currentTask) return;
  const currentStatus = normalizeTaskStatus(currentTask);
  if (currentStatus === 'completed' && nextStatus !== 'completed') {
    throw new Error(CANNOT_REVERT_COMPLETED_TASK_ERROR);
  }
  if (currentStatus === 'cancelled' && nextStatus !== 'cancelled') {
    throw new Error(CANNOT_MODIFY_CANCELLED_TASK_ERROR);
  }
};

export interface BuildTaskStatusUpdatePayloadOptions {
  existingTask?: Partial<Task>;
  status: Task['status'];
  extra?: {
    studentEmail?: string;
    notes?: string;
  };
  nowIso?: string;
}

/**
 * Builds a single atomic update payload for tasks/{taskId}.
 * Guarantees completedAt / startedAt timestamps and avoids setting premature email flags.
 */
export const buildTaskStatusUpdatePayload = ({
  existingTask,
  status,
  extra,
  nowIso
}: BuildTaskStatusUpdatePayloadOptions): Partial<Task> => {
  const now = nowIso || new Date().toISOString();
  const currentStatus = normalizeTaskStatus(existingTask);
  const updates: Partial<Task> = { status };

  if (extra?.notes !== undefined && extra.notes !== null) {
    const trimmedNotes = extra.notes.trim();
    updates.notes = trimmedNotes;
    if (trimmedNotes) {
      updates.notesUpdatedAt = now;
    }
  } else if (existingTask?.notes && !existingTask.notesUpdatedAt && status === 'completed') {
    updates.notesUpdatedAt = now;
  }

  const validEmail = extra?.studentEmail?.trim().toLowerCase();
  if (validEmail) {
    updates.studentEmail = validEmail;
  }

  if (status === 'in_progress') {
    if (!existingTask?.startedAt || currentStatus === 'pending') {
      updates.startedAt = now;
    }
  }

  if (status === 'completed') {
    updates.completedAt = hasValidCompletedAt(existingTask) ? existingTask!.completedAt : now;
  }

  return updates;
};

export interface BuildStudentCompletionPatchOptions {
  student: Student;
  taskId: string;
  taskTitle: string;
  allTasks: Task[];
}

export interface StudentCompletionPatch {
  completedStages: string[];
  status: 'in_progress' | 'completed';
}

/**
 * Computes safe student updates upon task completion without mutating non-array completedStages.
 * Sets student.status = 'completed' only if the student has no other open tasks.
 */
export const buildStudentCompletionPatch = ({
  student,
  taskId,
  taskTitle,
  allTasks
}: BuildStudentCompletionPatchOptions): StudentCompletionPatch => {
  const existingStages = Array.isArray(student.completedStages) ? student.completedStages : [];
  const newCompletedStages = taskTitle && !existingStages.includes(taskTitle)
    ? [...existingStages, taskTitle]
    : existingStages;

  // Check if student still has any sibling open tasks (pending or in_progress)
  const hasOtherActiveTasks = allTasks.some(
    t => t.studentId === student.id &&
         t.id !== taskId &&
         isOpenTask(t)
  );

  return {
    completedStages: newCompletedStages,
    status: hasOtherActiveTasks ? 'in_progress' : 'completed'
  };
};

export interface ExecuteCompletionSideEffectsParams {
  db: Firestore;
  taskId: string;
  task: Task;
  student?: Student;
  preset?: TaskPreset;
  officer?: User;
  allTasks: Task[];
  language?: 'en' | 'ar';
  origin?: string;
  targetEmail?: string;
}

/**
 * Executes secondary side effects (student milestone record and outbound feedback email)
 * in completely decoupled, isolated try/catch blocks after primary task status has already
 * been successfully written to Firestore. Failures here log warnings and never throw or
 * roll back task.status = 'completed'.
 */
export const executeCompletionSideEffects = async ({
  db,
  taskId,
  task,
  student,
  preset,
  officer,
  allTasks,
  language = 'en',
  origin,
  targetEmail
}: ExecuteCompletionSideEffectsParams): Promise<{ studentUpdated: boolean; emailQueued: boolean }> => {
  let studentUpdated = false;
  let emailQueued = false;

  const taskTitle = resolveCompletionTaskTitle(task, preset, language);

  // 1. Update Student Milestone / Status (Decoupled)
  if (task.studentId && student) {
    try {
      const studentRef = doc(db, 'students', task.studentId);
      const studentPatch = buildStudentCompletionPatch({
        student,
        taskId,
        taskTitle,
        allTasks
      });
      await updateDoc(studentRef, sanitizeForFirestore(studentPatch) as any);
      studentUpdated = true;
    } catch (studentErr) {
      console.warn(`[Completion SideEffect] Could not update student ${task.studentId} milestone:`, studentErr);
    }
  }

  // 2. Dispatch Automated Feedback Email via 'mail' collection (Decoupled)
  const resolvedTargetEmail = (targetEmail?.trim().toLowerCase()) || task.studentEmail || student?.email;
  if (resolvedTargetEmail && !task.feedbackEmailSent) {
    try {
      const studentName = student?.fullName || 'Student';
      const officerName = officer?.name || 'Field Operations Officer';
      const completedDateStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const originUrl = (origin || import.meta.env.VITE_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
      const cleanPath = '/'; // the public feedback form is served from the site root (?view=feedback)
      const feedbackUrl = `${originUrl}${cleanPath}?view=feedback&taskId=${taskId}`;

      const emailPayload = getFeedbackEmailPayload({
        studentName,
        taskTitle,
        taskId,
        feedbackUrl,
        completedDateStr,
        officerName,
        origin: originUrl
      });

      const mailDocRef = doc(collection(db, 'mail'));
      await setDoc(mailDocRef, sanitizeForFirestore({
        to: [resolvedTargetEmail],
        taskId: taskId,
        studentName: studentName,
        taskTitle: taskTitle,
        feedbackUrl: feedbackUrl,
        studentEmail: resolvedTargetEmail,
        message: {
          subject: emailPayload.subject,
          text: emailPayload.text,
          html: emailPayload.html,
        },
        createdAt: new Date().toISOString()
      }));

      // Persist feedbackEmailSent flag on task as a separate isolated update
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, sanitizeForFirestore({
        feedbackEmailSent: true,
        feedbackEmailSentAt: new Date().toISOString()
      }));

      emailQueued = true;
    } catch (emailErr) {
      console.warn(`[Completion SideEffect] Could not queue feedback email for task ${taskId}:`, emailErr);
    }
  }

  return { studentUpdated, emailQueued };
};
