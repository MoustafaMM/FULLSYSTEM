import { Task, SubTask, MediaItem } from '../types';

export interface DisplayStep {
  id: string;
  titleEn: string;
  titleAr: string;
  isCompleted: boolean;
  isSkipped?: boolean;
  completedAt?: string;
  requiresProof?: boolean;
  media: MediaItem[];
  isCommunicationStep: boolean;
}

export interface TaskProofItem {
  url: string;
  caption: string;
  timestamp?: string;
  location?: string;
}

/**
 * Checks if a subtask is the student/beneficiary communication milestone.
 */
export const isCommunicationSubTask = (st?: { titleEn?: string; titleAr?: string } | null): boolean => {
  if (!st) return false;
  const en = (st.titleEn || '').toLowerCase();
  const ar = st.titleAr || '';
  return en.includes('communicat') || ar.includes('تواصل');
};

/**
 * Normalizes all steps of a task, ensuring student communication is always represented,
 * synced with root task status, and all media/proofs are accurately populated.
 */
export const getTaskDisplaySteps = (task: Task): DisplayStep[] => {
  const steps: DisplayStep[] = [];
  const rawSubTasks: SubTask[] = task.subTasks || [];
  const commRegex = /communicat|تواصل/i;
  const hasExistingCommSubtask = rawSubTasks.some(
    st => commRegex.test(st.titleEn || '') || commRegex.test(st.titleAr || '')
  );

  // If this is a student task and no communication subtask exists in SOP, synthesize it
  if (!task.isNonStudentTask && !hasExistingCommSubtask) {
    steps.push({
      id: `comm-synth-${task.id}`,
      titleEn: 'Communicate with Student',
      titleAr: 'التواصل مع الطالب',
      isCompleted: !!task.studentCommunicated,
      isSkipped: false,
      completedAt: task.studentCommunicationMedia?.[0]?.timestamp || (task.studentCommunicated ? task.startedAt : undefined),
      requiresProof: true,
      media: task.studentCommunicationMedia || [],
      isCommunicationStep: true
    });
  }

  // Map existing subtasks
  rawSubTasks.forEach(st => {
    const isComm = commRegex.test(st.titleEn || '') || commRegex.test(st.titleAr || '');
    const rawMedia = [...(st.media || []), ...((st as any).proofMedia || [])];

    if (isComm) {
      // Merge with root task communication status and media
      const mergedMedia: MediaItem[] = [
        ...rawMedia,
        ...(task.studentCommunicationMedia || [])
      ].filter((m, idx, arr) => arr.findIndex(x => x.url === m.url) === idx);

      steps.push({
        id: st.id,
        titleEn: st.titleEn,
        titleAr: st.titleAr,
        isCompleted: st.isCompleted || !!task.studentCommunicated,
        isSkipped: st.isSkipped,
        completedAt: st.completedAt || (task.studentCommunicated ? (task.studentCommunicationMedia?.[0]?.timestamp || task.startedAt) : undefined),
        requiresProof: st.requiresProof !== undefined ? st.requiresProof : true,
        media: mergedMedia,
        isCommunicationStep: true
      });
    } else {
      steps.push({
        id: st.id,
        titleEn: st.titleEn,
        titleAr: st.titleAr,
        isCompleted: !!st.isCompleted,
        isSkipped: st.isSkipped,
        completedAt: st.completedAt,
        requiresProof: st.requiresProof,
        media: rawMedia,
        isCommunicationStep: false
      });
    }
  });

  return steps;
};

/**
 * Collects all verification and communication proofs attached to a task.
 */
export const getTaskAllProofs = (task: Task): TaskProofItem[] => {
  const proofs: TaskProofItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Task root communication proofs
  if (task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0) {
    task.studentCommunicationMedia.forEach(m => {
      if (m.url && !seenUrls.has(m.url)) {
        seenUrls.add(m.url);
        proofs.push({
          url: m.url,
          caption: 'Student Communication Proof',
          timestamp: m.timestamp,
          location: m.location
        });
      }
    });
  }

  // 2. Subtask proofs
  (task.subTasks || []).forEach(st => {
    const list = [...(st.media || []), ...((st as any).proofMedia || [])];
    list.forEach(m => {
      if (m.url && !seenUrls.has(m.url)) {
        seenUrls.add(m.url);
        proofs.push({
          url: m.url,
          caption: st.titleEn || 'Subtask Proof',
          timestamp: m.timestamp,
          location: m.location
        });
      }
    });
  });

  return proofs;
};

/**
 * Computes step progress metrics for a task.
 */
export const getTaskStepMetrics = (task: Task) => {
  const steps = getTaskDisplaySteps(task);
  const total = steps.length;
  const completed = steps.filter(s => s.isCompleted || s.isSkipped).length;
  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return {
    steps,
    total,
    completed,
    percentage
  };
};
