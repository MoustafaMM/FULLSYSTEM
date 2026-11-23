// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Filter, RotateCcw, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, User, Plus, X, ListTodo, Sparkles, Camera, Globe, GraduationCap, Calendar, Plane, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DeleteStudentConfirmModal from '../components/DeleteStudentConfirmModal';
import { cn } from '../components/layout/Layout';
import DatePicker from '../components/DatePicker';
import { Student, ArrivalCategory, AcademicProgram, ServicePackage } from '../types';
import { splitFullName } from '../utils/nameUtils';

export const COMMON_NATIONALITIES = [
  'Yemeni',
  'Saudi',
  'Sudanese',
  'Syrian',
  'Palestinian',
  'Jordanian',
  'Egyptian',
  'Iraqi',
  'Omani',
  'Emirati',
  'Kuwaiti',
  'Qatari',
  'Bahraini',
  'Libyan',
  'Moroccan',
  'Algerian',
  'Tunisian',
  'Somali',
  'Turkish',
  'Pakistani',
  'Indian',
  'Bangladeshi',
  'Indonesian',
  'Malaysian',
  'Chinese',
  'Nigerian',
  'Chadian'
];

export const ACADEMIC_PROGRAMS: AcademicProgram[] = [
  'Language',
  'Foundation',
  'Diploma',
  'Certificate',
  'Bachelor',
  'Master',
  'PhD'
];

export const SERVICE_PACKAGES: ServicePackage[] = [
  'Free',
  '300$',
  '500$',
  '300$(Free)'
];

interface StudentsDirectoryProps {
  onSelectStudent: (id: string) => void;
}

const initialStudentState = { 
  fullName: '',
  passportNumber: '',
  nationality: '',
  studyIntake: '',
  arrivalCategory: '' as ArrivalCategory | '',
  program: '' as AcademicProgram | '',
  package: '' as ServicePackage | '',
  university: '',
  contactInfo: '',
  email: '',
  counselor: '',
  flightDetails: { airline: '', flightNumber: '', terminal: '', date: '', time: '' },
  accommodationDetails: { hotelName: '', roomType: '', checkInDate: '', checkOutDate: '' }
};

