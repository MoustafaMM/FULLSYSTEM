export type Role = 'admin' | 'coordinator' | 'field_officer' | 'counselor' | 'counselor_manager' | 'accountant';

export type Language = 'en' | 'ar';

export type Theme = 'light' | 'dark';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Express Tracker role (admin, counselor, admission, logistics_coordinator, logistics_team, qc) */
  etRole?: string;
  username?: string;
  password?: string;
  avatar?: string;
  /**
   * Wallet balance in MYR.
   * Applies strictly to the 'field_officer' role.
   */
  walletBalance?: number;
  lastLocation?: {
    lat: number;
    lng: number;
    timestamp: string;
  };
  /** Registered FCM device tokens for mobile/desktop push notifications */
  fcmTokens?: string[];
  /** ISO-8601 timestamp of the user's most recent appearance/activity on the website */
  lastSeenAt?: string;
}

export type ArrivalCategory = 'Student' | 'Tourism';

export type AcademicProgram = 'Language' | 'Foundation' | 'Diploma' | 'Certificate' | 'Bachelor' | 'Master' | 'PhD';

export type ServicePackage = 'Free' | '300$' | '500$' | '300$(Free)';

export interface Student {
  id: string;
  fullName: string;
  passportNumber: string;
  nationality: string;
  studyIntake: string;
  arrivalCategory: ArrivalCategory;
  studentType?: ArrivalCategory;
  program: AcademicProgram;
  package: ServicePackage;
  servicePackage?: ServicePackage;
  university: string;
  contactInfo: string;
  email: string;
  arrivalDate: string;
  counselor: string;
  counselorId?: string;
  counselorRemarks?: string;
  assignedOfficerId?: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedStages: string[];
  flightDetails?: {
    airline: string;
    flightNumber: string;
    terminal?: string;
    date?: string;
    time?: string;
  };
  accommodationDetails?: {
    hotelName: string;
    roomType?: string;
    checkInDate?: string;
    checkOutDate?: string;
  };
}

export interface MediaItem {
  url: string;
  timestamp: string;
  location: string;
}

export interface SubTask {
  id: string;
  titleEn: string;
  titleAr: string;
  isCompleted: boolean;
  isSkipped?: boolean;
  completedAt?: string;
  media?: MediaItem[];
  requiresProof?: boolean;
}

export interface TaskFeedbackQuestionAnswer {
  questionId: string;
  question: string;
  questionAr?: string;
  answer: string | number | boolean;
}

export interface TaskFeedback {
  id?: string;
  taskId: string;
  studentEmail?: string;
  rating: number; // Overall 1-5
  satisfaction: 'very_satisfied' | 'satisfied' | 'neutral' | 'dissatisfied' | 'very_dissatisfied';
  subtaskRatings?: Record<string, { questionEn: string; questionAr?: string; score: number | string }>;
  comments?: string;
  answers?: TaskFeedbackQuestionAnswer[];
  dynamicAnswers?: Record<string, any>;
  submittedAt: string;
}

export interface Task {
  id: string;
  studentId?: string;
  isNonStudentTask?: boolean;
  nonStudentTitle?: string;
  nonStudentContact?: string;
  presetId?: string;
  customTitle?: string;
  customTitleAr?: string;
  assigneeId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  subTasks: SubTask[];
  notes?: string;
  notesUpdatedAt?: string;
  coordinatorNote1?: string;
  coordinatorNote2?: string;
  hotel?: string;
  flightNumber?: string;
  taskTime?: string;
  taskDate?: string;
  vehicleId?: string;
  studentCommunicated?: boolean;
  studentCommunicationMedia?: MediaItem[];
  studentEmail?: string;
  feedbackSubmitted?: boolean;
  feedback?: TaskFeedback;
  feedbackEmailSent?: boolean;
  feedbackEmailSentAt?: string;
}

export interface TaskRequest {
  id: string;
  counselorId: string;
  counselorName: string;
  studentId: string;
  presetId?: string;
  customTitle?: string;
  requestedDate?: string;
  requestedTime?: string;
  notes?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  rejectionReason?: string;
  assignedTaskId?: string;
  createdAt: string;
}

export interface PresetSubTask {
  titleEn: string;
  titleAr: string;
  requiresProof?: boolean;
}

export interface TaskPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  defaultSubTasks: PresetSubTask[];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  type:
    | 'task_assigned'
    | 'general'
    | 'low_balance'
    | 'maintenance_due'
    | 'task_requested'
    | 'counselor_task_assigned'
    | 'counselor_task_reminder'
    | 'counselor_task_comment';
  relatedTaskId?: string;
  relatedOfficerId?: string;
  relatedVehicleId?: string;
  relatedRequestId?: string;
  relatedCounselorTaskId?: string;
  maintenanceCycleKm?: number;
}

export type ExpenseCategory = 'Tolls' | 'Fuel' | 'SIM Card' | 'Medical Fees' | 'Parking' | 'Meals' | 'Hotel' | 'Other';

export interface Expense {
  id: string;
  userId: string;
  taskId?: string | null;
  amount: number;
  category: ExpenseCategory;
  vehicleId?: string | null;
  vehicleName?: string;
  vehiclePlateNumber?: string;
  notes?: string;
  receiptUrl: string;
  location?: string;
  timestamp: string;
  createdAt: string;
  isSettled?: boolean;
  settledAt?: string;
  settledBy?: string;
  settledByName?: string;
}

