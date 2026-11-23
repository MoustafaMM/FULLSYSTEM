// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Task, Student, TaskPreset, TaskFeedback, TaskFeedbackQuestionAnswer } from '../types';
import PioneerLogo from '../components/PioneerLogo';
import ThemeToggle from '../components/ThemeToggle';
import { Star, CheckCircle2, AlertCircle, Heart, Globe, MessageSquare, ThumbsUp, Send, Check, X, Sparkles, HelpCircle, Layers } from 'lucide-react';
import { cn } from '../components/layout/Layout';
import toast from 'react-hot-toast';
import { isCommunicationSubTask } from '../utils/taskSteps';
import { getTaskDisplayTitle, getTaskSubjectName, normalizeLoadedTask, normalizeTaskStatus } from '../utils/taskClassification';

export interface MilestoneEvaluationQuestion {
  id: string;
  category: 'accommodation' | 'reception' | 'medical' | 'university' | 'custom' | 'general';
  titleEn: string;
  titleAr: string;
  questionEn: string;
  questionAr: string;
  type: '3_pills' | 'rating' | 'yes_partially_no';
}

/**
 * Dynamically resolves student-facing CSAT questions tailored to the preset
 * and its specific subtasks, speaking directly to the student in second person ("you").
 */
export const getServiceQuestions = (preset?: TaskPreset | null, task?: Task | null): MilestoneEvaluationQuestion[] => {
  const presetId = preset?.id || task?.presetId || '';
  const textToScan = `${preset?.nameEn || ''} ${preset?.nameAr || ''} ${task?.customTitle || ''} ${task?.customTitleAr || ''}`.toLowerCase();

  // 1. Accommodation Check-in / Hotel Check-in / Housing
  if (
    presetId === 'preset-4' ||
    presetId === 'preset-5' ||
    textToScan.includes('hotel') ||
    textToScan.includes('check-in') ||
    textToScan.includes('accommodation') ||
    textToScan.includes('viewing') ||
    textToScan.includes('housing') ||
    textToScan.includes('تسكين') ||
    textToScan.includes('سكن') ||
    textToScan.includes('فندق') ||
    textToScan.includes('معاينة')
  ) {
    return [
      {
        id: 'q_acc_handover',
        category: 'accommodation',
        titleEn: 'Room Handover & Keys',
        titleAr: 'تسليم الغرفة والمفاتيح',
        questionEn: 'How satisfied are you with the room handover and keys check?',
        questionAr: 'ما مدى رضاك عن تسليم الغرفة واستلام المفاتيح؟',
        type: '3_pills',
      },
      {
        id: 'q_acc_condition',
        category: 'accommodation',
        titleEn: 'Property Condition Clarity',
        titleAr: 'وضوح حالة العقار',
        questionEn: 'Was the property condition and facilities clearly explained to you?',
        questionAr: 'هل تم توضيح حالة العقار ومرافقه لك بشكل وافٍ؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_acc_deposit',
        category: 'accommodation',
        titleEn: 'Contract & Deposit Support',
        titleAr: 'دعم العقد والوديعة',
        questionEn: 'Did our officer support you during the deposit and contract check?',
        questionAr: 'هل قدم لك الموظف الدعم الكافي أثناء مراجعة العقد والوديعة؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_acc_settling',
        category: 'accommodation',
        titleEn: 'Settling-in Experience',
        titleAr: 'سلاسة الاستقرار',
        questionEn: 'How would you rate your overall settling-in experience?',
        questionAr: 'كيف تقيم سهولة وسلاسة عملية استلام السكن والاستقرار بشكل عام؟',
        type: 'rating',
      },
    ];
  }

  // 2. Airport Pickups / Reception
  if (
    presetId === 'preset-1' || 
    textToScan.includes('reception') || 
    textToScan.includes('airport') || 
    textToScan.includes('pickup') ||
    textToScan.includes('استقبال') || 
    textToScan.includes('مطار')
  ) {
    return [
      {
        id: 'q_air_punctuality',
        category: 'reception',
        titleEn: 'Arrival Punctuality',
        titleAr: 'الالتزام بموعد الوصول',
        questionEn: "How was our officer's punctuality upon your flight arrival?",
        questionAr: 'كيف كان التزام الموظف بالمواعيد فور وصول رحلتك إلى المطار؟',
        type: '3_pills',
      },
      {
        id: 'q_air_baggage',
        category: 'reception',
        titleEn: 'Baggage & Welcome Kit',
        titleAr: 'الأمتعة وحقيبة الاستقبال',
        questionEn: 'Were your baggage and welcome kit handled with care and attention?',
        questionAr: 'هل تم التعامل مع أمتعتك وحقيبة الاستقبال بكل عناية واهتمام؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_air_connectivity',
        category: 'reception',
        titleEn: 'SIM Card & Connectivity',
        titleAr: 'شريحة الاتصال والإنترنت',
        questionEn: 'Did you receive proper assistance setting up your local SIM card and connectivity?',
        questionAr: 'هل تلقيت المساعدة المناسبة لتفعيل شريحة الاتصال والإنترنت المحلي؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_air_comfort',
        category: 'reception',
        titleEn: 'Transfer Comfort',
        titleAr: 'راحة التوصيل',
        questionEn: 'How comfortable and smooth was your airport transfer to your accommodation?',
        questionAr: 'ما مدى راحة وسلاسة التوصيل من المطار إلى مقر إقامتك؟',
        type: 'rating',
      },
    ];
  }

  // 3. Medical Examination / Clinic Appointment / Visa
  if (
    presetId === 'preset-2' || 
    textToScan.includes('medical') || 
    textToScan.includes('clinic') || 
    textToScan.includes('hospital') ||
    textToScan.includes('فحص') || 
    textToScan.includes('طبي') ||
    textToScan.includes('عيادة')
  ) {
    return [
      {
        id: 'q_med_guidance',
        category: 'medical',
        titleEn: 'Clinic Steps Guidance',
        titleAr: 'التوجيه والإرشاد الطبي',
        questionEn: 'Did the officer guide you clearly through each clinic and screening step?',
        questionAr: 'هل أرشدك الموظف بوضوح خلال كل خطوة في المركز الطبي والفحوصات؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_med_waiting',
        category: 'medical',
        titleEn: 'Wait Time & Efficiency',
        titleAr: 'كفاءة وقت الانتظار',
        questionEn: 'Was your waiting time handled efficiently by our officer?',
        questionAr: 'هل تمت إدارة وقت الانتظار وسير الإجراءات بكفاءة واهتمام؟',
        type: '3_pills',
      },
      {
        id: 'q_med_timelines',
        category: 'medical',
        titleEn: 'Results & Next Steps Clarity',
        titleAr: 'وضوح مواعيد النتائج',
        questionEn: 'Were your medical result timelines and next steps clearly explained to you?',
        questionAr: 'هل تم توضيح مواعيد استلام النتائج والخطوات التالية لك بكل وضوح؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_med_care',
        category: 'medical',
        titleEn: 'Care & Professionalism',
        titleAr: 'مستوى الرعاية الطبية',
        questionEn: 'How would you rate the overall care and support during your clinic appointment?',
        questionAr: 'كيف تقيم مستوى الاهتمام والرعاية المقدمة لك طوال موعد الفحص الطبي؟',
        type: 'rating',
      },
    ];
  }

  // 4. University Registration / Campus Onboarding
  if (
    presetId === 'preset-3' || 
    textToScan.includes('university') || 
    textToScan.includes('registration') || 
    textToScan.includes('campus') ||
    textToScan.includes('تسجيل') || 
    textToScan.includes('جامع')
  ) {
    return [
      {
        id: 'q_uni_admission',
        category: 'university',
        titleEn: 'Admission & Counters Support',
        titleAr: 'مرافقة مكاتب القبول',
        questionEn: 'Did our officer assist you through the university admission counters and payment?',
        questionAr: 'هل ساعدك ممثلنا في مكاتب القبول الجامعي والدفع وتسليم الأوراق؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_uni_documents',
        category: 'university',
        titleEn: 'Document & Schedule Handover',
        titleAr: 'استلام الوثائق والجدول',
        questionEn: 'Were your holding letter, schedule, and orientation info handed over clearly to you?',
        questionAr: 'هل استلمت الوثائق الهامة (كرسالة تسليم الجواز والجدول الدراسي) بكل وضوح؟',
        type: 'yes_partially_no',
      },
      {
        id: 'q_uni_efficiency',
        category: 'university',
        titleEn: 'Registration Speed & Process',
        titleAr: 'كفاءة وسرعة التسجيل',
        questionEn: 'How satisfied are you with the campus onboarding and registration speed?',
        questionAr: 'ما مدى رضاك عن سرعة وسلاسة إجراءات التسجيل والتوجيه الجامعي؟',
        type: '3_pills',
      },
      {
        id: 'q_uni_rating',
        category: 'university',
        titleEn: 'Overall Campus Support',
        titleAr: 'التقييم الجامعي العام',
        questionEn: 'How would you rate the overall guidance provided to you on campus?',
        questionAr: 'كيف تقيم مستوى التوجيه والمساعدة التي تلقيتها داخل الحرم الجامعي؟',
        type: 'rating',
      },
    ];
  }

  // 5. Custom / Other Tasks: Dynamically resolve from task execution subtasks checklist!
  if (task?.subTasks && task.subTasks.length > 0) {
    const relevantSubtasks = task.subTasks
      .filter((st) => !isCommunicationSubTask(st))
      .slice(0, 4);

    if (relevantSubtasks.length > 0) {
      return relevantSubtasks.map((st, index) => {
        const isRating = index === relevantSubtasks.length - 1;
        return {
          id: `q_subtask_${st.id}`,
          category: 'custom',
          titleEn: st.titleEn,
          titleAr: st.titleAr || st.titleEn,
          questionEn: `Did our officer assist you with "${st.titleEn}" effectively?`,
          questionAr: `هل ساعدك الموظف الميداني في إنجاز خطوة "${st.titleAr || st.titleEn}" بكل كفاءة؟`,
          type: isRating ? 'rating' : 'yes_partially_no',
        };
      });
    }
  }

  // 6. Generic Fallback (Second-person phrasing)
  return [
    {
      id: 'q_gen_timeliness',
      category: 'general',
      titleEn: 'Timeliness & Professionalism',
      titleAr: 'الالتزام بالوقت والاحترافية',
      questionEn: 'Was the service completed in a timely, respectful, and professional manner for you?',
      questionAr: 'هل تم إنجاز الخدمة في الوقت المحدد وبكل احترام واحترافية لك؟',
      type: 'yes_partially_no',
    },
    {
      id: 'q_gen_communication',
      category: 'general',
      titleEn: 'Clear Communication',
      titleAr: 'التواصل والرد على الاستفسارات',
      questionEn: 'Did our field officer keep you well informed and address all your questions?',
      questionAr: 'هل كان الموظف الميداني على تواصل مستمر معك وأجاب عن كافة تساؤلاتك؟',
      type: '3_pills',
    },
    {
      id: 'q_gen_care',
      category: 'general',
      titleEn: 'Care & Execution Quality',
      titleAr: 'جودة الرعاية والتنفيذ',
      questionEn: 'How satisfied are you with the overall care and execution provided to you?',
      questionAr: 'ما مدى رضاك عن مستوى الاهتمام وجودة التنفيذ المقدمة لك؟',
      type: 'rating',
    },
  ];
};

