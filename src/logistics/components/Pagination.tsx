import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  colorScheme?: 'purple' | 'red' | 'blue' | 'slate';
}

export const getPageNumbers = (current: number, total: number): (number | '...')[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
};

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = 'items',
  colorScheme = 'purple'
}: PaginationProps) {
  const { language, t } = useAppContext();
  const isRTL = language === 'ar';

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(validCurrentPage * pageSize, totalItems);

  if (totalItems === 0) return null;

  const colorStyles = {
    purple: {
      activeButton: 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 border-purple-600',
      ring: 'focus:ring-purple-600/20 focus:border-purple-600'
    },
    red: {
      activeButton: 'bg-red-600 text-white shadow-sm shadow-red-600/30 border-red-600',
      ring: 'focus:ring-red-600/20 focus:border-red-600'
    },
    blue: {
      activeButton: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 border-blue-600',
      ring: 'focus:ring-blue-600/20 focus:border-blue-600'
    },
    slate: {
      activeButton: 'bg-slate-900 text-white shadow-sm shadow-slate-900/30 border-slate-900',
      ring: 'focus:ring-slate-600/20 focus:border-slate-600'
    }
  }[colorScheme];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
      {/* Left side: Results Summary & Rows Per Page */}
      <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-start">
        <div className="text-slate-500 font-medium">
          {language === 'ar' ? (
            <span>
              عرض <strong className="text-slate-800 font-bold">{startIndex}</strong> - <strong className="text-slate-800 font-bold">{endIndex}</strong> من <strong className="text-slate-800 font-bold">{totalItems}</strong> {itemLabel} (صفحة <strong className="text-slate-800 font-bold">{validCurrentPage}</strong> من <strong className="text-slate-800 font-bold">{totalPages}</strong>)
            </span>
          ) : (
            <span>
              Showing <strong className="text-slate-800 font-bold">{startIndex}</strong> to <strong className="text-slate-800 font-bold">{endIndex}</strong> of <strong className="text-slate-800 font-bold">{totalItems}</strong> {itemLabel} (Page <strong className="text-slate-800 font-bold">{validCurrentPage}</strong> of <strong className="text-slate-800 font-bold">{totalPages}</strong>)
            </span>
          )}
        </div>

        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              {language === 'ar' ? 'لكل صفحة:' : 'Per page:'}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className={`bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 ${colorStyles.ring} cursor-pointer`}
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Page navigation pills */}
      <div className="flex items-center gap-1.5 w-full md:w-auto justify-center md:justify-end">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={validCurrentPage === 1}
          className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
          title={t('firstPage') || 'First page'}
        >
          <ChevronsLeft size={16} className={isRTL ? "rotate-180" : ""} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, validCurrentPage - 1))}
          disabled={validCurrentPage === 1}
          className="p-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-2xs flex items-center gap-1 cursor-pointer font-bold text-xs"
          title={t('previous') || 'Previous'}
        >
          <ChevronLeft size={15} className={isRTL ? "rotate-180" : ""} />
          <span className="hidden sm:inline">{t('previous') || 'Prev'}</span>
        </button>

        {/* Mobile Compact Page Indicator */}
        <div className="sm:hidden px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
          {validCurrentPage} / {totalPages}
        </div>

        {/* Page Number Pills (Tablet & Desktop) */}
        <div className="hidden sm:flex items-center gap-1 mx-0.5">
          {getPageNumbers(validCurrentPage, totalPages).map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 py-1 text-slate-400 select-none font-bold">
                  ...
                </span>
              );
            }
            const isCurrent = page === validCurrentPage;
            return (
              <button
                type="button"
                key={`page-${page}`}
                onClick={() => onPageChange(page as number)}
                className={`min-w-8 h-8 px-2 rounded-xl text-xs font-black flex items-center justify-center transition-all cursor-pointer border ${
                  isCurrent 
                    ? colorStyles.activeButton
                    : 'text-slate-600 hover:bg-slate-100 bg-white border-slate-200'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, validCurrentPage + 1))}
          disabled={validCurrentPage === totalPages}
          className="p-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-2xs flex items-center gap-1 cursor-pointer font-bold text-xs"
          title={t('next') || 'Next'}
        >
          <span className="hidden sm:inline">{t('next') || 'Next'}</span>
          <ChevronRight size={15} className={isRTL ? "rotate-180" : ""} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={validCurrentPage === totalPages}
          className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
          title={t('lastPage') || 'Last page'}
        >
          <ChevronsRight size={16} className={isRTL ? "rotate-180" : ""} />
        </button>
      </div>
    </div>
  );
}