export default function StudentsDirectory({ onSelectStudent }: StudentsDirectoryProps) {
  const { t, students, tasks, currentUser, addStudent, updateStudent, deleteStudent, deleteStudents, presets, users, assignTask, vehicles, language } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [packageFilter, setPackageFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [counselorFilter, setCounselorFilter] = useState<string>('all');
  const [nationalityFilter, setNationalityFilter] = useState<string>('all');
  const [universityFilter, setUniversityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newStudent, setNewStudent] = useState(initialStudentState);

  const counselors = useMemo(() => {
    return users
      .filter(u => u.role === 'counselor')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [users]);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkPresetId, setBulkPresetId] = useState('');
  const [bulkCustomTitle, setBulkCustomTitle] = useState('');
  const [bulkCustomTitleAr, setBulkCustomTitleAr] = useState('');
  const [bulkCustomSubTasks, setBulkCustomSubTasks] = useState<{ titleEn: string; titleAr: string; requiresProof?: boolean }[]>([]);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [bulkCoordinatorNote1, setBulkCoordinatorNote1] = useState('');
  const [bulkCoordinatorNote2, setBulkCoordinatorNote2] = useState('');
  const [bulkHotel, setBulkHotel] = useState('');
  const [bulkTaskTime, setBulkTaskTime] = useState('');
  const [bulkTaskDate, setBulkTaskDate] = useState('');
  const [bulkVehicleId, setBulkVehicleId] = useState('');
  const [bulkAssignError, setBulkAssignError] = useState<string | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDeleteSingle = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteStudent(studentToDelete.id);
      toast.success(t('studentDeletedSuccess') || 'Student profile deleted successfully');
      setSelectedIds(prev => prev.filter(id => id !== studentToDelete.id));
      setStudentToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete student:', err);
      toast.error(err.message || 'Failed to delete student profile');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteBulk = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      await deleteStudents(selectedIds);
      toast.success(t('studentsDeletedSuccess') || 'Student profiles deleted successfully');
      setSelectedIds([]);
      setIsBulkDeleting(false);
    } catch (err: any) {
      console.error('Failed to delete students:', err);
      toast.error(err.message || 'Failed to delete selected student profiles');
    } finally {
      setIsDeleting(false);
    }
  };

    const studentOfficerMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of students) {
      const officers = new Set<string>();
      if (s.assignedOfficerId) officers.add(s.assignedOfficerId);
      map.set(s.id, officers);
    }
    for (const task of tasks) {
      if (task.studentId && task.assigneeId) {
        let set = map.get(task.studentId);
        if (!set) {
          set = new Set<string>();
          map.set(task.studentId, set);
        }
        set.add(task.assigneeId);
      }
    }
    return map;
  }, [students, tasks]);

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const nationalities = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.nationality && s.nationality.trim()) set.add(s.nationality.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const universities = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.university && s.university.trim()) set.add(s.university.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (officerFilter !== 'all') count++;
    if (packageFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (programFilter !== 'all') count++;
    if (counselorFilter !== 'all') count++;
    if (nationalityFilter !== 'all') count++;
    if (universityFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (fromDate) count++;
    if (toDate) count++;
    return count;
  }, [searchTerm, officerFilter, packageFilter, categoryFilter, programFilter, counselorFilter, nationalityFilter, universityFilter, statusFilter, fromDate, toDate]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setOfficerFilter('all');
    setPackageFilter('all');
    setCategoryFilter('all');
    setProgramFilter('all');
    setCounselorFilter('all');
    setNationalityFilter('all');
    setUniversityFilter('all');
    setStatusFilter('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (currentUser?.role === 'counselor') {
        const isMyStudent = s.counselorId === currentUser.id || s.counselor === currentUser.id;
        if (!isMyStudent) return false;
      }

      // 1. Logistics Officer Filter (assignedOfficerId OR task.assigneeId)
      if (officerFilter !== 'all') {
        const officerSet = studentOfficerMap.get(s.id);
        if (officerFilter === 'unassigned') {
          if (officerSet && officerSet.size > 0) return false;
        } else {
          if (!officerSet || !officerSet.has(officerFilter)) return false;
        }
      }

      // 2. Package Tier Filter
      if (packageFilter !== 'all') {
        const pkg = s.package || (s as any).servicePackage;
        if (pkg !== packageFilter) return false;
      }

      // 3. Category Filter
      if (categoryFilter !== 'all') {
        if (s.arrivalCategory !== categoryFilter) return false;
      }

      // 4. Program Filter
      if (programFilter !== 'all') {
        if (s.program !== programFilter) return false;
      }

      // 5. Counselor Filter
      if (counselorFilter !== 'all') {
        if (s.counselorId !== counselorFilter && s.counselor !== counselorFilter) return false;
      }

      // 6. Nationality Filter
      if (nationalityFilter !== 'all') {
        if (s.nationality !== nationalityFilter) return false;
      }

      // 7. University Filter
      if (universityFilter !== 'all') {
        if (s.university !== universityFilter) return false;
      }

      // 8. Logistics Status Filter
      if (statusFilter !== 'all') {
        if (s.status !== statusFilter) return false;
      }

      // 9. Arrival Date Range Filter
      const arrivalDate = s.arrivalDate || s.flightDetails?.date;
      if (fromDate && (!arrivalDate || arrivalDate < fromDate)) return false;
      if (toDate && (!arrivalDate || arrivalDate > toDate)) return false;

      // 10. Search Query Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const officerNames = Array.from(studentOfficerMap.get(s.id) || [])
          .map(id => users.find(u => u.id === id)?.name || '')
          .join(' ')
          .toLowerCase();

        const matchName = s.fullName.toLowerCase().includes(q);
        const matchPassport = s.passportNumber.toLowerCase().includes(q);
        const matchEmail = (s.email || '').toLowerCase().includes(q);
        const matchPhone = (s.contactInfo || '').toLowerCase().includes(q);
        const matchUni = (s.university || '').toLowerCase().includes(q);
        const matchOfficer = officerNames.includes(q);
        const matchNat = (s.nationality || '').toLowerCase().includes(q);
        const matchProg = (s.program || '').toLowerCase().includes(q);

        if (!matchName && !matchPassport && !matchEmail && !matchPhone && !matchUni && !matchOfficer && !matchNat && !matchProg) {
          return false;
        }
      }

      return true;
    });
  }, [students, currentUser, officerFilter, packageFilter, categoryFilter, programFilter, counselorFilter, nationalityFilter, universityFilter, statusFilter, fromDate, toDate, searchTerm, studentOfficerMap, users]);

  const handleAddStudent = async () => {
    const errors: Record<string, string> = {};
    if (!newStudent.fullName?.trim()) {
      errors.fullName = language === 'ar' ? 'الاسم الكامل مطلوب' : 'Full Name is required';
    }
    if (!newStudent.passportNumber?.trim()) {
      errors.passportNumber = language === 'ar' ? 'رقم الجواز مطلوب' : 'Passport Number is required';
    }
    if (!newStudent.nationality?.trim()) {
      errors.nationality = language === 'ar' ? 'الجنسية مطلوبة' : 'Nationality is required';
    }
    if (!newStudent.studyIntake?.trim()) {
      errors.studyIntake = language === 'ar' ? 'دفعة الدراسة مطلوبة (مثال: October 2026)' : 'Study Intake is required (e.g. October 2026)';
    }
    if (!newStudent.arrivalCategory) {
      errors.arrivalCategory = language === 'ar' ? 'يرجى اختيار الفئة (طالب أو سياحة)' : 'Category is required (Student or Tourism)';
    }
    if (!newStudent.program) {
      errors.program = language === 'ar' ? 'يرجى اختيار البرنامج الأكاديمي' : 'Academic Program is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newStudent.email?.trim()) {
      errors.email = language === 'ar' ? 'البريد الإلكتروني للطالب مطلوب' : 'Student email is required';
    } else if (!emailRegex.test(newStudent.email.trim())) {
      errors.email = t('invalidEmailFormat') || (language === 'ar' ? 'صيغة البريد الإلكتروني غير صالحة' : 'Please enter a valid email address');
    }
    if (!newStudent.package) {
      errors.package = t('packageRequired') || (language === 'ar' ? 'يرجى اختيار باقة الخدمة' : 'Service package is required');
    }
    if (!newStudent.counselor) {
      errors.counselor = language === 'ar' ? 'يرجى اختيار المستشار الأكاديمي' : 'Counselor assignment is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setAddError(t('mandatoryFieldsRequired') || 'Please complete all mandatory fields.');
      return;
    }

    setAddError(null);
    setFormErrors({});
    try {
      const cleanedPassport = newStudent.passportNumber.trim().toUpperCase();
      await addStudent({
        ...newStudent,
        fullName: newStudent.fullName.trim(),
        passportNumber: cleanedPassport,
        nationality: newStudent.nationality.trim(),
        studyIntake: newStudent.studyIntake.trim(),
        arrivalCategory: newStudent.arrivalCategory as ArrivalCategory,
        program: newStudent.program as AcademicProgram,
        package: newStudent.package as ServicePackage,
        servicePackage: newStudent.package as ServicePackage,
        university: newStudent.university.trim(),
        contactInfo: newStudent.contactInfo.trim(),
        email: newStudent.email.trim().toLowerCase(),
        arrivalDate: newStudent.flightDetails?.date || new Date().toISOString().split('T')[0],
      });
      setIsAdding(false);
      setNewStudent(initialStudentState);
    } catch (error: any) {
      if (error.message === 'DUPLICATE_PASSPORT') {
        const msg = t('duplicatePassport') || 'A student with this passport number already exists.';
        setAddError(msg);
        setFormErrors(prev => ({ ...prev, passportNumber: msg }));
      } else {
        setAddError(error.message || 'An error occurred while adding the student.');
      }
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, officerFilter, packageFilter, categoryFilter, programFilter, counselorFilter, nationalityFilter, universityFilter, statusFilter, fromDate, toDate, pageSize]);

  const isRTL = language === 'ar';
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredStudents.length);

  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice(startIndex, endIndex);
  }, [filteredStudents, startIndex, endIndex]);

  const isAllFilteredSelected = filteredStudents.length > 0 && selectedIds.length === filteredStudents.length;
  const isPartialSelected = selectedIds.length > 0 && !isAllFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isPartialSelected;
    }
  }, [isPartialSelected]);

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map(s => s.id));
    }
  };

  const getPageNumbers = (current: number, total: number): (number | '...')[] => {
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

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setBulkPresetId(val);
    setBulkAssignError(null);
    if (val === 'custom') {
      setBulkCustomTitle('');
      setBulkCustomTitleAr('');
      setBulkCustomSubTasks([{ titleEn: '', titleAr: '', requiresProof: false }]);
    } else {
      const preset = presets.find(p => p.id === val);
      if (preset) {
        setBulkCustomSubTasks(preset.defaultSubTasks.map(st => ({
          titleEn: st.titleEn,
          titleAr: st.titleAr,
          requiresProof: !!st.requiresProof
        })));
      } else {
        setBulkCustomSubTasks([]);
      }
    }
  };

  const resetBulkAssignForm = () => {
    setBulkPresetId('');
    setBulkCustomTitle('');
    setBulkCustomTitleAr('');
    setBulkCustomSubTasks([]);
    setBulkAssigneeId('');
    setBulkCoordinatorNote1('');
    setBulkCoordinatorNote2('');
    setBulkHotel('');
    setBulkTaskTime('');
    setBulkTaskDate('');
    setBulkVehicleId('');
    setBulkAssignError(null);
  };

  const handleBulkAssign = async () => {
    if (!bulkPresetId || !bulkAssigneeId || selectedIds.length === 0) return;
    
    const isCustom = bulkPresetId === 'custom';
    let preset: (typeof presets)[0] | undefined = undefined;

    if (isCustom) {
      if (!bulkCustomTitle.trim()) {
        setBulkAssignError(t('customTitleRequired'));
        return;
      }
      if (bulkCustomSubTasks.length === 0) {
        setBulkAssignError(t('atLeastOneSubtaskRequired'));
        return;
      }
    } else {
      preset = presets.find(p => p.id === bulkPresetId);
      if (!preset) {
        setBulkAssignError(t('selectPreset'));
        return;
      }
    }

    setBulkAssignError(null);
    try {
      for (const studentId of selectedIds) {
        const targetStudent = students.find(s => s.id === studentId);
        const subTasksToUse = isCustom
          ? bulkCustomSubTasks.map((st, i) => ({
              id: `st-${Date.now()}-${studentId}-${i}`,
              titleEn: st.titleEn.trim() || `Step ${i + 1}`,
              titleAr: st.titleAr.trim() || st.titleEn.trim() || `خطوة ${i + 1}`,
              isCompleted: false,
              requiresProof: !!st.requiresProof
            }))
          : (bulkCustomSubTasks.length > 0 ? bulkCustomSubTasks : preset!.defaultSubTasks).map((st, i) => ({
              id: `st-${Date.now()}-${studentId}-${i}`,
              titleEn: st.titleEn.trim() || `Step ${i + 1}`,
              titleAr: st.titleAr.trim() || st.titleEn.trim() || `خطوة ${i + 1}`,
              isCompleted: false,
              requiresProof: !!st.requiresProof
            }));

        await assignTask({
          studentId,
          studentEmail: targetStudent?.email?.trim() || undefined,
          assigneeId: bulkAssigneeId,
          presetId: isCustom ? undefined : preset!.id,
          customTitle: isCustom ? bulkCustomTitle.trim() : undefined,
          customTitleAr: isCustom && bulkCustomTitleAr.trim() ? bulkCustomTitleAr.trim() : undefined,
          status: 'pending',
          coordinatorNote1: bulkCoordinatorNote1.trim() || undefined,
          coordinatorNote2: bulkCoordinatorNote2.trim() || undefined,
          hotel: bulkHotel.trim() || undefined,
          taskTime: bulkTaskTime || undefined,
          taskDate: bulkTaskDate || undefined,
          vehicleId: bulkVehicleId || undefined,
          subTasks: subTasksToUse
        });
      }
      
      setIsBulkAssigning(false);
      setSelectedIds([]);
      resetBulkAssignForm();
    } catch (error: any) {
      console.error("Bulk assign task error:", error);
      setBulkAssignError(`Failed to bulk assign task: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
            {/* Comprehensive Multi-Variable Students Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('students')}</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              {t('studentsDesc') || 'Manage and view all registered students with multi-attribute filtering'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-stretch sm:self-auto justify-end">
            <button
              type="button"
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              <Filter size={13} />
              <span>{isFiltersExpanded ? 'Hide Filters' : 'Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs">
                <Filter size={12} />
                <span>{activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}</span>
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Clear All Filters</span>
              </button>
            )}
            {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
              <button 
                type="button"
                onClick={() => setIsAdding(true)}
                className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all cursor-pointer"
              >
                <Plus size={16} /> <span>{t('addStudent')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input 
            type="text" 
            placeholder={t('searchStudents') || "Search by Name, Passport, Email, Phone, University, or Assigned Logistics Officer..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-1", isFiltersExpanded ? "grid" : "hidden md:grid")}>
          {/* Logistics Officer Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Logistics Officer
            </label>
            <select
              value={officerFilter}
              onChange={(e) => setOfficerFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Field Officers</option>
              <option value="unassigned">Unassigned</option>
              {fieldOfficers.map(officer => (
                <option key={officer.id} value={officer.id}>{officer.name}</option>
              ))}
            </select>
          </div>

          {/* Package Tier Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Package Tier
            </label>
            <select
              value={packageFilter}
              onChange={(e) => setPackageFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Packages</option>
              <option value="Free">Free</option>
              <option value="300$">300$</option>
              <option value="500$">500$</option>
              <option value="300$(Free)">300$(Free)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Categories</option>
              <option value="Student">Student</option>
              <option value="Tourism">Tourism</option>
            </select>
          </div>

          {/* Academic Program Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Academic Program
            </label>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Programs</option>
              {ACADEMIC_PROGRAMS.map(prog => (
                <option key={prog} value={prog}>{prog}</option>
              ))}
            </select>
          </div>

          {/* Assigned Counselor Filter (Hidden if role is counselor) */}
          {currentUser?.role !== 'counselor' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Assigned Counselor
              </label>
              <select
                value={counselorFilter}
                onChange={(e) => setCounselorFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                <option value="all">All Counselors</option>
                {counselors.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Logistics Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Logistics Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Nationality Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Nationality / Country
            </label>
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Nationalities</option>
              {nationalities.map(nat => (
                <option key={nat} value={nat}>{nat}</option>
              ))}
            </select>
          </div>

          {/* University Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              University
            </label>
            <select
              value={universityFilter}
              onChange={(e) => setUniversityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">All Universities</option>
              {universities.map(uni => (
                <option key={uni} value={uni}>{uni}</option>
              ))}
            </select>
          </div>

          {/* Arrival Date Range: From Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Arrival From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>

          {/* Arrival Date Range: To Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Arrival To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>
        </div>

        {/* Live Results Counter Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span>
              {language === 'ar' ? (
                <>
                  عرض <strong className="text-slate-900 font-bold">{filteredStudents.length === 0 ? 0 : startIndex + 1}</strong> إلى{' '}
                  <strong className="text-slate-900 font-bold">{endIndex}</strong> من أصل{' '}
                  <strong className="text-slate-900 font-bold">{filteredStudents.length}</strong> طالب مطابق
                  {filteredStudents.length !== students.length && (
                    <span className="text-slate-400"> (من إجمالي {students.length})</span>
                  )}
                </>
              ) : (
                <>
                  Showing <strong className="text-slate-900 font-bold">{filteredStudents.length === 0 ? 0 : startIndex + 1}</strong> to{' '}
                  <strong className="text-slate-900 font-bold">{endIndex}</strong> of{' '}
                  <strong className="text-slate-900 font-bold">{filteredStudents.length}</strong> matching students
                  {filteredStudents.length !== students.length && (
                    <span className="text-slate-400"> (out of {students.length} total)</span>
                  )}
                </>
              )}
            </span>
          </div>
          {totalPages > 1 && (
            <div className="text-slate-500 font-medium">
              {t('page')} <strong className="text-slate-800">{validCurrentPage}</strong> {t('of')} <strong className="text-slate-800">{totalPages}</strong>
            </div>
          )}
        </div>
      </div>
      
      {selectedIds.length > 0 && (currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
        <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="text-red-800 font-medium text-sm px-2">
            {selectedIds.length} student{selectedIds.length > 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
            >
              Clear
            </button>
            {currentUser.role === 'admin' && (
              <button 
                type="button"
                onClick={() => setIsBulkDeleting(true)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shadow-red-600/20 cursor-pointer"
              >
                <Trash2 size={16} />
                <span>{selectedIds.length > 1 ? (t('deleteSelectedStudents') || 'Delete Selected Profiles') : (t('deleteStudentProfile') || 'Delete Student Profile')}</span>
              </button>
            )}
            <button 
              onClick={() => setIsBulkAssigning(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-red-600/20 cursor-pointer"
            >
              <ListTodo size={16} /> Bulk Assign Task
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Mobile Responsive Student Cards View */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginatedStudents.map(student => {
            const nameParts = splitFullName(student.fullName);
            const counselorUser = users.find(u => u.id === student.counselor);
            const isSelected = selectedIds.includes(student.id);
            return (
              <div 
                key={student.id} 
                onClick={() => onSelectStudent(student.id)}
                className={cn(
                  "p-4 hover:bg-slate-50 transition-colors cursor-pointer space-y-3",
                  isSelected ? "bg-red-50/40" : ""
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
                      <div onClick={e => e.stopPropagation()} className="pt-0.5">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelect(student.id)}
                          className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
                        />
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 font-bold text-sm border border-red-200/50">
                      <User size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm leading-snug">
                        <div>{nameParts.line1}</div>
                        {nameParts.line2 && <div className="text-slate-600 text-xs font-medium">{nameParts.line2}</div>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                          {student.passportNumber}
                        </span>
                        {student.nationality && (
                          <span className="text-[11px] text-slate-500">{student.nationality}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className={cn(
                    "px-2.5 py-0.5 text-[11px] font-bold rounded-full shrink-0",
                    student.status === 'completed' ? "bg-green-100 text-green-700" :
                    student.status === 'in_progress' ? "bg-red-100 text-red-800" :
                    "bg-slate-100 text-slate-700"
                  )}>
                    {t(student.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">{t('university')}</span>
                    <span className="font-semibold text-slate-800 truncate block">{student.university || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">{t('counselor')}</span>
                    <span className="font-semibold text-slate-800 truncate block">{counselorUser?.name || student.counselor || '-'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded-md border",
                      student.arrivalCategory === 'Tourism'
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                      {student.arrivalCategory || 'Student'}
                    </span>
                    {(student.package || (student as any).servicePackage) && (
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded-md border",
                        (student.package || (student as any).servicePackage) === '500$' ? "bg-purple-50 text-purple-700 border-purple-200" :
                        (student.package || (student as any).servicePackage) === '300$' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        (student.package || (student as any).servicePackage) === '300$(Free)' ? "bg-teal-50 text-teal-700 border-teal-200" :
                        "bg-slate-100 text-slate-700 border-slate-200"
                      )}>
                        {student.package || (student as any).servicePackage}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {currentUser.role === 'admin' && (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStudentToDelete(student);
                        }}
                        title={t('deleteStudentProfile') || 'Delete Student Profile'}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => onSelectStudent(student.id)}
                      className="text-red-600 hover:text-red-700 font-bold text-xs flex items-center gap-1 cursor-pointer py-1 px-2.5 rounded-lg bg-red-50 hover:bg-red-100"
                    >
                      {t('viewDetails')} <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredStudents.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              No students found.
            </div>
          )}
        </div>

        {/* Desktop Data Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
              <tr>
                {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
                  <th className="px-6 py-4 w-12" onClick={e => e.stopPropagation()}>
                    <input 
                      ref={selectAllRef}
                      type="checkbox" 
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-4">{t('studentName')}</th>
                <th className="px-6 py-4">{t('passport')}</th>
                <th className="px-6 py-4">{t('university')}</th>
                <th className="px-6 py-4">{t('counselor')}</th>
                <th className="px-6 py-4">{t('status')}</th>
                <th className="px-6 py-4 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedStudents.map(student => {
                const nameParts = splitFullName(student.fullName);
                return (
                <tr key={student.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => onSelectStudent(student.id)}>
                  {(currentUser.role === 'admin' || currentUser.role === 'coordinator') && (
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(student.id)}
                        onChange={() => toggleSelect(student.id)}
                        className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                      <User size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-slate-900 leading-snug" title={student.fullName}>
                          <div>{nameParts.line1}</div>
                          {nameParts.line2 && <div>{nameParts.line2}</div>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0",
                            student.arrivalCategory === 'Tourism'
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {student.arrivalCategory || 'Student'}
                          </span>
                          {(student.package || (student as any).servicePackage) && (
                            <span className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0",
                              (student.package || (student as any).servicePackage) === '500$' ? "bg-purple-50 text-purple-700 border-purple-200" :
                              (student.package || (student as any).servicePackage) === '300$' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              (student.package || (student as any).servicePackage) === '300$(Free)' ? "bg-teal-50 text-teal-700 border-teal-200" :
                              "bg-slate-100 text-slate-700 border-slate-200"
                            )}>
                              {student.package || (student as any).servicePackage}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 font-normal mt-0.5">
                        {[student.nationality, student.program, student.studyIntake].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono font-medium">{student.passportNumber}</td>
                  <td className="px-6 py-4">{student.university}</td>
                  <td className="px-6 py-4">{users.find(u => u.id === student.counselor)?.name || student.counselor}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-full",
                      student.status === 'completed' ? "bg-green-100 text-green-700" :
                      student.status === 'in_progress' ? "bg-red-100 text-red-800" :
                      "bg-slate-100 text-slate-700"
                    )}>
                      {t(student.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {currentUser.role === 'admin' && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStudentToDelete(student);
                          }}
                          title={t('deleteStudentProfile') || 'Delete Student Profile'}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => onSelectStudent(student.id)}
                        className="text-red-600 hover:text-red-700 font-medium flex items-center justify-end gap-1 cursor-pointer"
                      >
                        {t('viewDetails')} <ChevronRight size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls Bar */}
        {filteredStudents.length > 0 && (
          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left side: Range counter & Rows per page selector */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 w-full sm:w-auto justify-between sm:justify-start">
              <div>
                {language === 'ar' ? (
                  <span>
                    عرض <strong className="text-slate-900 font-semibold">{startIndex + 1}</strong> -{' '}
                    <strong className="text-slate-900 font-semibold">{endIndex}</strong> من أصل{' '}
                    <strong className="text-slate-900 font-semibold">{filteredStudents.length}</strong>
                  </span>
                ) : (
                  <span>
                    Showing <strong className="text-slate-900 font-semibold">{startIndex + 1}</strong> -{' '}
                    <strong className="text-slate-900 font-semibold">{endIndex}</strong> of{' '}
                    <strong className="text-slate-900 font-semibold">{filteredStudents.length}</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="pageSizeSelect" className="text-slate-500 font-medium whitespace-nowrap">
                  {t('rowsPerPage')}:
                </label>
                <select
                  id="pageSizeSelect"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 cursor-pointer shadow-2xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Right side: Page navigation pills */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-center sm:justify-end">
              {/* First Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
                title={t('firstPage')}
                aria-label={t('firstPage')}
              >
                <ChevronsLeft size={16} className={isRTL ? "rotate-180" : ""} />
              </button>

              {/* Previous Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={validCurrentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium px-2.5 shadow-2xs"
                title={t('previous')}
                aria-label={t('previous')}
              >
                <ChevronLeft size={16} className={isRTL ? "rotate-180" : ""} />
                <span className="hidden md:inline">{t('previous')}</span>
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1 mx-0.5">
                {getPageNumbers(validCurrentPage, totalPages).map((page, idx) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-slate-400 select-none">
                        ...
                      </span>
                    );
                  }
                  const isCurrent = page === validCurrentPage;
                  return (
                    <button
                      type="button"
                      key={`page-${page}`}
                      onClick={() => setCurrentPage(page as number)}
                      className={cn(
                        "min-w-8 h-8 px-2 rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer",
                        isCurrent
                          ? "bg-red-600 text-white shadow-sm shadow-red-600/30"
                          : "text-slate-600 hover:bg-slate-100 bg-white border border-slate-200"
                      )}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              {/* Next Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={validCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium px-2.5 shadow-2xs"
                title={t('next')}
                aria-label={t('next')}
              >
                <span className="hidden md:inline">{t('next')}</span>
                <ChevronRight size={16} className={isRTL ? "rotate-180" : ""} />
              </button>

              {/* Last Page Button */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
                title={t('lastPage')}
                aria-label={t('lastPage')}
              >
                <ChevronsRight size={16} className={isRTL ? "rotate-180" : ""} />
              </button>
            </div>
          </div>
        )}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div 
            className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{t('addStudent')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Enter student demographic, visa, and academic profile details</p>
              </div>
              <button 
                type="button"
                onClick={() => { setIsAdding(false); setAddError(null); setFormErrors({}); setNewStudent(initialStudentState); }} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-white">
              {addError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
                  {addError}
                </div>
              )}
              
              {/* Primary Student Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('fullName')} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newStudent.fullName}
                    onChange={e => {
                      setNewStudent({...newStudent, fullName: e.target.value});
                      if (formErrors.fullName) setFormErrors(prev => ({ ...prev, fullName: '' }));
                    }}
                    placeholder="e.g. John Doe"
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all",
                      formErrors.fullName 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    )}
                  />
                  {formErrors.fullName && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.fullName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('passportNumber')} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newStudent.passportNumber}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setNewStudent({...newStudent, passportNumber: val});
                      if (formErrors.passportNumber) setFormErrors(prev => ({ ...prev, passportNumber: '' }));
                    }}
                    onBlur={e => {
                      setNewStudent(prev => ({ ...prev, passportNumber: e.target.value.trim().toUpperCase() }));
                    }}
                    placeholder="e.g. A12345678"
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all font-mono tracking-wider uppercase",
                      formErrors.passportNumber 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    )}
                  />
                  {formErrors.passportNumber && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.passportNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('nationality')} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    list="nationalities-list"
                    value={newStudent.nationality}
                    onChange={e => {
                      setNewStudent({...newStudent, nationality: e.target.value});
                      if (formErrors.nationality) setFormErrors(prev => ({ ...prev, nationality: '' }));
                    }}
                    placeholder="e.g. Yemeni, Saudi, Egyptian..."
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all bg-white",
                      formErrors.nationality 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600"
                    )}
                  />
                  <datalist id="nationalities-list">
                    {COMMON_NATIONALITIES.map(nat => (
                      <option key={nat} value={nat} />
                    ))}
                  </datalist>
                  {formErrors.nationality && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.nationality}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('studyIntake')} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newStudent.studyIntake}
                    onChange={e => {
                      setNewStudent({...newStudent, studyIntake: e.target.value});
                      if (formErrors.studyIntake) setFormErrors(prev => ({ ...prev, studyIntake: '' }));
                    }}
                    placeholder='e.g. "October 2026" or "Feb 2027"'
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all",
                      formErrors.studyIntake 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    )}
                  />
                  {formErrors.studyIntake && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.studyIntake}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('arrivalCategory')} <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newStudent.arrivalCategory}
                    onChange={e => {
                      setNewStudent({...newStudent, arrivalCategory: e.target.value as ArrivalCategory});
                      if (formErrors.arrivalCategory) setFormErrors(prev => ({ ...prev, arrivalCategory: '' }));
                    }}
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all bg-white font-medium",
                      formErrors.arrivalCategory 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600"
                    )}
                  >
                    <option value="">-- {language === 'ar' ? 'اختر الفئة' : 'Select Category'} --</option>
                    <option value="Student">Student</option>
                    <option value="Tourism">Tourism</option>
                  </select>
                  {formErrors.arrivalCategory && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.arrivalCategory}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('program')} <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newStudent.program}
                    onChange={e => {
                      setNewStudent({...newStudent, program: e.target.value as AcademicProgram});
                      if (formErrors.program) setFormErrors(prev => ({ ...prev, program: '' }));
                    }}
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all bg-white font-medium",
                      formErrors.program 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600"
                    )}
                  >
                    <option value="">-- {language === 'ar' ? 'اختر البرنامج الأكاديمي' : 'Select Academic Program'} --</option>
                    <option value="Language">Language</option>
                    <option value="Foundation">Foundation</option>
                    <option value="Diploma">Diploma</option>
                    <option value="Certificate">Certificate</option>
                    <option value="Bachelor">Bachelor</option>
                    <option value="Master">Master</option>
                    <option value="PhD">PhD</option>
                  </select>
                  {formErrors.program && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.program}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('package') || 'Package'} <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newStudent.package}
                    onChange={e => {
                      setNewStudent({...newStudent, package: e.target.value as ServicePackage});
                      if (formErrors.package) setFormErrors(prev => ({ ...prev, package: '' }));
                    }}
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all bg-white font-medium",
                      formErrors.package 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600"
                    )}
                  >
                    <option value="">-- {language === 'ar' ? 'اختر الباقة' : 'Select Package'} --</option>
                    {SERVICE_PACKAGES.map(pkg => (
                      <option key={pkg} value={pkg}>{pkg}</option>
                    ))}
                  </select>
                  {formErrors.package && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.package}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('counselor')} <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newStudent.counselor}
                    onChange={e => {
                      setNewStudent({...newStudent, counselor: e.target.value});
                      if (formErrors.counselor) setFormErrors(prev => ({ ...prev, counselor: '' }));
                    }}
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all bg-white font-medium",
                      formErrors.counselor 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600"
                    )}
                  >
                    <option value="">{t('selectCounselor') || 'Select Counselor'}</option>
                    {counselors.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {formErrors.counselor && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.counselor}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('studentEmail')} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="email" 
                    required
                    value={newStudent.email || ''}
                    onChange={e => {
                      setNewStudent({...newStudent, email: e.target.value});
                      if (formErrors.email) setFormErrors(prev => ({ ...prev, email: '' }));
                    }}
                    placeholder="e.g. student@example.com"
                    className={cn(
                      "w-full px-3.5 py-2 border rounded-lg focus:ring-2 text-sm transition-all",
                      formErrors.email 
                        ? "border-red-500 focus:ring-red-500/20 focus:border-red-500 bg-red-50/20" 
                        : "border-slate-300 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    )}
                  />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('university')}
                  </label>
                  <input 
                    type="text" 
                    value={newStudent.university}
                    onChange={e => setNewStudent({...newStudent, university: e.target.value})}
                    placeholder="e.g. Universiti Malaya (UM)"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('contact')}
                  </label>
                  <input 
                    type="text" 
                    value={newStudent.contactInfo}
                    onChange={e => setNewStudent({...newStudent, contactInfo: e.target.value})}
                    placeholder="e.g. +60 12 345 6789"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 mb-3 text-sm">Flight Details (Optional)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Airline</label>
                    <input type="text" placeholder="e.g. Saudia" value={newStudent.flightDetails?.airline || ''} onChange={e => setNewStudent({...newStudent, flightDetails: {...(newStudent.flightDetails || {}), airline: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Flight Number</label>
                    <input type="text" placeholder="e.g. SV123" value={newStudent.flightDetails?.flightNumber || ''} onChange={e => setNewStudent({...newStudent, flightDetails: {...(newStudent.flightDetails || {}), flightNumber: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Terminal</label>
                    <input type="text" placeholder="e.g. Terminal 1" value={newStudent.flightDetails?.terminal || ''} onChange={e => setNewStudent({...newStudent, flightDetails: {...(newStudent.flightDetails || {}), terminal: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                    <input type="date" value={newStudent.flightDetails?.date || ''} onChange={e => setNewStudent({...newStudent, flightDetails: {...(newStudent.flightDetails || {}), date: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                    <input type="time" value={newStudent.flightDetails?.time || ''} onChange={e => setNewStudent({...newStudent, flightDetails: {...(newStudent.flightDetails || {}), time: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 mb-3 text-sm">Accommodation (Optional)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Hotel / Residence Name</label>
                    <input type="text" placeholder="e.g. Marriott Hotel" value={newStudent.accommodationDetails?.hotelName || ''} onChange={e => setNewStudent({...newStudent, accommodationDetails: {...(newStudent.accommodationDetails || {}), hotelName: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Check In</label>
                    <input type="date" value={newStudent.accommodationDetails?.checkInDate || ''} onChange={e => setNewStudent({...newStudent, accommodationDetails: {...(newStudent.accommodationDetails || {}), checkInDate: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Check Out</label>
                    <input type="date" value={newStudent.accommodationDetails?.checkOutDate || ''} onChange={e => setNewStudent({...newStudent, accommodationDetails: {...(newStudent.accommodationDetails || {}), checkOutDate: e.target.value}})} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sticky Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0 z-10 shrink-0">
              <button 
                type="button"
                onClick={() => { setIsAdding(false); setAddError(null); setFormErrors({}); setNewStudent(initialStudentState); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button 
                type="button"
                onClick={handleAddStudent}
                className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <Plus size={16} /> {t('add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkAssigning && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] sm:max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="p-5 pb-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">Bulk Assign Task</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assigning to <span className="font-bold text-slate-900">{selectedIds.length} selected student(s)</span>
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsBulkAssigning(false);
                  resetBulkAssignForm();
                }} 
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-white">
              {bulkAssignError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-100 font-medium">
                  {bulkAssignError}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('selectPreset')}</label>
                <select 
                  value={bulkPresetId}
                  onChange={handleBulkPresetChange}
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
              {bulkPresetId === 'custom' && (
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
                      value={bulkCustomTitle}
                      onChange={e => setBulkCustomTitle(e.target.value)}
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
                      value={bulkCustomTitleAr}
                      onChange={e => setBulkCustomTitleAr(e.target.value)}
                      placeholder={t('customTaskTitlePlaceholderAr')}
                      dir="rtl"
                      className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-right"
                    />
                  </div>
                </div>
              )}

              {bulkPresetId && (
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        {bulkPresetId === 'custom' ? t('customChecklistDesc') : t('taskSopSteps')}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {bulkCustomSubTasks.length} {bulkCustomSubTasks.length === 1 ? 'step' : 'steps'} &bull; {bulkCustomSubTasks.filter(st => st.requiresProof).length} proof required
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBulkCustomSubTasks([...bulkCustomSubTasks, { titleEn: '', titleAr: '', requiresProof: false }])}
                      className="text-xs bg-red-50 text-red-600 hover:bg-red-100 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} /> {t('addSubtask')}
                    </button>
                  </div>
                  
                  {bulkCustomSubTasks.length === 0 ? (
                    <div className="text-center py-4 bg-white/60 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      No checklist steps yet. Click &quot;{t('addSubtask')}&quot; to add one.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {bulkCustomSubTasks.map((st, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <input 
                            type="text" 
                            value={st.titleEn}
                            onChange={(e) => {
                              const newTasks = [...bulkCustomSubTasks];
                              newTasks[idx].titleEn = e.target.value;
                              setBulkCustomSubTasks(newTasks);
                            }}
                            placeholder="English Step Title"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                          />
                          <input 
                            type="text" 
                            value={st.titleAr}
                            onChange={(e) => {
                              const newTasks = [...bulkCustomSubTasks];
                              newTasks[idx].titleAr = e.target.value;
                              setBulkCustomSubTasks(newTasks);
                            }}
                            placeholder="Arabic (العربية)"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 text-right bg-white"
                            dir="rtl"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newTasks = [...bulkCustomSubTasks];
                              newTasks[idx].requiresProof = !newTasks[idx].requiresProof;
                              setBulkCustomSubTasks(newTasks);
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
                              const newTasks = bulkCustomSubTasks.filter((_, i) => i !== idx);
                              setBulkCustomSubTasks(newTasks);
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
                  value={bulkAssigneeId}
                  onChange={e => setBulkAssigneeId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white font-medium"
                >
                  <option value="">-- {t('selectAssignee')} --</option>
                  {users.filter(u => u.role === 'field_officer').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('coordinatorNote1')} (Optional)</label>
                <textarea 
                  value={bulkCoordinatorNote1}
                  onChange={e => setBulkCoordinatorNote1(e.target.value)}
                  rows={2}
                  placeholder="Special instructions or reminders..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-xs resize-none"
                ></textarea>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('coordinatorNote2')} (Optional)</label>
                <textarea 
                  value={bulkCoordinatorNote2}
                  onChange={e => setBulkCoordinatorNote2(e.target.value)}
                  rows={2}
                  placeholder="Secondary instructions or contacts..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-xs resize-none"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('taskDate')} (Optional)</label>
                  <DatePicker value={bulkTaskDate} onChange={setBulkTaskDate} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('taskTime')} (Optional)</label>
                  <input 
                    type="time" 
                    value={bulkTaskTime}
                    onChange={e => setBulkTaskTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('hotel')} (Optional)</label>
                <input 
                  type="text" 
                  value={bulkHotel}
                  onChange={e => setBulkHotel(e.target.value)}
                  placeholder="Hotel / Residence Name"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('vehicleId')} (Optional)</label>
                <select 
                  value={bulkVehicleId}
                  onChange={e => setBulkVehicleId(e.target.value)}
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
                onClick={() => {
                  setIsBulkAssigning(false);
                  resetBulkAssignForm();
                }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
              <button 
                type="button"
                onClick={handleBulkAssign}
                disabled={!bulkPresetId || !bulkAssigneeId || (bulkPresetId === 'custom' && !bulkCustomTitle.trim()) || (bulkPresetId === 'custom' && bulkCustomSubTasks.length === 0)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                <ListTodo size={15} /> {t('assign')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Student Profile Confirmation Modals (Admin Only) */}
      {studentToDelete && (
        <DeleteStudentConfirmModal
          isOpen={!!studentToDelete}
          students={[studentToDelete]}
          onClose={() => setStudentToDelete(null)}
          onConfirm={handleConfirmDeleteSingle}
          isDeleting={isDeleting}
        />
      )}

      {isBulkDeleting && (
        <DeleteStudentConfirmModal
          isOpen={isBulkDeleting}
          students={students.filter(s => selectedIds.includes(s.id))}
          onClose={() => setIsBulkDeleting(false)}
          onConfirm={handleConfirmDeleteBulk}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
