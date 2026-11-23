import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from './layout/Layout';

export interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'pill' | 'navbar';
  showLabel?: boolean;
}

export default function ThemeToggle({
  className = '',
  variant = 'icon',
  showLabel = false
}: ThemeToggleProps) {
  const { theme, toggleTheme, t, language } = useAppContext();
  const isDark = theme === 'dark';
  const isRTL = language === 'ar';

  const tooltipText = isDark ? t('switchToLightMode') : t('switchToDarkMode');
  const labelText = isDark ? t('lightMode') : t('darkMode');

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={tooltipText}
        aria-label={tooltipText}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
          "border cursor-pointer select-none",
          isDark 
            ? "bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700 shadow-sm" 
            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200",
          className
        )}
      >
        <div className="relative w-4 h-4 flex items-center justify-center">
          <Sun 
            size={16} 
            className={cn(
              "absolute text-amber-400 transition-all duration-300",
              isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            )} 
          />
          <Moon 
            size={15} 
            className={cn(
              "absolute text-indigo-500 transition-all duration-300",
              isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            )} 
          />
        </div>
        <span className="leading-none">{labelText}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={tooltipText}
      aria-label={tooltipText}
      className={cn(
        "relative p-2 rounded-full transition-all duration-300 cursor-pointer select-none",
        "flex items-center justify-center",
        isDark 
          ? "bg-slate-800 text-amber-300 hover:bg-slate-700 border border-slate-700/80 shadow-sm shadow-black/30" 
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80",
        showLabel && "px-3 gap-2",
        className
      )}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        <Sun 
          size={18} 
          className={cn(
            "absolute text-amber-400 transition-all duration-300 transform",
            isDark ? "rotate-0 scale-100 opacity-100 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" : "-rotate-90 scale-0 opacity-0"
          )} 
        />
        <Moon 
          size={18} 
          className={cn(
            "absolute text-slate-600 transition-all duration-300 transform",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          )} 
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium leading-none">{labelText}</span>
      )}
    </button>
  );
}