export interface TopUpRecord {
  id: string;
  userId: string;
  amount: number;
  source?: string;
  notes?: string;
  timestamp: string;
  createdAt: string;
  isSettled?: boolean;
  settledAt?: string;
  settledBy?: string;
  settledByName?: string;
}

export type VehicleStatus = 'active' | 'maintenance' | 'out_of_service';

export interface Vehicle {
  id: string;
  name: string;
  plateNumber: string;
  capacity?: number;
  color?: string;
  year?: string;
  status: VehicleStatus;
  assignedOfficerId?: string;
  currentOdometer?: number;
  lastOdometer?: number;
  mileage?: number;
  isCheckedOut?: boolean;
  insuranceExpiryDate?: string;
  lastMaintenanceDate?: string;
  lastMaintenanceKm?: number;
  nextMaintenanceDueKm?: number;
}

export interface VehicleLog {
  id: string;
  vehicleId: string;
  userId: string;
  date: string;
  startTime?: string;
  startKm?: string;
  dashboardPhotoUrl?: string;
  startDashboardPhoto?: string;
  startDashboardPhotoUrl?: string;
  startOdometerPhoto?: string;
  startFuelPhoto?: string;
  odometerPhotoUrl?: string;
  fuelPhotoUrl?: string;
  endTime?: string;
  endKm?: number;
  endDashboardPhoto?: string;
  endDashboardPhotoUrl?: string;
  endPhotoUrl?: string;
  endOdometerPhoto?: string;
  endFuelPhoto?: string;
  issueNotes?: string;
  issueMediaUrls?: string[];
  fuelReceipts?: {
    cost: number;
    liters?: number;
    photoUrl: string;
    timestamp: string;
  }[];
  checkInPhotos?: string[];
  notes?: string;
  checkInNotes?: string;
  checkOutNotes?: string;
}

export type ViewType =
  | 'dashboard'
  | 'students'
  | 'student_profile'
  | 'live_ops'
  | 'wallet'
  | 'wallet_history'
  | 'vehicles'
  | 'analytics'
  | 'staff_history'
  | 'live_map'
  | 'presets'
  | 'team'
  | 'feedbacks'
  | 'tasks'
  | 'field_tasks'
  | 'counselor_tasks'
  | 'overtime'
  | 'quality_control'
  | 'feedback';

export type CounselorTaskPriority = 'normal' | 'high' | 'urgent';

export type CounselorTaskCategory =
  | 'follow_up'
  | 'meeting'
  | 'admin'
  | 'training'
  | 'sales_leads'
  | 'notice'
  | 'other';

export type CounselorTaskMode = 'action' | 'notice';

export type CounselorTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface CounselorTaskAttachment {
  id: string;
  name: string;
  url: string;
  type: 'file' | 'image' | 'link';
  mimeType?: string;
  sizeBytes?: number;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface CounselorTaskSubTask {
  id: string;
  title: string;
}

export interface CounselorTaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  text: string;
  createdAt: string;
}

export interface CounselorTaskAcknowledgment {
  counselorId: string;
  counselorName: string;
  acknowledgedAt: string;
}

export interface CounselorTaskProgress {
  status: CounselorTaskStatus;
  startedAt?: string;
  completedAt?: string;
  completedLate?: boolean;
  checkedSubTaskIds?: string[];
  completionNote?: string;
  completionAttachments?: CounselorTaskAttachment[];
  updatedAt: string;
}

export interface CounselorTask {
  id: string;
  title: string;
  titleAr?: string;
  description?: string;
  category: CounselorTaskCategory;
  priority: CounselorTaskPriority;
  mode: CounselorTaskMode;
  isPinned?: boolean;
  targetMode: 'all' | 'specific';
  assignedCounselorIds: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  deadlineAt?: string;
  subTasks?: CounselorTaskSubTask[];
  attachments?: CounselorTaskAttachment[];
  acknowledgments: Record<string, CounselorTaskAcknowledgment>;
  progressByCounselor: Record<string, CounselorTaskProgress>;
  comments?: CounselorTaskComment[];
  lastNudgedAt?: string;
}

export interface OvertimeLog {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'task' | 'shift' | 'manual';
  referenceId?: string;
  referenceTitle?: string;
  regularMinutes?: number;
  overtimeMinutes: number;
  dayType?: 'weekday' | 'weekend';
  notes?: string;
  createdBy?: string;
  createdAt?: string;
}

export type QCGrade = 'green' | 'yellow' | 'red';

export type QCErrorTagId =
  | 'late_start'
  | 'excessive_duration'
  | 'execution_delay'
  | 'invalid_photos'
  | 'late_student_contact'
  | 'poor_communication'
  | 'missing_info'
  | 'other';

export interface QCEvidenceMedia {
  id: string;
  url: string;
  name?: string;
  caption?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface QCTaskReview {
  id: string;
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
  urgentCallResolvedAt?: string;
  urgentCallResolvedBy?: string;
  reviewedBy: string;
  reviewedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface QCDailyReport {
  id: string;
  date: string;
  dailySummary: string;
  generalAdvice: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface QCOfficerEvaluation {
  id: string;
  officerId: string;
  rating: number;
  notes: string;
  strengths?: string;
  improvements?: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}
