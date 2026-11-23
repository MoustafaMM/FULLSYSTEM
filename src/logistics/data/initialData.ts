import { TaskPreset } from '../types';

export const initialPresets: TaskPreset[] = [
  {
    id: 'preset-1',
    nameEn: 'Normal Reception',
    nameAr: 'استقبال عادي',
    defaultSubTasks: [
      { titleEn: 'Communicate with Student', titleAr: 'التواصل مع الطالب', requiresProof: true },
      { titleEn: 'Depart from Office/Previous Task', titleAr: 'التحرك من المكتب / المهمة السابقة', requiresProof: false },
      { titleEn: 'Depart from Airport', titleAr: 'التحرك من المطار', requiresProof: true },
      { titleEn: 'Hand over Welcome Gift', titleAr: 'تسليم هدية الاستقبال', requiresProof: true },
      { titleEn: 'Hand over SIM Card', titleAr: 'تسليم شريحة الاتصال', requiresProof: true },
      { titleEn: 'Install & Activate Apps', titleAr: 'تنزيل وتفعيل التطبيقات', requiresProof: false },
      { titleEn: 'Purchase Hospitality Meal', titleAr: 'شراء وجبة الضيافة', requiresProof: true },
      { titleEn: 'Transport to Accommodation/Hotel', titleAr: 'التوصيل للسكن أو الفندق', requiresProof: true },
      { titleEn: 'Depart to Next Destination', titleAr: 'التحرك للوجهة التالية', requiresProof: false },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  },
  {
    id: 'preset-2',
    nameEn: 'Medical Examination',
    nameAr: 'فحص طبي',
    defaultSubTasks: [
      { titleEn: 'Communicate with Student', titleAr: 'التواصل مع الطالب', requiresProof: true },
      { titleEn: 'Depart from Office', titleAr: 'التحرك من المكتب', requiresProof: false },
      { titleEn: 'Arrive at Student', titleAr: 'الوصول للطالب', requiresProof: false },
      { titleEn: 'Complete Task & Receive Form', titleAr: 'انهاء المهمة واستلام استمارة الفحص', requiresProof: true },
      { titleEn: 'Transport to Accommodation', titleAr: 'التوصيل للسكن', requiresProof: true },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  },
  {
    id: 'preset-3',
    nameEn: 'University Registration',
    nameAr: 'تسجيل جامعي',
    defaultSubTasks: [
      { titleEn: 'Communicate with Student', titleAr: 'التواصل مع الطالب', requiresProof: true },
      { titleEn: 'Depart from Office', titleAr: 'التحرك من المكتب', requiresProof: false },
      { titleEn: 'Arrive at Student', titleAr: 'الوصول للطالب', requiresProof: false },
      { titleEn: 'Process Payment', titleAr: 'إجراء الدفع', requiresProof: true },
      { titleEn: 'Fill Forms', titleAr: 'تعبئة الاستمارات', requiresProof: false },
      { titleEn: 'Submit Passport & Receive Holding Letter', titleAr: 'تسليم الجواز واستلام رسالة الاحتفاظ', requiresProof: true },
      { titleEn: 'Receive University Apps & Schedule', titleAr: 'استلام تطبيقات الجامعة والجدول', requiresProof: false },
      { titleEn: 'Transport to Accommodation', titleAr: 'التوصيل للسكن', requiresProof: true },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  },
  {
    id: 'preset-4',
    nameEn: 'Property Viewing',
    nameAr: 'فيو (معاينة سكن)',
    defaultSubTasks: [
      { titleEn: 'Communicate with Student', titleAr: 'التواصل مع الطالب', requiresProof: true },
      { titleEn: 'Depart from Office', titleAr: 'التحرك من المكتب', requiresProof: false },
      { titleEn: 'Arrive at Student', titleAr: 'الوصول للطالب', requiresProof: false },
      { titleEn: 'Arrive at Accommodation', titleAr: 'الوصول للسكن', requiresProof: false },
      { titleEn: 'Complete Inspection & Photography', titleAr: 'انهاء المعاينة وتصوير الاستوديو', requiresProof: true },
      { titleEn: 'Transport to Hotel', titleAr: 'التوصيل للفندق', requiresProof: true },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  },
  {
    id: 'preset-5',
    nameEn: 'Accommodation Check-in',
    nameAr: 'تسكين',
    defaultSubTasks: [
      { titleEn: 'Communicate with Student', titleAr: 'التواصل مع الطالب', requiresProof: true },
      { titleEn: 'Depart from Office', titleAr: 'التحرك من المكتب', requiresProof: false },
      { titleEn: 'Arrive at Student', titleAr: 'الوصول للطالب', requiresProof: false },
      { titleEn: 'Arrive at Accommodation', titleAr: 'الوصول للسكن', requiresProof: false },
      { titleEn: 'Complete Payment', titleAr: 'إتمام الدفع', requiresProof: true },
      { titleEn: 'Sign Contract', titleAr: 'توقيع العقد', requiresProof: true },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  },
  {
    id: 'preset-6',
    nameEn: 'Document Attestation',
    nameAr: 'توثيقات',
    defaultSubTasks: [
      { titleEn: 'Depart from Office', titleAr: 'التحرك من المكتب', requiresProof: false },
      { titleEn: 'Ministry of Higher Education (MOHE)', titleAr: 'وزارة التعليم العالي', requiresProof: true },
      { titleEn: 'Ministry of Foreign Affairs (MFA)', titleAr: 'وزارة الخارجية', requiresProof: true },
      { titleEn: 'Commissioner for Oaths', titleAr: 'مفوض أداء القسم', requiresProof: true },
      { titleEn: 'Embassy', titleAr: 'السفارة', requiresProof: true },
      { titleEn: 'Arrive at Office', titleAr: 'الوصول للمكتب', requiresProof: false },
    ]
  }
];