interface FeedbackFormProps {
  taskId: string;
}

export default function FeedbackForm({ taskId }: FeedbackFormProps) {
  const { language, setLanguage, t, submitTaskFeedback } = useAppContext();
  const [task, setTask] = useState<Task | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [preset, setPreset] = useState<TaskPreset | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Feedback Form State
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [satisfaction, setSatisfaction] = useState<TaskFeedback['satisfaction']>('very_satisfied');
  const [comments, setComments] = useState('');
  
  // Granular milestone answers map
  const [subAnswers, setSubAnswers] = useState<Record<string, string | number>>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  const isRTL = language === 'ar';

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    let unsubStudent: (() => void) | undefined;
    let unsubPreset: (() => void) | undefined;

    const unsubTask = onSnapshot(doc(db, 'tasks', taskId), (docSnap) => {
      if (docSnap.exists()) {
        const taskData = normalizeLoadedTask({ id: docSnap.id, ...(docSnap.data() as Partial<Task>) });
        setTask(taskData);

        if (taskData.studentId) {
          if (unsubStudent) unsubStudent();
          unsubStudent = onSnapshot(doc(db, 'students', taskData.studentId), (sSnap) => {
            if (sSnap.exists()) {
              setStudent({ id: sSnap.id, ...sSnap.data() } as Student);
            }
          }, (err) => console.error('Student snapshot error:', err));
        }

        if (taskData.presetId && taskData.presetId !== 'custom') {
          if (unsubPreset) unsubPreset();
          unsubPreset = onSnapshot(doc(db, 'presets', taskData.presetId), (pSnap) => {
            if (pSnap.exists()) {
              setPreset({ id: pSnap.id, ...pSnap.data() } as TaskPreset);
            }
          }, (err) => console.error('Preset snapshot error:', err));
        }
      } else {
        setTask(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Task snapshot error:', err);
      setLoading(false);
    });

    return () => {
      unsubTask();
      if (unsubStudent) unsubStudent();
      if (unsubPreset) unsubPreset();
    };
  }, [taskId]);

  // Dynamically resolve service & subtask specific questions
  const milestoneQuestions = useMemo(() => {
    return getServiceQuestions(preset, task);
  }, [preset, task]);

  // Set default initial answers for milestone questions
  useEffect(() => {
    if (milestoneQuestions.length > 0) {
      setSubAnswers((prev) => {
        const initial = { ...prev };
        milestoneQuestions.forEach((q) => {
          if (initial[q.id] === undefined) {
            if (q.type === 'rating') {
              initial[q.id] = 5;
            } else if (q.type === '3_pills') {
              initial[q.id] = 'Good';
            } else {
              initial[q.id] = 'Yes';
            }
          }
        });
        return initial;
      });
    }
  }, [milestoneQuestions]);

  const handleSubAnswerChange = (questionId: string, value: string | number) => {
    setSubAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    if (rating < 1) {
      toast.error(language === 'ar' ? 'يرجى تحديد تقييم بالنجوم' : 'Please select a star rating');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Build subtaskRatings Record as specified in TaskFeedback schema
      const subtaskRatingsRecord: Record<string, { questionEn: string; questionAr?: string; score: number | string }> = {};
      const structuredAnswers: TaskFeedbackQuestionAnswer[] = [];
      const dynamicAnswersMap: Record<string, any> = {};

      milestoneQuestions.forEach((q) => {
        const val = subAnswers[q.id] ?? (q.type === 'rating' ? 5 : q.type === '3_pills' ? 'Good' : 'Yes');
        
        subtaskRatingsRecord[q.id] = {
          questionEn: q.questionEn,
          questionAr: q.questionAr,
          score: val,
        };

        structuredAnswers.push({
          questionId: q.id,
          question: q.questionEn,
          questionAr: q.questionAr,
          answer: val,
        });

        dynamicAnswersMap[q.id] = val;
      });

      const submissionEmail = task.studentEmail || student?.email || student?.contactInfo || 'anonymous';

      // 2. Atomically submit to /feedback/{id} and update /tasks/{taskId}
      await submitTaskFeedback(task.id, {
        taskId: task.id,
        studentEmail: submissionEmail,
        rating,
        satisfaction,
        subtaskRatings: subtaskRatingsRecord,
        comments: comments.trim() || undefined,
        answers: structuredAnswers,
        dynamicAnswers: dynamicAnswersMap,
      });

      setIsSubmittedSuccess(true);
      toast.success(t('feedbackSuccess') || 'Feedback submitted successfully!');
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      toast.error(err.message || 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const satisfactionOptions: { id: TaskFeedback['satisfaction']; labelEn: string; labelAr: string; emoji: string }[] = [
    { id: 'very_satisfied', labelEn: 'Very Satisfied', labelAr: 'راضٍ جداً', emoji: '😍' },
    { id: 'satisfied', labelEn: 'Satisfied', labelAr: 'راضٍ', emoji: '😊' },
    { id: 'neutral', labelEn: 'Neutral', labelAr: 'محايد', emoji: '😐' },
    { id: 'dissatisfied', labelEn: 'Dissatisfied', labelAr: 'غير راضٍ', emoji: '🙁' },
    { id: 'very_dissatisfied', labelEn: 'Very Dissatisfied', labelAr: 'غير راضٍ جداً', emoji: '😞' },
  ];

  const ratingLabelsEn: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  };

  const ratingLabelsAr: Record<number, string> = {
    1: 'ضعيف',
    2: 'مقبول',
    3: 'جيد',
    4: 'جيد جداً',
    5: 'ممتاز',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-red-600 rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading CSAT portal...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-900/60">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {language === 'ar' ? 'الخدمة غير موجودة' : 'Service Not Found'}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            {language === 'ar' 
              ? 'الرابط الذي اتبعته غير صالح أو أن المهمة لم تعد متوفرة.'
              : 'The link you followed is invalid or the requested task no longer exists.'}
          </p>
        </div>
      </div>
    );
  }

  // Confirmation view blocking re-submissions
  if (isSubmittedSuccess || task.feedbackSubmitted) {
    const existingFeedback = task.feedback;
    const subtaskMap: Record<string, { questionEn: string; questionAr?: string; score: number | string }> = existingFeedback?.subtaskRatings || {};
    const answeredList = existingFeedback?.answers || [];

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 py-12 text-slate-900 dark:text-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-xl w-full bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl dark:shadow-black/60 border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-green-50 shadow-inner">
            <CheckCircle2 size={42} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
            {t('thankYouFeedback') || 'Thank You for Your Feedback!'}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 leading-relaxed">
            {language === 'ar'
              ? 'تم استلام تقييمك بنجاح ومشاركته مع فريق العمليات لتحسين مستوى الخدمة.'
              : 'Your feedback has been successfully submitted and forwarded to our operations team.'}
          </p>

          {existingFeedback && (
            <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-left mb-6 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
              {/* Overall Score */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t('feedbackRating') || 'Overall Rating'}
                </span>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        className={star <= existingFeedback.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-extrabold text-slate-800 ml-1">
                    {existingFeedback.rating} / 5
                  </span>
                </div>
              </div>

              {/* Satisfaction Pill */}
              {existingFeedback.satisfaction && (
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200/70">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {t('feedbackSatisfaction') || 'Sentiment'}
                  </span>
                  <span className="font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full capitalize">
                    {existingFeedback.satisfaction.replace('_', ' ')}
                  </span>
                </div>
              )}

              {/* Service Milestones Breakdown Display */}
              <div className="space-y-2.5 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Layers size={13} className="text-red-600" />
                  <span>{language === 'ar' ? 'تفاصيل تقييم مراحل الخدمة:' : 'Service Milestones Breakdown:'}</span>
                </span>

                <div className="space-y-2">
                  {Object.keys(subtaskMap).length > 0 ? (
                    Object.entries(subtaskMap).map(([id, item]) => {
                      const displayQuestion = language === 'ar' && item.questionAr ? item.questionAr : item.questionEn;
                      const score = item.score;
                      return (
                        <div key={id} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center gap-3">
                          <span className="text-slate-700 dark:text-slate-200 font-medium leading-snug">
                            {displayQuestion}
                          </span>
                          <span className="shrink-0 font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                            {typeof score === 'number'
                              ? `${score} ★`
                              : score === 'Good' || score === 'Yes'
                              ? (language === 'ar' ? 'ممتاز 👍' : 'Good 👍')
                              : score === 'Acceptable' || score === 'Partially'
                              ? (language === 'ar' ? 'مقبول 😐' : 'Acceptable 😐')
                              : (language === 'ar' ? 'ضعيف 👎' : 'Poor 👎')}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    answeredList.map((ans, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs flex justify-between items-center gap-3">
                        <span className="text-slate-700 dark:text-slate-200 font-medium leading-snug">
                          {language === 'ar' && ans.questionAr ? ans.questionAr : ans.question}
                        </span>
                        <span className="shrink-0 font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-900">
                          {typeof ans.answer === 'number' ? `${ans.answer} ★` : String(ans.answer)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Comments */}
              {existingFeedback.comments && (
                <div className="pt-2 border-t border-slate-200/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    {t('feedbackComments') || 'Student Comments'}
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed">
                    "{existingFeedback.comments}"
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center items-center gap-1.5 text-xs text-slate-400">
            <Heart size={14} className="text-red-500 fill-red-500" />
            <span>Pioneer Education Services &bull; Student CSAT Portal</span>
          </div>
        </div>
      </div>
    );
  }

  // Non-Completed Task Guard View (Strict separation: Cancelled / Pending / In Progress)
  const effectiveStatus = normalizeTaskStatus(task);
  if (effectiveStatus !== 'completed') {
    const isCancelled = effectiveStatus === 'cancelled';
    const isPending = effectiveStatus === 'pending';

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 text-slate-900 dark:text-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl dark:shadow-black/60 border border-slate-100 dark:border-slate-800 text-center">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border",
            isCancelled
              ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60"
              : isPending
              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60"
              : "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60"
          )}>
            {isCancelled ? <X size={32} /> : <AlertCircle size={32} />}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {isCancelled
              ? (language === 'ar' ? 'تم إلغاء هذه المهمة' : 'Service Cancelled')
              : isPending
              ? (language === 'ar' ? 'الخدمة في انتظار البدء' : 'Service Pending Start')
              : (language === 'ar' ? 'الخدمة قيد التنفيذ' : 'Service In Progress')}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
            {t('feedbackNotAvailable') || 'This feedback form is not available for evaluation.'}
          </p>
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 leading-relaxed">
            {isCancelled
              ? (language === 'ar'
                  ? 'تم إلغاء هذه الخدمة من قبل فريق التنسيق ولا تتطلب تقييماً.'
                  : 'This scheduled service was cancelled and is closed for customer feedback.')
              : isPending
              ? (language === 'ar'
                  ? 'هذه الخدمة مجدولة ولم تبدأ بعد. سيفتح نموذج التقييم فور بدء وتنفيذ واكتمال الخدمة.'
                  : 'This task is queued and has not started yet. Feedback unlocks automatically once execution begins and completes.')
              : (language === 'ar'
                  ? 'سيتم إتاحة نموذج التقييم فور اكتمال الخدمة من قبل فريق العمليات الميداني.'
                  : 'The feedback form will unlock automatically once our field team marks this task as completed.')}
          </div>
        </div>
      </div>
    );
  }

  const activeStarRating = hoveredRating !== null ? hoveredRating : rating;
  const currentServiceTitle = getTaskDisplayTitle(task, preset ? [preset] : [], language);
  const currentSubjectName = task.isNonStudentTask
    ? getTaskSubjectName(task, student ? [student] : [], language)
    : (student?.fullName || '');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6 transition-colors" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-xl mx-auto">
        {/* Top Header Bar with Theme Toggle, Language Switcher & Pioneer Brand */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-xl shadow-xs flex items-center justify-center border border-slate-200 dark:border-slate-800 overflow-hidden">
              <PioneerLogo variant="mark" className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">Pioneer</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Logistics & Arrival Services</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition-colors cursor-pointer"
            >
              <Globe size={14} className="text-slate-500 dark:text-slate-400" />
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>
          </div>
        </div>

        {/* Main CSAT Portal Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/70 dark:shadow-black/60 border border-slate-100 dark:border-slate-800 overflow-hidden">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 text-white p-6 sm:p-7 text-center relative">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-600 text-white mb-3 shadow-lg ring-4 ring-white/10">
              <ThumbsUp size={24} />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {language === 'ar' ? 'شاركنا تقييمك لتجربتك' : 'Share Your Service Experience'}
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
              {language === 'ar'
                ? 'رأيك يساعدنا على الارتقاء بمستوى الدعم والرعاية المقدمة لك.'
                : 'Your feedback directly helps us ensure the highest standards of student support.'}
            </p>

            {/* Service & Student / Beneficiary Details Pill */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
              <span className="bg-slate-800/90 px-3 py-1 rounded-full font-bold text-red-300 border border-slate-700">
                {currentServiceTitle}
              </span>
              {currentSubjectName && (
                <span className="text-slate-400">
                  {task.isNonStudentTask
                    ? (language === 'ar' ? 'المستفيد:' : 'Beneficiary:')
                    : (language === 'ar' ? 'الطالب:' : 'Student:')}{' '}
                  <strong className="text-white">{currentSubjectName}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-7">
            {/* 1. Overall 1-5 Star Rating Picker */}
            <div className="text-center space-y-2">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('feedbackRating') || 'Overall Service Rating'}
              </label>
              
              <div className="flex justify-center items-center gap-2 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                    className="p-1 hover:scale-125 transition-transform focus:outline-none cursor-pointer"
                    aria-label={`${star} Stars`}
                  >
                    <Star
                      size={36}
                      className={cn(
                        "transition-colors",
                        star <= activeStarRating
                          ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                          : "text-slate-200 dark:text-slate-700 fill-slate-50 dark:fill-slate-800"
                      )}
                    />
                  </button>
                ))}
              </div>

              <div className="text-sm font-bold text-amber-600 h-5">
                {language === 'ar' ? ratingLabelsAr[activeStarRating] : ratingLabelsEn[activeStarRating]}
              </div>
            </div>

            {/* 2. Overall Sentiment Pills */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 text-center sm:text-start">
                {t('feedbackSatisfaction') || 'Overall Satisfaction Level'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {satisfactionOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setSatisfaction(opt.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-2xl border text-sm font-semibold transition-all text-start cursor-pointer",
                      satisfaction === opt.id
                        ? "bg-red-50 dark:bg-red-950/70 border-red-500 dark:border-red-600 text-red-950 dark:text-red-100 ring-2 ring-red-500/20 shadow-xs"
                        : "bg-slate-50/70 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="flex-1">{language === 'ar' ? opt.labelAr : opt.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. SERVICE MILESTONES BREAKDOWN (Targeted Second-Person Sub-Questions) */}
            {milestoneQuestions.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-100 text-red-600 rounded-xl">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {language === 'ar' ? 'تقييم مراحل الخدمة التفصيلية' : 'Service Milestones Breakdown'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {language === 'ar' 
                        ? `أسئلة موجهة لك بخصوص خطوات تنفيذ: ${currentServiceTitle}` 
                        : `Targeted evaluation for ${currentServiceTitle} milestones`}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {milestoneQuestions.map((q, idx) => {
                    const currentAnswer = subAnswers[q.id];
                    const questionText = language === 'ar' ? q.questionAr : q.questionEn;

                    return (
                      <div key={q.id} className="p-4 bg-slate-50/90 dark:bg-slate-950/70 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-2xs">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">
                            {questionText}
                          </span>
                        </div>

                        {/* Rating Control 1: Quick 3-point Pills (Good / Acceptable / Poor) */}
                        {q.type === '3_pills' && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {[
                              { id: 'Good', labelEn: 'Good', labelAr: 'ممتاز', emoji: '😊', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                              { id: 'Acceptable', labelEn: 'Acceptable', labelAr: 'مقبول', emoji: '😐', activeClass: 'bg-amber-600 text-white border-amber-600' },
                              { id: 'Poor', labelEn: 'Poor', labelAr: 'ضعيف', emoji: '🙁', activeClass: 'bg-red-600 text-white border-red-600' },
                            ].map((btn) => (
                              <button
                                key={btn.id}
                                type="button"
                                onClick={() => handleSubAnswerChange(q.id, btn.id)}
                                className={cn(
                                  "py-2 px-2 rounded-xl border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer",
                                  currentAnswer === btn.id
                                    ? `${btn.activeClass} shadow-xs scale-[1.02]`
                                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100/80 dark:hover:bg-slate-800"
                                )}
                              >
                                <span>{btn.emoji}</span>
                                <span>{language === 'ar' ? btn.labelAr : btn.labelEn}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Rating Control 2: Binary / Partial Satisfaction Pills (Yes / Partially / No) */}
                        {q.type === 'yes_partially_no' && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {[
                              { id: 'Yes', labelEn: 'Yes', labelAr: 'نعم', emoji: '👍', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                              { id: 'Partially', labelEn: 'Partially', labelAr: 'جزئياً', emoji: '🤏', activeClass: 'bg-amber-600 text-white border-amber-600' },
                              { id: 'No', labelEn: 'No', labelAr: 'لا', emoji: '👎', activeClass: 'bg-red-600 text-white border-red-600' },
                            ].map((btn) => (
                              <button
                                key={btn.id}
                                type="button"
                                onClick={() => handleSubAnswerChange(q.id, btn.id)}
                                className={cn(
                                  "py-2 px-2 rounded-xl border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer",
                                  currentAnswer === btn.id
                                    ? `${btn.activeClass} shadow-xs scale-[1.02]`
                                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100/80 dark:hover:bg-slate-800"
                                )}
                              >
                                <span>{btn.emoji}</span>
                                <span>{language === 'ar' ? btn.labelAr : btn.labelEn}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Rating Control 3: 5-Star Metric Picker */}
                        {q.type === 'rating' && (
                          <div className="flex items-center justify-between gap-2 pt-1 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  type="button"
                                  key={star}
                                  onClick={() => handleSubAnswerChange(q.id, star)}
                                  className="p-1 hover:scale-115 transition-transform cursor-pointer"
                                  aria-label={`${star} stars`}
                                >
                                  <Star
                                    size={22}
                                    className={cn(
                                      star <= (Number(currentAnswer) || 5)
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-slate-200 fill-slate-100"
                                    )}
                                  />
                                </button>
                              ))}
                            </div>
                            <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-lg">
                              {Number(currentAnswer) || 5} / 5
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Student Comments & Remarks */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare size={15} className="text-slate-400" />
                <span>{t('feedbackComments') || 'Additional Comments or Notes'}</span>
                <span className="text-[11px] font-normal text-slate-400">({language === 'ar' ? 'اختياري' : 'Optional'})</span>
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'اكتب أي ملاحظات أو تفاصيل إضافية عن تجربتك أو مقترحات للتحسين...'
                    : 'Tell us more about your experience or anything our team can improve...'
                }
                rows={3}
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20 transition-all resize-none"
              />
            </div>

            {/* 5. Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-red-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{language === 'ar' ? 'جاري إرسال التقييم...' : 'Submitting Feedback...'}</span>
                </>
              ) : (
                <>
                  <Send size={18} className={cn(isRTL ? "rotate-180" : "")} />
                  <span>{language === 'ar' ? 'إرسال التقييم' : 'Submit Service Feedback'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} Pioneer Education Services &bull; CSAT & Quality Assurance
        </p>
      </div>
    </div>
  );
}
