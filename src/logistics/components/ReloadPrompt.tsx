import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Sparkles, X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export default function ReloadPrompt() {
  const { language } = useAppContext();
  const [isReloading, setIsReloading] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        // Periodically check for updates every 10 minutes
        const intervalId = setInterval(() => {
          registration.update().catch(err => {
            console.debug('PWA registration update check skipped:', err);
          });
        }, 10 * 60 * 1000);

        // Check for updates whenever the tab returns to foreground
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(err => {
              console.debug('PWA foreground update check skipped:', err);
            });
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
          clearInterval(intervalId);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      }
    },
    onRegisterError(error) {
      console.warn('PWA service worker registration error:', error);
    },
  });

  // Auto-dismiss the "Ready to work offline" badge after 4 seconds
  useEffect(() => {
    if (offlineReady) {
      const timer = setTimeout(() => {
        setOfflineReady(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [offlineReady, setOfflineReady]);

  const handleReloadAndClearCache = async () => {
    setIsReloading(true);
    try {
      // 1. Clear all browser cache storage keys
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }

      // 2. Clear any cached session storage / service worker storage
      try {
        sessionStorage.clear();
      } catch (e) {
        // Ignore session storage errors
      }

      // 3. Post skip waiting message to waiting service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      // 4. Trigger service worker update
      await updateServiceWorker(true);
    } catch (err) {
      console.error('Error while clearing cache and updating service worker:', err);
    } finally {
      // 5. Force reload the window with clean cache
      window.location.reload();
    }
  };

  const isArabic = language === 'ar';

  // Render offline ready notification
  if (offlineReady && !needRefresh) {
    return (
      <div 
        className="fixed bottom-20 lg:bottom-6 right-3 left-3 sm:left-auto sm:right-6 sm:w-80 z-[9999] bg-emerald-950/90 text-emerald-200 border border-emerald-500/40 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-300"
        role="status"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
            <CheckCircle2 size={16} />
          </div>
          <p className="text-xs font-semibold truncate">
            {isArabic ? 'التطبيق جاهز للعمل بدون إنترنت' : 'App ready to work offline'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          className="text-emerald-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  // Render new update available notification popup
  if (!needRefresh) return null;

  return (
    <div 
      className="fixed bottom-20 lg:bottom-6 right-3 left-3 sm:left-auto sm:right-6 sm:w-96 z-[9999] bg-slate-900/95 text-white border border-purple-500/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl shadow-purple-950/50 animate-in slide-in-from-bottom-5 duration-300 flex flex-col gap-3.5"
      role="alertdialog"
      aria-live="assertive"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-red-600 text-white shadow-md shadow-red-500/20 shrink-0">
            <Sparkles size={20} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-ping" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>{isArabic ? 'تحديث جديد للنظام متوفر' : 'New System Update Available'}</span>
            </h4>
            <span className="text-[11px] text-purple-300 font-medium">
              {isArabic ? 'إصدار جديد جاهز للتثبيت' : 'Fresh build ready to install'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="text-slate-400 hover:text-white hover:bg-slate-800/80 p-1.5 rounded-xl transition-colors cursor-pointer shrink-0"
          title={isArabic ? 'إغلاق' : 'Dismiss'}
        >
          <X size={18} />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-300 leading-relaxed">
        {isArabic 
          ? 'تم تنزيل تحديث جديد في الخلفية. انقر على الزر أدناه لمسح الذاكرة المؤقتة وتحديث التطبيق فورا.'
          : 'A new version of Pioneer Logistics has been prepared in the background. Reload now to purge stale caches and activate latest features.'}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={isReloading}
          onClick={handleReloadAndClearCache}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500 active:scale-95 shadow-lg shadow-red-600/20 transition-all cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={15} className={isReloading ? 'animate-spin' : ''} />
          <span>
            {isReloading 
              ? (isArabic ? 'جارٍ التحديث ومسح الذاكرة...' : 'Updating & Clearing Cache...') 
              : (isArabic ? 'إعادة التحميل ومسح الذاكرة' : 'Reload & Clear Cache')}
          </span>
        </button>

        <button
          type="button"
          disabled={isReloading}
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
        >
          {isArabic ? 'لاحقاً' : 'Later'}
        </button>
      </div>
    </div>
  );
}
