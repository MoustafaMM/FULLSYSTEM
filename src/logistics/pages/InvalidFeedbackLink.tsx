import React from 'react';
import { useAppContext } from '../context/AppContext';
import PioneerLogo from '../components/PioneerLogo';
import { AlertCircle, Globe, Link2Off, Heart } from 'lucide-react';

export default function InvalidFeedbackLink() {
  const { language, setLanguage } = useAppContext();
  const isRTL = language === 'ar';

  return (
    <div 
      className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative" 
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
        >
          <Globe size={14} className="text-slate-500" />
          <span>{language === 'en' ? 'العربية' : 'English'}</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <PioneerLogo variant="full" className="h-8 w-auto" />
        </div>

        {/* Warning Icon Badge */}
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertCircle size={32} />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-black text-slate-900 mb-2">
          {isRTL ? 'رابط غير صالح' : 'Invalid Link'}
        </h2>

        {/* Message */}
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          {isRTL
            ? 'رابط التقييم هذا يفتقر إلى معرف مهمة صالح أو غير مكتمل. يرجى التأكد من الضغط على الرابط الكامل المرسل إليك عبر الإشعار أو البريد الإلكتروني.'
            : 'This feedback link is missing required task information or the link structure is invalid. Please make sure you clicked the full URL sent to you in your notification or email.'}
        </p>

        {/* Info callout */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 text-start" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="flex items-start gap-2.5">
            <Link2Off size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <span className="text-xs text-slate-500 font-medium leading-relaxed">
              {isRTL
                ? 'إذا استمرت هذه المشكلة، يرجى التواصل مع منسق الخدمات في بايونير لتزويدك برابط جديد.'
                : 'If this issue persists, please reach out to your Pioneer logistics coordinator to receive an updated link.'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-center items-center gap-1.5 text-xs text-slate-400 pt-2 border-t border-slate-100">
          <Heart size={14} className="text-red-500 fill-red-500" />
          <span>{isRTL ? 'خدمات بايونير التعليمية • نظام تقييم الطلاب' : 'Pioneer Education Services • Student CSAT'}</span>
        </div>
      </div>
    </div>
  );
}
