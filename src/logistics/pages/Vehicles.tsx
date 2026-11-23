// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Vehicle, VehicleLog, VehicleStatus } from '../types';
import { Car, Filter, RotateCcw, Wrench, ShieldAlert, ShieldCheck, Plus, Search, MapPin, Gauge, Fuel, CheckCircle2, History, Camera, DollarSign, RefreshCw, Pencil, Trash2, AlertTriangle, X, ArrowLeft, Play, Square, AlertCircle, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image as ImageIcon, ImagePlus, ExternalLink, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { addWatermark, getCurrentGpsLocation, prepareImageFile } from '../utils/watermark';
import { LocalImagePreview } from '../components/LocalImagePreview';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskStatusBadgeClasses,
  getTaskSubjectName,
} from '../utils/taskClassification';
import toast from 'react-hot-toast';

export default function Vehicles() {
  const { 
    currentUser, vehicles, vehicleLogs, tasks, presets, students, users, 
    addVehicle, updateVehicle, deleteVehicle, createVehicleLog, updateVehicleLog, t 
  } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fieldOfficerPreview, setFieldOfficerPreview] = useState<{ url: string; title: string; subtitle?: string; km?: string | number } | null>(null);
  const [lightboxData, setLightboxData] = useState<{ photos: string[]; currentIndex: number; title: string; subtitle?: string } | null>(null);
  const [inspectingLog, setInspectingLog] = useState<VehicleLog | null>(null);
  const [fieldOfficerTab, setFieldOfficerTab] = useState<'log' | 'registry'>('log');
  const [selectedCheckInVehicleId, setSelectedCheckInVehicleId] = useState<string>('');
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'registry' | 'logs'>('registry');
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<string>('all');
  const [insuranceStatusFilter, setInsuranceStatusFilter] = useState<string>('all');
  const [maintenanceAlertFilter, setMaintenanceAlertFilter] = useState<string>('all');

  const [logOfficerFilter, setLogOfficerFilter] = useState<string>('all');
  const [logVehicleFilter, setLogVehicleFilter] = useState<string>('all');
  const [logFromDate, setLogFromDate] = useState<string>('');
  const [logToDate, setLogToDate] = useState<string>('');
  const [logIssuesFilter, setLogIssuesFilter] = useState<string>('all');
  const [logReceiptsFilter, setLogReceiptsFilter] = useState<string>('all');
  const [logSearchTerm, setLogSearchTerm] = useState<string>('');

  const canManageVehicles = currentUser?.role === 'admin' || currentUser?.role === 'coordinator';
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Map of vehicleId -> active (open) VehicleLog session (checked out / in use)
  const activeLogByVehicleId = useMemo(() => {
    const map = new Map<string, VehicleLog>();
    // Sort logs by startTime ascending so later open logs overwrite earlier ones if any
    const openLogs = vehicleLogs
      .filter(l => Boolean(l.startTime) && !l.endTime)
      .sort((a, b) => new Date(a.startTime || a.date).getTime() - new Date(b.startTime || b.date).getTime());
    for (const log of openLogs) {
      map.set(log.vehicleId, log);
    }
    return map;
  }, [vehicleLogs]);

  const getActiveLogForVehicle = (vehicleId: string): VehicleLog | undefined => {
    return activeLogByVehicleId.get(vehicleId);
  };

  const isVehicleCheckedOut = (vehicleId: string): boolean => {
    return activeLogByVehicleId.has(vehicleId);
  };

  // Retrieve latest saved odometer reading for a vehicle (from vehicle record and all logs in vehicleLogs)
  const getVehicleLastOdometer = (vehicleId?: string): number => {
    if (!vehicleId) return 0;
    const vehicle = vehicles.find(v => v.id === vehicleId);
    const vehicleDocOdo = Math.max(
      0,
      Number(vehicle?.currentOdometer) || 0,
      Number(vehicle?.lastOdometer) || 0,
      Number(vehicle?.mileage) || 0
    );

    let maxLogOdo = 0;
    for (const log of vehicleLogs) {
      if (log.vehicleId === vehicleId) {
        const sKm = Number(log.startKm);
        const eKm = Number(log.endKm);
        if (!isNaN(sKm) && sKm > maxLogOdo) maxLogOdo = sKm;
        if (!isNaN(eKm) && eKm > maxLogOdo) maxLogOdo = eKm;
      }
    }

    return Math.max(vehicleDocOdo, maxLogOdo);
  };

  // Available fleet vehicles for Check-In: status === 'active' and not currently checked out in an active session
  const availableVehicles = useMemo(() => {
    return vehicles.filter(v => v.status === 'active' && !activeLogByVehicleId.has(v.id));
  }, [vehicles, activeLogByVehicleId]);

  // Keep selectedCheckInVehicleId synced with availableVehicles
  useEffect(() => {
    if (availableVehicles.length === 0) {
      if (selectedCheckInVehicleId !== '') {
        setSelectedCheckInVehicleId('');
      }
      return;
    }
    const stillAvailable = availableVehicles.some(v => v.id === selectedCheckInVehicleId);
    if (!stillAvailable) {
      // Prefer vehicle previously associated with currentUser if available, else first available vehicle
      const preferred = availableVehicles.find(v => v.assignedOfficerId === currentUser?.id);
      setSelectedCheckInVehicleId(preferred ? preferred.id : availableVehicles[0].id);
    }
  }, [availableVehicles, selectedCheckInVehicleId, currentUser?.id]);

  // Active (open) trip session(s) for the current officer
  const myActiveLogs = useMemo(() => {
    if (!currentUser) return [];
    return vehicleLogs
      .filter(l => l.userId === currentUser.id && Boolean(l.startTime) && !l.endTime)
      .sort((a, b) => new Date(b.startTime || b.date).getTime() - new Date(a.startTime || a.date).getTime());
  }, [vehicleLogs, currentUser]);

  const activeOfficerLog = myActiveLogs[0] || null;
  const activeOfficerVehicle = activeOfficerLog
    ? vehicles.find(v => v.id === activeOfficerLog.vehicleId) || null
    : null;

  // All trip logs recorded by the current officer today (sorted newest first)
  const myTodayLogs = useMemo(() => {
    if (!currentUser) return [];
    return vehicleLogs
      .filter(l => l.userId === currentUser.id && l.date === todayStr)
      .sort((a, b) => new Date(b.startTime || b.date).getTime() - new Date(a.startTime || a.date).getTime());
  }, [vehicleLogs, currentUser, todayStr]);

    // Evaluate insurance expiry status (expired < 0 days, expiring_soon <= 30 days, valid > 30 days)
  const getInsuranceStatus = (expiryDateStr?: string): {
    status: 'unset' | 'expired' | 'expiring_soon' | 'valid';
    daysLeft: number | null;
  } => {
    if (!expiryDateStr) return { status: 'unset', daysLeft: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = expiryDateStr.split('-').map(Number);
    const expDate =
      parts.length === 3 && parts[0] && parts[1] && parts[2]
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(expiryDateStr);
    if (isNaN(expDate.getTime())) return { status: 'unset', daysLeft: null };
    expDate.setHours(0, 0, 0, 0);
    const diffMs = expDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { status: 'expired', daysLeft };
    if (daysLeft <= 30) return { status: 'expiring_soon', daysLeft };
    return { status: 'valid', daysLeft };
  };

  // Compute maintenance metrics for a vehicle
  const getMaintenanceMetrics = (vehicle: Vehicle) => {
    const currentOdo = getVehicleLastOdometer(vehicle.id);
    const lastMaintKm = Number(vehicle.lastMaintenanceKm) || 0;
    const nextDueKm =
      vehicle.nextMaintenanceDueKm !== undefined
        ? Number(vehicle.nextMaintenanceDueKm)
        : lastMaintKm + 10000;
    const kmSinceLast = Math.max(0, currentOdo - lastMaintKm);
    const isMaintenanceDue = currentOdo > 0 && kmSinceLast >= 10000;
    const remainingKm = Math.max(0, nextDueKm - currentOdo);

    return {
      currentOdo,
      lastMaintKm,
      nextDueKm,
      kmSinceLast,
      isMaintenanceDue,
      remainingKm,
    };
  };

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const activeRegistryFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (driverFilter !== 'all') count++;
    if (vehicleStatusFilter !== 'all') count++;
    if (insuranceStatusFilter !== 'all') count++;
    if (maintenanceAlertFilter !== 'all') count++;
    return count;
  }, [searchTerm, driverFilter, vehicleStatusFilter, insuranceStatusFilter, maintenanceAlertFilter]);

  const handleClearRegistryFilters = () => {
    setSearchTerm('');
    setDriverFilter('all');
    setVehicleStatusFilter('all');
    setInsuranceStatusFilter('all');
    setMaintenanceAlertFilter('all');
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // 1. Search Query Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = v.name.toLowerCase().includes(q);
        const matchPlate = v.plateNumber.toLowerCase().includes(q);
        if (!matchName && !matchPlate) return false;
      }

      // 2. Current/Last Logistics Driver
      const activeLog = activeLogByVehicleId.get(v.id);
      const driverId = activeLog ? activeLog.userId : v.assignedOfficerId;
      if (driverFilter !== 'all') {
        if (driverFilter === 'unassigned') {
          if (driverId) return false;
        } else if (driverId !== driverFilter) {
          return false;
        }
      }

      // 3. Vehicle Status Filter
      if (vehicleStatusFilter !== 'all') {
        const isCheckedOut = Boolean(activeLog);
        if (vehicleStatusFilter === 'checked_out') {
          if (!isCheckedOut) return false;
        } else if (vehicleStatusFilter === 'available') {
          if (isCheckedOut || v.status !== 'active') return false;
        } else if (v.status !== vehicleStatusFilter) {
          return false;
        }
      }

      // 4. Insurance Status Filter
      if (insuranceStatusFilter !== 'all') {
        const ins = getInsuranceStatus(v.insuranceExpiryDate);
        if (ins.status !== insuranceStatusFilter) return false;
      }

      // 5. Maintenance Alert Filter
      if (maintenanceAlertFilter !== 'all') {
        const maint = getMaintenanceMetrics(v);
        if (maintenanceAlertFilter === 'due' && !maint.isMaintenanceDue) return false;
        if (maintenanceAlertFilter === 'ok' && maint.isMaintenanceDue) return false;
      }

      return true;
    });
  }, [vehicles, searchTerm, driverFilter, vehicleStatusFilter, insuranceStatusFilter, maintenanceAlertFilter, activeLogByVehicleId]);

  const activeLogFilterCount = useMemo(() => {
    let count = 0;
    if (logSearchTerm.trim()) count++;
    if (logOfficerFilter !== 'all') count++;
    if (logVehicleFilter !== 'all') count++;
    if (logFromDate) count++;
    if (logToDate) count++;
    if (logIssuesFilter !== 'all') count++;
    if (logReceiptsFilter !== 'all') count++;
    return count;
  }, [logSearchTerm, logOfficerFilter, logVehicleFilter, logFromDate, logToDate, logIssuesFilter, logReceiptsFilter]);

  const handleClearLogFilters = () => {
    setLogSearchTerm('');
    setLogOfficerFilter('all');
    setLogVehicleFilter('all');
    setLogFromDate('');
    setLogToDate('');
    setLogIssuesFilter('all');
    setLogReceiptsFilter('all');
  };

  const filteredVehicleLogs = useMemo(() => {
    return vehicleLogs.filter(log => {
      // 1. Officer Filter
      if (logOfficerFilter !== 'all' && log.userId !== logOfficerFilter) return false;

      // 2. Vehicle Filter
      if (logVehicleFilter !== 'all' && log.vehicleId !== logVehicleFilter) return false;

      // 3. Date Range Filter
      const logDate = log.date || (log.startTime ? log.startTime.slice(0, 10) : '');
      if (logFromDate && logDate < logFromDate) return false;
      if (logToDate && logDate > logToDate) return false;

      // 4. Has Reported Issues Filter
      const hasIssues = Boolean(log.issueNotes?.trim() || (log.issueMediaUrls && log.issueMediaUrls.length > 0));
      if (logIssuesFilter === 'with_issues' && !hasIssues) return false;
      if (logIssuesFilter === 'no_issues' && hasIssues) return false;

      // 5. Has Fuel Receipts Filter
      const hasReceipts = Boolean(log.fuelReceiptUrl || (log.fuelExpense && log.fuelExpense.receiptUrl));
      if (logReceiptsFilter === 'with_receipts' && !hasReceipts) return false;
      if (logReceiptsFilter === 'no_receipts' && hasReceipts) return false;

      // 6. Search query
      if (logSearchTerm.trim()) {
        const q = logSearchTerm.toLowerCase().trim();
        const officer = users.find(u => u.id === log.userId);
        const vehicle = vehicles.find(v => v.id === log.vehicleId);
        const matchOfficer = officer?.name?.toLowerCase().includes(q) || false;
        const matchVehicleName = vehicle?.name?.toLowerCase().includes(q) || false;
        const matchPlate = vehicle?.plateNumber?.toLowerCase().includes(q) || false;
        const matchNotes = (
          log.issueNotes?.toLowerCase().includes(q) ||
          log.notes?.toLowerCase().includes(q) ||
          log.checkInNotes?.toLowerCase().includes(q) ||
          log.checkOutNotes?.toLowerCase().includes(q)
        ) || false;
        const matchStartLoc = log.startLocation?.toLowerCase().includes(q) || false;
        const matchEndLoc = log.endLocation?.toLowerCase().includes(q) || false;
        if (!matchOfficer && !matchVehicleName && !matchPlate && !matchNotes && !matchStartLoc && !matchEndLoc) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const tA = new Date(a.startTime || a.date).getTime();
      const tB = new Date(b.startTime || b.date).getTime();
      return tB - tA;
    });
  }, [vehicleLogs, logOfficerFilter, logVehicleFilter, logFromDate, logToDate, logIssuesFilter, logReceiptsFilter, logSearchTerm, users, vehicles]);

  // Check-In handler (Start Trip Session)
  const handleCheckInSubmit = async (
    vehicleId: string, 
    data: { 
      km: string; 
      dashboardFile?: File | null; 
      dashboardPhotoUrl?: string;
      checkInPhotos?: string[];
      inspectionFiles?: File[];
      locationStr: string;
      notes?: string;
      onProgress?: (progress: { current: number; total: number; message: string }) => void;
    }
  ) => {
    if (!currentUser) return;
    const targetVehicle = vehicles.find(v => v.id === vehicleId);
    if (!targetVehicle) {
      toast.error('Please select a valid available vehicle');
      throw new Error('Invalid vehicle');
    }
    if (targetVehicle.status !== 'active' || isVehicleCheckedOut(targetVehicle.id)) {
      toast.error('Selected vehicle is no longer available for check-in');
      throw new Error('Vehicle unavailable');
    }

    const latestOdo = getVehicleLastOdometer(targetVehicle.id);
    const numericKm = Number(data.km);

    if (!data.km || isNaN(numericKm) || numericKm < latestOdo) {
      const msg = `Odometer reading must be greater than or equal to the last recorded reading of ${latestOdo} km`;
      toast.error(msg);
      throw new Error(msg);
    }

    // 1. Dashboard Proof (Directly uploaded or fallback watermarked upload)
    let dashboardPhotoUrl = data.dashboardPhotoUrl || '';
    if (!dashboardPhotoUrl && data.dashboardFile) {
      const watermarked = await addWatermark(data.dashboardFile, data.locationStr);
      const fileRef = ref(storage, `vehicle_logs/${targetVehicle.id}_${Date.now()}_start_dashboard.jpg`);
      await uploadBytes(fileRef, watermarked);
      dashboardPhotoUrl = await getDownloadURL(fileRef);
    }

    // 2. Inspection Photos (Directly uploaded or fallback concurrent batch)
    const checkInPhotos: string[] = [...(data.checkInPhotos || [])];
    if (checkInPhotos.length === 0 && data.inspectionFiles && data.inspectionFiles.length > 0) {
      const uploadBatchId = Date.now();
      const uploadedUrls = await Promise.all(
        data.inspectionFiles.map(async (file: File, i: number) => {
          const watermarkedBlob = await addWatermark(file, data.locationStr);
          const inspectionRef = ref(
            storage,
            `vehicle_logs/${targetVehicle.id}_${uploadBatchId}_inspection_${i}.jpg`
          );
          await uploadBytes(inspectionRef, watermarkedBlob);
          return getDownloadURL(inspectionRef);
        })
      );
      checkInPhotos.push(...uploadedUrls);
    }

    const nowIso = new Date().toISOString();
    const enteredNotes = data.notes?.trim() || undefined;

    await createVehicleLog({
      vehicleId: targetVehicle.id,
      userId: currentUser.id,
      date: todayStr,
      startTime: nowIso,
      startKm: String(numericKm),
      dashboardPhotoUrl,
      startDashboardPhoto: dashboardPhotoUrl,
      startDashboardPhotoUrl: dashboardPhotoUrl,
      checkInPhotos,
      notes: enteredNotes,
      checkInNotes: enteredNotes,
    });

    await updateVehicle(targetVehicle.id, {
      currentOdometer: numericKm,
      lastOdometer: numericKm,
      mileage: numericKm,
      isCheckedOut: true,
      assignedOfficerId: currentUser.id,
    });

    toast.success(
      checkInPhotos.length > 0
        ? `Checked in ${targetVehicle.name} (${targetVehicle.plateNumber}) with ${checkInPhotos.length} live condition photos at ${numericKm} km!`
        : `Checked in ${targetVehicle.name} (${targetVehicle.plateNumber}) at ${numericKm} km!`
    );
    setCheckInModalOpen(false);
  };

  // Check-Out handler (End Trip Session)
  const handleCheckOutSubmit = async (
    logToClose: VehicleLog, 
    data: { 
      km: string; 
      dashboardFile?: File | null; 
      dashboardPhotoUrl?: string;
      locationStr: string; 
      notes?: string;
    }
  ) => {
    const targetVehicle = vehicles.find(v => v.id === logToClose.vehicleId);
    const latestOdo = Math.max(
      getVehicleLastOdometer(logToClose.vehicleId),
      Number(logToClose.startKm) || 0
    );
    const numericKm = Number(data.km);

    if (!data.km || isNaN(numericKm) || numericKm < latestOdo) {
      const msg = `Odometer reading must be greater than or equal to the last recorded reading of ${latestOdo} km`;
      toast.error(msg);
      throw new Error(msg);
    }

    let dashboardPhotoUrl = data.dashboardPhotoUrl || '';
    if (!dashboardPhotoUrl && data.dashboardFile) {
      const watermarked = await addWatermark(data.dashboardFile, data.locationStr);
      const fileRef = ref(storage, `vehicle_logs/${logToClose.vehicleId}_${Date.now()}_end_dashboard.jpg`);
      await uploadBytes(fileRef, watermarked);
      dashboardPhotoUrl = await getDownloadURL(fileRef);
    }

    const nowIso = new Date().toISOString();
    const checkOutNotes = data.notes?.trim() || undefined;
    const updatedNotes = checkOutNotes
      ? (logToClose.checkInNotes ? `${logToClose.checkInNotes}\n[Check-Out]: ${checkOutNotes}` : checkOutNotes)
      : (logToClose.notes || logToClose.checkInNotes);

    await updateVehicleLog(logToClose.id, {
      endTime: nowIso,
      endKm: numericKm,
      endDashboardPhoto: dashboardPhotoUrl,
      endDashboardPhotoUrl: dashboardPhotoUrl,
      endPhotoUrl: dashboardPhotoUrl,
      checkOutNotes,
      notes: updatedNotes,
    });

    if (targetVehicle) {
      await updateVehicle(targetVehicle.id, {
        currentOdometer: numericKm,
        lastOdometer: numericKm,
        mileage: numericKm,
        isCheckedOut: false,
      });
    }

    toast.success(`Trip checked out at ${numericKm} km!`);
    setCheckInModalOpen(false);
  };

  const handleSaveEditVehicle = async (updatedData: Partial<Vehicle>) => {
    if (!editingVehicle) return;
    try {
      await updateVehicle(editingVehicle.id, updatedData);
      toast.success(t('vehicleUpdated') || 'Vehicle updated successfully');
      setEditingVehicle(null);
    } catch (err: any) {
      console.error('Error updating vehicle:', err);
      toast.error(err?.message || 'Failed to update vehicle');
    }
  };

  const handleConfirmDeleteVehicle = async () => {
    if (!deletingVehicle) return;
    setIsDeleting(true);
    try {
      await deleteVehicle(deletingVehicle.id);
      toast.success(t('vehicleRemoved') || 'Vehicle removed successfully');
      setDeletingVehicle(null);
    } catch (err: any) {
      console.error('Error deleting vehicle:', err);
      toast.error(err?.message || 'Failed to remove vehicle');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderVehicleGrid = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Search vehicles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
        />
      </div>

      {filteredVehicles.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <Car size={40} className="mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">No vehicles found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map(vehicle => {
            const activeLog = getActiveLogForVehicle(vehicle.id);
            const isCheckedOut = Boolean(activeLog);
            const activeDriver = activeLog ? users.find(u => u.id === activeLog.userId) : null;
            const lastOfficer = users.find(u => u.id === vehicle.assignedOfficerId);
            const lastOdo = getVehicleLastOdometer(vehicle.id);

            return (
              <div 
                key={vehicle.id} 
                className="p-4 border border-slate-200 rounded-xl hover:border-red-300 transition-all cursor-pointer bg-white flex flex-col justify-between hover:shadow-sm"
                onClick={() => setSelectedVehicle(vehicle)}
              >
                <div>
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${isCheckedOut ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                        <Car size={24} />
                      </div>
                      <div className="truncate">
                        <h3 className="font-semibold text-slate-800 truncate">{vehicle.name}</h3>
                        <p className="text-sm font-mono text-slate-500">{vehicle.plateNumber}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        vehicle.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        vehicle.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {t(vehicle.status as any) || vehicle.status}
                      </span>
                      {vehicle.status === 'active' && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                          isCheckedOut
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isCheckedOut ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                          {isCheckedOut ? 'In Use / Checked Out' : 'Available'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 text-sm text-slate-600">
                    <div className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1.5 text-xs font-medium">
                        <Gauge size={14} className="text-red-600" />
                        Last Odometer:
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-xs">{lastOdo} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('vehicleColor')}:</span>
                      <span>{vehicle.color || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('vehicleYear')}:</span>
                      <span>{vehicle.year || '—'}</span>
                    </div>
                    {vehicle.capacity !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">{t('vehicleCapacity') || 'Capacity'}:</span>
                        <span>{vehicle.capacity} seats</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">{isCheckedOut ? 'Checked Out By:' : 'Last Driver:'}</span>
                      <span className="font-medium text-slate-800">
                        {isCheckedOut ? (activeDriver?.name || 'Active Officer') : (lastOfficer?.name || 'Available')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 mt-4 border-t border-slate-100">
                  {currentUser?.role === 'field_officer' && vehicle.status === 'active' && !isCheckedOut && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCheckInVehicleId(vehicle.id);
                        setFieldOfficerTab('log');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Play size={12} />
                      <span>Select for Check-In</span>
                    </button>
                  )}
                  {currentUser?.role === 'field_officer' && isCheckedOut && activeLog?.userId === currentUser.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFieldOfficerTab('log');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Square size={12} />
                      <span>Go to Check-Out</span>
                    </button>
                  )}

                  {canManageVehicles && (
                    <div className="flex items-center justify-end gap-2 ml-auto">
                      <button
                        type="button"
                        title={t('editVehicle')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingVehicle(vehicle);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                      >
                        <Pencil size={14} />
                        <span>{t('editVehicle')}</span>
                      </button>
                      <button
                        type="button"
                        title={t('removeVehicle')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingVehicle(vehicle);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                        <span>{t('removeVehicle')}</span>
                      </button>
                    </div>
                  )}
                  {!canManageVehicles && currentUser?.role !== 'field_officer' && (
                    <div className="flex items-center justify-between w-full text-xs text-slate-500 font-medium">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <History size={13} className="text-red-600" />
                        <span>Click card to inspect logs, odometer deltas & photos</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Admin/Coordinator View
  if (currentUser?.role === 'admin' || currentUser?.role === 'coordinator') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('vehicles')}</h1>
            <p className="text-sm text-slate-500">Fleet management and operational telemetry</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => setCheckInModalOpen(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors shadow-sm cursor-pointer font-medium text-sm"
            >
              <Gauge size={18} />
              <span>Trip Check-In / Out</span>
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20 cursor-pointer font-medium text-sm"
            >
              <Plus size={20} />
              <span className="font-medium">{t('addVehicle')}</span>
            </button>
          </div>
        </div>

        <div className="flex bg-slate-200/80 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setAdminTab('registry')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              adminTab === 'registry'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('fleetRegistry') || 'Fleet Registry'}
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('logs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              adminTab === 'logs'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Vehicle Trip Logs ({vehicleLogs.length})
          </button>
        </div>

        {adminTab === 'registry' ? renderVehicleGrid() : renderVehicleLogsTable()}

        {checkInModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 relative">
              <button
                type="button"
                onClick={() => setCheckInModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
              {renderTripSessionPanel()}
            </div>
          </div>
        )}

        {showAddModal && (
          <AddVehicleModal 
            onClose={() => setShowAddModal(false)}
            onSave={async (v: any) => { 
              try {
                await addVehicle(v);
                toast.success('Vehicle added successfully');
                setShowAddModal(false);
              } catch (e: any) {
                toast.error(e?.message || 'Failed to add vehicle');
              }
            }}
            users={users.filter(u => u.role === 'field_officer')}
            t={t}
          />
        )}

        {selectedVehicle && (
          <VehicleHistoryModal 
            vehicle={selectedVehicle}
            logs={vehicleLogs.filter(l => l.vehicleId === selectedVehicle.id)}
            vehicleTasks={tasks.filter(task => task.vehicleId === selectedVehicle.id)}
            presets={presets}
            users={users}
            canManageVehicles={true}
            lastOdometer={getVehicleLastOdometer(selectedVehicle.id)}
            isCheckedOut={isVehicleCheckedOut(selectedVehicle.id)}
            onClose={() => setSelectedVehicle(null)}
            onOpenLightbox={(photos: string[], index: number, title: string, subtitle?: string) => {
              setLightboxData({ photos, currentIndex: index, title, subtitle });
            }}
            t={t}
          />
        )}

        {inspectingLog && (
          <VehicleLogInspectionModal
            log={inspectingLog}
            vehicle={vehicles.find(v => v.id === inspectingLog.vehicleId)}
            officer={users.find(u => u.id === inspectingLog.userId)}
            onClose={() => setInspectingLog(null)}
            onOpenLightbox={(photos: string[], index: number, title: string, subtitle?: string) => {
              setLightboxData({ photos, currentIndex: index, title, subtitle });
            }}
          />
        )}

        {lightboxData && (
          <InspectionLightboxModal
            photos={lightboxData.photos}
            initialIndex={lightboxData.currentIndex}
            title={lightboxData.title}
            subtitle={lightboxData.subtitle}
            onClose={() => setLightboxData(null)}
          />
        )}

        {editingVehicle && (
          <EditVehicleModal
            vehicle={editingVehicle}
            users={users.filter(u => u.role === 'field_officer')}
            onClose={() => setEditingVehicle(null)}
            onSave={handleSaveEditVehicle}
            t={t}
          />
        )}

        {deletingVehicle && (
          <DeleteVehicleConfirmModal
            vehicle={deletingVehicle}
            assignedOfficerName={users.find(u => u.id === deletingVehicle.assignedOfficerId)?.name}
            onClose={() => setDeletingVehicle(null)}
            onConfirm={handleConfirmDeleteVehicle}
            isDeleting={isDeleting}
            t={t}
          />
        )}
      </div>
    );
  }

  function renderVehicleLogsTable() {
    return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-sm tracking-tight">Fleet Vehicle Trip Logs</h3>
          <p className="text-xs text-slate-500 mt-0.5">Filter trip shifts by logistics officer, vehicle, date range, issues, and fuel receipts</p>
        </div>

        <div className="flex items-center gap-2.5">
          {activeLogFilterCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs">
              <Filter size={12} />
              <span>{activeLogFilterCount} Active {activeLogFilterCount === 1 ? 'Filter' : 'Filters'}</span>
            </span>
          )}
          {activeLogFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearLogFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          type="text"
          placeholder="Search logs by officer name, vehicle plate, issue notes, or location..."
          value={logSearchTerm}
          onChange={(e) => setLogSearchTerm(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
        />
        {logSearchTerm && (
          <button
            type="button"
            onClick={() => setLogSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Multi-attribute Filter Dropdowns */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
        {/* Logistics Officer Filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Logistics Officer
          </label>
          <select
            value={logOfficerFilter}
            onChange={(e) => setLogOfficerFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          >
            <option value="all">All Field Officers</option>
            {fieldOfficers.map(officer => (
              <option key={officer.id} value={officer.id}>{officer.name}</option>
            ))}
          </select>
        </div>

        {/* Vehicle Filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Vehicle
          </label>
          <select
            value={logVehicleFilter}
            onChange={(e) => setLogVehicleFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          >
            <option value="all">All Vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.plateNumber})</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Date From
          </label>
          <input
            type="date"
            value={logFromDate}
            onChange={(e) => setLogFromDate(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Date To
          </label>
          <input
            type="date"
            value={logToDate}
            onChange={(e) => setLogToDate(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          />
        </div>

        {/* Has Reported Issues Filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Reported Issues
          </label>
          <select
            value={logIssuesFilter}
            onChange={(e) => setLogIssuesFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          >
            <option value="all">All Logs</option>
            <option value="with_issues">With Reported Issues</option>
            <option value="no_issues">No Issues</option>
          </select>
        </div>

        {/* Has Fuel Receipts Filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Fuel Receipts
          </label>
          <select
            value={logReceiptsFilter}
            onChange={(e) => setLogReceiptsFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
          >
            <option value="all">All Receipts</option>
            <option value="with_receipts">With Fuel Receipts</option>
            <option value="no_receipts">No Receipts</option>
          </select>
        </div>
      </div>

      {/* Live Results Counter */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>
          Showing <strong className="text-slate-900 font-bold">{filteredVehicleLogs.length}</strong> of{' '}
          <strong className="text-slate-900 font-bold">{vehicleLogs.length}</strong> fleet trip logs
        </span>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-start text-xs sm:text-sm text-slate-600">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Logistics Officer</th>
              <th className="px-4 py-3">Odometer Delta</th>
              <th className="px-4 py-3">Fuel Receipts</th>
              <th className="px-4 py-3">Inspection Photos</th>
              <th className="px-4 py-3">Reported Issues</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredVehicleLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  No vehicle trip logs match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredVehicleLogs.map(log => {
                const vehicle = vehicles.find(v => v.id === log.vehicleId);
                const officer = users.find(u => u.id === log.userId);
                const startKm = Number(log.startKm) || 0;
                const endKm = Number(log.endKm) || 0;
                const deltaKm = endKm > startKm ? endKm - startKm : 0;
                const hasIssues = Boolean(log.issueNotes?.trim() || (log.issueMediaUrls && log.issueMediaUrls.length > 0));
                const fuelReceipt = log.fuelReceiptUrl || log.fuelExpense?.receiptUrl;

                return (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{log.date || (log.startTime ? log.startTime.slice(0, 10) : 'N/A')}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {log.startTime ? log.startTime.slice(11, 16) : '--:--'} &rarr; {log.endTime ? log.endTime.slice(11, 16) : 'In Progress'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{vehicle?.name || 'Unknown Vehicle'}</div>
                      <div className="text-xs text-slate-500 font-mono">{vehicle?.plateNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700">{officer?.name || 'Staff Member'}</div>
                      <div className="text-[11px] text-slate-400">Field Officer</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{deltaKm > 0 ? `+${deltaKm} km` : (log.endTime ? '0 km' : 'Active')}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {startKm} &rarr; {endKm || '...'} km
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {fuelReceipt ? (
                        <button
                          type="button"
                          onClick={() => setFieldOfficerPreview({
                            url: fuelReceipt,
                            title: 'Fuel Receipt Audit',
                            subtitle: `RM ${log.fuelExpense?.amount || 'N/A'}`
                          })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                        >
                          <Fuel size={12} />
                          <span>RM {log.fuelExpense?.amount || ''}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.checkInPhotos && log.checkInPhotos.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setInspectingLog(log)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                          title="Inspect condition photos"
                        >
                          <Camera size={13} className="text-blue-600" />
                          <span>{log.checkInPhotos.length} {log.checkInPhotos.length === 1 ? 'Photo' : 'Photos'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      {hasIssues ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800">
                            <AlertTriangle size={11} />
                            <span>Issue Reported</span>
                          </span>
                          {log.issueNotes && (
                            <p className="text-xs text-slate-600 line-clamp-1 italic font-medium">"{log.issueNotes}"</p>
                          )}
                          {log.issueMediaUrls && log.issueMediaUrls.length > 0 && (
                            <div className="flex gap-1 pt-0.5">
                              {log.issueMediaUrls.slice(0, 3).map((url, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setFieldOfficerPreview({
                                    url,
                                    title: 'Vehicle Issue Proof',
                                    subtitle: log.issueNotes
                                  })}
                                  className="w-6 h-6 rounded border border-rose-300 overflow-hidden hover:opacity-80 cursor-pointer"
                                >
                                  <img src={url} alt="Proof" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} />
                            <span>No issues</span>
                          </span>
                          {(log.checkInNotes || log.checkOutNotes || log.notes) && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 italic font-medium flex items-center gap-1" title={log.notes || log.checkInNotes || log.checkOutNotes}>
                              <FileText size={10} className="shrink-0 text-slate-400" />
                              <span className="truncate">"{log.notes || log.checkInNotes || log.checkOutNotes}"</span>
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setInspectingLog(log)}
                          className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Inspect Log
                        </button>
                        {vehicle && (
                          <button
                            type="button"
                            onClick={() => setSelectedVehicle(vehicle)}
                            className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                          >
                            Vehicle Card
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    );
  }

  // Helper to render the dynamic Trip Check-In / Check-Out Session Panel
  function renderTripSessionPanel() {
    const selectedCheckInVehicle = availableVehicles.find(v => v.id === selectedCheckInVehicleId) || null;
    const selectedVehicleLastOdo = selectedCheckInVehicle ? getVehicleLastOdometer(selectedCheckInVehicle.id) : 0;
    const activeVehicleLastOdo = activeOfficerLog
      ? Math.max(getVehicleLastOdometer(activeOfficerLog.vehicleId), Number(activeOfficerLog.startKm) || 0)
      : 0;

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Active Trip Check-Out OR Dynamic Vehicle Check-In Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {activeOfficerLog ? (
            <>
              {/* Active Checked-Out Session Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                    <Car size={32} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-800">
                        {activeOfficerVehicle?.name || 'Active Fleet Vehicle'}
                      </h2>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        In Use • Checked Out
                      </span>
                    </div>
                    <p className="text-slate-500 font-medium text-sm mt-0.5">
                      {activeOfficerVehicle?.plateNumber} {activeOfficerVehicle?.color ? `• ${activeOfficerVehicle.color}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      {activeOfficerLog.startTime && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          Checked in at {format(new Date(activeOfficerLog.startTime), 'HH:mm')}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Gauge size={12} className="text-red-600" />
                        Start KM: {activeOfficerLog.startKm} km
                      </span>
                    </div>
                  </div>
                </div>

                <FuelRefillModal todaysLog={activeOfficerLog} updateVehicleLog={updateVehicleLog} />
              </div>

              {/* Check-Out Form */}
              <LogForm
                key={`checkout-${activeOfficerLog.id}`}
                type="end"
                vehicle={activeOfficerVehicle}
                lastOdometer={activeVehicleLastOdo}
                startKm={activeOfficerLog.startKm}
                onSubmit={async (data: any) => {
                  await handleCheckOutSubmit(activeOfficerLog, data);
                }}
                t={t}
              />
            </>
          ) : (
            <>
              {/* Dynamic Vehicle Check-In Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl shrink-0">
                    <Car size={30} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-800">
                        Vehicle Check-In (Start Trip)
                      </h2>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {availableVehicles.length} Available
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Select any active available vehicle to begin a new trip session
                    </p>
                  </div>
                </div>
                {myTodayLogs.length > 0 && (
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold shrink-0">
                    Trip #{myTodayLogs.length + 1} Today
                  </span>
                )}
              </div>

              {/* Dynamic Available Vehicle Selector Dropdown */}
              <div className="mb-6">
                <label htmlFor="checkin-vehicle-select" className="block text-sm font-semibold text-slate-700 mb-2">
                  Select Available Fleet Vehicle <span className="text-red-500">*</span>
                </label>
                {availableVehicles.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-sm">
                    <AlertCircle size={20} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-semibold">No active vehicles currently available for check-in</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        All active fleet vehicles are currently checked out in active trip sessions or in maintenance.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      id="checkin-vehicle-select"
                      value={selectedCheckInVehicleId}
                      onChange={(e) => setSelectedCheckInVehicleId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm font-medium text-slate-800 cursor-pointer"
                    >
                      <option value="" disabled>-- Select an Available Vehicle --</option>
                      {availableVehicles.map((v) => {
                        const vLastOdo = getVehicleLastOdometer(v.id);
                        return (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.plateNumber}){v.color ? ` • ${v.color}` : ''} — Last Odometer: {vLastOdo} km
                          </option>
                        );
                      })}
                    </select>

                    {selectedCheckInVehicle && (
                      <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-700">
                            <Car size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{selectedCheckInVehicle.name}</span>
                              <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-semibold">
                                {selectedCheckInVehicle.plateNumber}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {selectedCheckInVehicle.color || 'Standard'}
                              {selectedCheckInVehicle.capacity ? ` • ${selectedCheckInVehicle.capacity} seats` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 size={12} />
                            Checked In / Available
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200/80 text-slate-800">
                            <Gauge size={12} className="text-red-600" />
                            {selectedVehicleLastOdo} km
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedCheckInVehicle && (
                <LogForm
                  key={`checkin-${selectedCheckInVehicle.id}`}
                  type="start"
                  vehicle={selectedCheckInVehicle}
                  lastOdometer={selectedVehicleLastOdo}
                  onSubmit={async (data: any) => {
                    await handleCheckInSubmit(selectedCheckInVehicle.id, data);
                  }}
                  t={t}
                />
              )}
            </>
          )}
        </div>

        {/* Multi-Trip Daily Sessions Log Summary */}
        {myTodayLogs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History size={18} className="text-red-600" />
                <h3 className="text-base font-bold text-slate-800">
                  Today's Trip Sessions ({myTodayLogs.length})
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {format(new Date(), 'MMM dd, yyyy')}
              </span>
            </div>

            <div className="space-y-3">
              {myTodayLogs.map((log, index) => {
                const tripNumber = myTodayLogs.length - index;
                const tripVehicle = vehicles.find(v => v.id === log.vehicleId);
                const isTripActive = Boolean(log.startTime) && !log.endTime;
                const startProofUrl = log.dashboardPhotoUrl || log.startDashboardPhoto || log.startDashboardPhotoUrl || log.startOdometerPhoto;
                const endProofUrl = log.endDashboardPhoto || log.endDashboardPhotoUrl || log.endPhotoUrl || log.endOdometerPhoto;
                const distanceKm = log.endKm && log.startKm ? Number(log.endKm) - Number(log.startKm) : null;

                return (
                  <div
                    key={log.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isTripActive
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-800 text-white">
                          Trip #{tripNumber}
                        </span>
                        <span className="font-bold text-slate-800 text-sm">
                          {tripVehicle?.name || 'Vehicle'} ({tripVehicle?.plateNumber || log.vehicleId})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {distanceKm !== null && distanceKm >= 0 && (
                          <span className="px-2.5 py-0.5 bg-red-50 text-red-600 font-bold rounded-full text-xs border border-red-100">
                            +{distanceKm} km
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isTripActive
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isTripActive ? 'In Use / Checked Out' : 'Completed / Checked In'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm bg-white p-3 rounded-lg border border-slate-100">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">
                          Check-In (Start) {log.startTime ? `• ${format(new Date(log.startTime), 'HH:mm')}` : ''}
                        </p>
                        <p className="font-mono font-bold text-slate-800">{log.startKm} km</p>
                        {startProofUrl && (
                          <button
                            type="button"
                            onClick={() => setFieldOfficerPreview({
                              url: startProofUrl,
                              title: `Trip #${tripNumber} Check-In Dashboard Proof`,
                              subtitle: `${tripVehicle?.name || ''} (${tripVehicle?.plateNumber || ''}) • ${log.startTime ? format(new Date(log.startTime), 'HH:mm') : ''}`,
                              km: log.startKm
                            })}
                            className="mt-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Camera size={12} /> View Check-In Proof
                          </button>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">
                          Check-Out (End) {log.endTime ? `• ${format(new Date(log.endTime), 'HH:mm')}` : ''}
                        </p>
                        <p className="font-mono font-bold text-slate-800">
                          {log.endKm !== undefined ? `${log.endKm} km` : 'In Progress'}
                        </p>
                        {endProofUrl && (
                          <button
                            type="button"
                            onClick={() => setFieldOfficerPreview({
                              url: endProofUrl,
                              title: `Trip #${tripNumber} Check-Out Dashboard Proof`,
                              subtitle: `${tripVehicle?.name || ''} (${tripVehicle?.plateNumber || ''}) • ${log.endTime ? format(new Date(log.endTime), 'HH:mm') : ''}`,
                              km: log.endKm
                            })}
                            className="mt-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Camera size={12} /> View Check-Out Proof
                          </button>
                        )}
                      </div>
                    </div>

                    {log.checkInPhotos && log.checkInPhotos.length > 0 && (
                      <VehicleInspectionGallerySection
                        photos={log.checkInPhotos}
                        vehicleName={tripVehicle?.name}
                        plateNumber={tripVehicle?.plateNumber}
                        dateStr={log.startTime ? format(new Date(log.startTime), 'MMM dd, yyyy HH:mm') : log.date}
                        onOpenLightbox={(photos, index, title, subtitle) => {
                          setLightboxData({ photos, currentIndex: index, title, subtitle });
                        }}
                      />
                    )}

                    {(log.checkInNotes || log.checkOutNotes || log.notes) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                        {log.checkInNotes && (
                          <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2 rounded-lg">
                            <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                            <span><strong className="text-slate-700 font-medium">Check-In Note:</strong> {log.checkInNotes}</span>
                          </div>
                        )}
                        {log.checkOutNotes && (
                          <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2 rounded-lg">
                            <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                            <span><strong className="text-slate-700 font-medium">Check-Out Note:</strong> {log.checkOutNotes}</span>
                          </div>
                        )}
                        {!log.checkInNotes && !log.checkOutNotes && log.notes && (
                          <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2 rounded-lg">
                            <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                            <span><strong className="text-slate-700 font-medium">Note:</strong> {log.notes}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Field Officer View
  if (currentUser?.role === 'field_officer') {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('vehicles')}</h1>
            <p className="text-sm text-slate-500">Multi-trip daily vehicle check-in, check-out, and fleet registry</p>
          </div>
          <div className="flex bg-slate-200/80 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setFieldOfficerTab('log')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                fieldOfficerTab === 'log'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('myShiftLog') || 'My Daily Log'}
            </button>
            <button
              type="button"
              onClick={() => setFieldOfficerTab('registry')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                fieldOfficerTab === 'registry'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('fleetRegistry') || 'Fleet Registry'}
            </button>
          </div>
        </div>

        {fieldOfficerTab === 'log' ? (
          renderTripSessionPanel()
        ) : (
          renderVehicleGrid()
        )}

        {selectedVehicle && (
          <VehicleHistoryModal 
            vehicle={selectedVehicle}
            logs={vehicleLogs.filter(l => l.vehicleId === selectedVehicle.id)}
            vehicleTasks={tasks.filter(task => task.vehicleId === selectedVehicle.id)}
            presets={presets}
            users={users}
            canManageVehicles={false}
            lastOdometer={getVehicleLastOdometer(selectedVehicle.id)}
            isCheckedOut={isVehicleCheckedOut(selectedVehicle.id)}
            onClose={() => setSelectedVehicle(null)}
            onOpenLightbox={(photos: string[], index: number, title: string, subtitle?: string) => {
              setLightboxData({ photos, currentIndex: index, title, subtitle });
            }}
            t={t}
          />
        )}

        {fieldOfficerPreview && (
          <AuditPhotoModal 
            photo={fieldOfficerPreview} 
            onClose={() => setFieldOfficerPreview(null)} 
          />
        )}

        {lightboxData && (
          <InspectionLightboxModal
            photos={lightboxData.photos}
            initialIndex={lightboxData.currentIndex}
            title={lightboxData.title}
            subtitle={lightboxData.subtitle}
            onClose={() => setLightboxData(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('vehicles')}</h1>
          <p className="text-sm text-slate-500">Read-only fleet inspection, odometer deltas (startKm to endKm), and watermarked dashboard/fuel receipt audits</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
          <History size={14} className="text-red-600" />
          <span>Read-Only Audit Mode</span>
        </span>
      </div>
      {renderVehicleGrid()}
      {selectedVehicle && (
        <VehicleHistoryModal 
          vehicle={selectedVehicle}
          logs={vehicleLogs.filter(l => l.vehicleId === selectedVehicle.id)}
          vehicleTasks={tasks.filter(task => task.vehicleId === selectedVehicle.id)}
          presets={presets}
          users={users}
          canManageVehicles={false}
          lastOdometer={getVehicleLastOdometer(selectedVehicle.id)}
          isCheckedOut={isVehicleCheckedOut(selectedVehicle.id)}
          onClose={() => setSelectedVehicle(null)}
          onOpenLightbox={(photos: string[], index: number, title: string, subtitle?: string) => {
            setLightboxData({ photos, currentIndex: index, title, subtitle });
          }}
          t={t}
        />
      )}

      {lightboxData && (
        <InspectionLightboxModal
          photos={lightboxData.photos}
          initialIndex={lightboxData.currentIndex}
          title={lightboxData.title}
          subtitle={lightboxData.subtitle}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
}

// ---------------- Helper Components ----------------

function AuditPhotoModal({ 
  photo, 
  onClose 
}: { 
  photo: { url: string; title: string; subtitle?: string; km?: string | number }; 
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Gauge size={18} className="text-red-600" />
              {photo.title}
            </h3>
            {photo.subtitle && <p className="text-xs text-slate-500 mt-0.5">{photo.subtitle}</p>}
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-slate-900 flex items-center justify-center min-h-[300px]">
          <img 
            src={photo.url} 
            alt={photo.title} 
            className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md" 
          />
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            {photo.km !== undefined && (
              <span className="bg-slate-200/80 text-slate-800 px-2.5 py-1 rounded-md font-semibold">
                {photo.km} km
              </span>
            )}
            <span className="text-slate-500">
              GPS & timestamp watermarked at bottom of image
            </span>
          </div>
          <a 
            href={photo.url} 
            target="_blank" 
            rel="noreferrer" 
            className="text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1 hover:underline"
          >
            Open Full Resolution ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function AddVehicleModal({ onClose, onSave, users, t }: any) {
  const [formData, setFormData] = useState({
    name: '', plateNumber: '', color: '', year: '', capacity: '', currentOdometer: '', status: 'active' as VehicleStatus, assignedOfficerId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.plateNumber.trim()) {
      toast.error('Vehicle Name and Plate Number are required');
      return;
    }
    const payload: any = {
      name: formData.name.trim(),
      plateNumber: formData.plateNumber.trim().toUpperCase(),
      color: formData.color.trim() || undefined,
      year: formData.year.trim() || undefined,
      status: formData.status,
      assignedOfficerId: formData.assignedOfficerId || undefined
    };
    if (formData.capacity) {
      const parsed = Number(formData.capacity);
      if (!isNaN(parsed) && parsed > 0) payload.capacity = parsed;
    }
    if (formData.currentOdometer !== '') {
      const parsedOdo = Number(formData.currentOdometer);
      if (!isNaN(parsedOdo) && parsedOdo >= 0) {
        payload.currentOdometer = parsedOdo;
        payload.lastOdometer = parsedOdo;
        payload.mileage = parsedOdo;
      }
    }
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">{t('addVehicle')}</h2>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('vehicleName')} <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. Toyota HiAce"
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('plateNumber')} <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. WXY 1234"
                value={formData.plateNumber} 
                onChange={e => setFormData({...formData, plateNumber: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm uppercase" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleColor')}</label>
                <input 
                  type="text" 
                  placeholder="e.g. White"
                  value={formData.color} 
                  onChange={e => setFormData({...formData, color: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleYear')}</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2024"
                  value={formData.year} 
                  onChange={e => setFormData({...formData, year: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleCapacity') || 'Capacity (Seats)'}</label>
                <input 
                  type="number" 
                  min="1"
                  max="100"
                  placeholder="e.g. 10"
                  value={formData.capacity} 
                  onChange={e => setFormData({...formData, capacity: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleStatus')}</label>
                <select 
                  value={formData.status} 
                  onChange={e => setFormData({...formData, status: e.target.value as VehicleStatus})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Initial Odometer (KM)</label>
              <input 
                type="number" 
                min="0"
                placeholder="e.g. 45000"
                value={formData.currentOdometer} 
                onChange={e => setFormData({...formData, currentOdometer: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('assignVehicle')} (Optional)</label>
              <select 
                value={formData.assignedOfficerId} 
                onChange={e => setFormData({...formData, assignedOfficerId: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
              >
                <option value="">-- Dynamic Pool (Any Officer) --</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditVehicleModal({ 
  vehicle, 
  onClose, 
  onSave, 
  users, 
  t 
}: { 
  vehicle: Vehicle; 
  onClose: () => void; 
  onSave: (data: Partial<Vehicle>) => Promise<void> | void; 
  users: any[]; 
  t: any; 
}) {
  const [formData, setFormData] = useState({
    name: vehicle.name || '',
    plateNumber: vehicle.plateNumber || '',
    color: vehicle.color || '',
    year: vehicle.year || '',
    capacity: vehicle.capacity !== undefined ? String(vehicle.capacity) : '',
    currentOdometer: vehicle.currentOdometer !== undefined ? String(vehicle.currentOdometer) : '',
    status: (vehicle.status || 'active') as VehicleStatus,
    assignedOfficerId: vehicle.assignedOfficerId || ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.plateNumber.trim()) {
      toast.error('Vehicle Name and Plate Number are required');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<Vehicle> = {
        name: formData.name.trim(),
        plateNumber: formData.plateNumber.trim().toUpperCase(),
        color: formData.color.trim() || undefined,
        year: formData.year.trim() || undefined,
        status: formData.status,
        assignedOfficerId: formData.assignedOfficerId || undefined,
      };
      if (formData.capacity) {
        const parsed = Number(formData.capacity);
        if (!isNaN(parsed) && parsed > 0) {
          payload.capacity = parsed;
        }
      }
      if (formData.currentOdometer !== '') {
        const parsedOdo = Number(formData.currentOdometer);
        if (!isNaN(parsedOdo) && parsedOdo >= 0) {
          payload.currentOdometer = parsedOdo;
          payload.lastOdometer = parsedOdo;
          payload.mileage = parsedOdo;
        }
      }
      await onSave(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <Pencil size={18} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">{t('editVehicle')}</h2>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('vehicleName')} <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. Toyota HiAce / Proton Saga"
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('plateNumber')} <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. WXY 1234"
                value={formData.plateNumber} 
                onChange={e => setFormData({...formData, plateNumber: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm uppercase" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleColor')}</label>
                <input 
                  type="text" 
                  placeholder="e.g. Silver"
                  value={formData.color} 
                  onChange={e => setFormData({...formData, color: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleYear')}</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2023"
                  value={formData.year} 
                  onChange={e => setFormData({...formData, year: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleCapacity') || 'Capacity (Seats)'}</label>
                <input 
                  type="number" 
                  min="1"
                  max="100"
                  placeholder="e.g. 7"
                  value={formData.capacity} 
                  onChange={e => setFormData({...formData, capacity: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('vehicleStatus')}</label>
                <select 
                  value={formData.status} 
                  onChange={e => setFormData({...formData, status: e.target.value as VehicleStatus})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Odometer (KM)</label>
              <input 
                type="number" 
                min="0"
                placeholder="e.g. 45230"
                value={formData.currentOdometer} 
                onChange={e => setFormData({...formData, currentOdometer: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('assignVehicle')}</label>
              <select 
                value={formData.assignedOfficerId} 
                onChange={e => setFormData({...formData, assignedOfficerId: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
              >
                <option value="">-- Dynamic Pool (Unassigned) --</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isSaving}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors"
            >
              {t('cancel')}
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteVehicleConfirmModal({ 
  vehicle, 
  assignedOfficerName, 
  onClose, 
  onConfirm, 
  isDeleting, 
  t 
}: {
  vehicle: Vehicle;
  assignedOfficerName?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting: boolean;
  t: any;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 pb-0">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
            <AlertTriangle size={26} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {t('confirmDeleteVehicleTitle') || 'Remove Vehicle from Fleet?'}
          </h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {t('confirmDeleteVehicleDesc') || 'This action is permanent and cannot be undone. Are you sure you want to remove this vehicle from the registry?'}
          </p>

          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">{t('vehicleName')}:</span>
              <span className="font-semibold text-slate-800">{vehicle.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">{t('plateNumber')}:</span>
              <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">{vehicle.plateNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">{t('assignVehicle')}:</span>
              <span className="text-slate-700">{assignedOfficerName || 'Unassigned'}</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 mt-6 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isDeleting}
            className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-medium transition-colors"
          >
            {t('cancel')}
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            disabled={isDeleting}
            className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-red-600/20"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>{t('removeVehicle') || 'Remove Vehicle'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function VehicleHistoryModal({ vehicle, logs, vehicleTasks, presets, users, canManageVehicles = true, lastOdometer, isCheckedOut, onClose, onOpenLightbox, t }: any) {
  const { updateVehicle, students, language } = useAppContext();
  const [activeTab, setActiveTab] = useState<'logs' | 'tasks'>('logs');
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string; subtitle?: string; km?: string | number } | null>(null);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const tA = new Date(a.startTime || a.date).getTime();
      const tB = new Date(b.startTime || b.date).getTime();
      return tB - tA;
    });
  }, [logs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex flex-wrap items-center gap-2">
              {vehicle.name} 
              {canManageVehicles ? (
                <select 
                  value={vehicle.status}
                  onChange={async (e) => {
                    try {
                      if (updateVehicle) {
                        await updateVehicle(vehicle.id, { status: e.target.value as VehicleStatus });
                        toast.success('Vehicle status updated');
                      }
                    } catch (err) {
                      toast.error('Failed to update vehicle status');
                    }
                  }}
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 border-none cursor-pointer focus:ring-0 ${
                    vehicle.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    vehicle.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }`}
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              ) : (
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${
                  vehicle.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  vehicle.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {t(vehicle.status as any) || vehicle.status}
                </span>
              )}
              {isCheckedOut !== undefined && (
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${
                  isCheckedOut ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'
                }`}>
                  {isCheckedOut ? 'In Use / Checked Out' : 'Available / Checked In'}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm font-mono text-slate-500">{vehicle.plateNumber}</p>
              {lastOdometer !== undefined && (
                <span className="text-xs font-semibold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded-md">
                  Last Odometer: {lastOdometer} km
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
        
        <div className="flex border-b border-slate-200 px-6 mt-4">
          <button 
            className={`pb-3 px-4 font-medium transition-colors ${activeTab === 'logs' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('logs')}
          >
            Trip & Daily Logs ({sortedLogs.length})
          </button>
          <button 
            className={`pb-3 px-4 font-medium transition-colors ${activeTab === 'tasks' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('tasks')}
          >
            Task History
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'logs' && (
            sortedLogs.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No logs found for this vehicle.</p>
            ) : sortedLogs.map((log: any) => {
              const officer = users.find((u: any) => u.id === log.userId);
              const startProof = log.dashboardPhotoUrl || log.startDashboardPhoto || log.startDashboardPhotoUrl;
              const legacyStartOdo = log.startOdometerPhoto || log.odometerPhotoUrl;
              const legacyStartFuel = log.startFuelPhoto || log.fuelPhotoUrl;

              const endProof = log.endDashboardPhoto || log.endDashboardPhotoUrl || log.endPhotoUrl;
              const legacyEndOdo = log.endOdometerPhoto;
              const legacyEndFuel = log.endFuelPhoto;
              const isOpenSession = Boolean(log.startTime) && !log.endTime;

              return (
                <div key={log.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800">{format(new Date(log.date), 'MMM dd, yyyy')}</h4>
                        {isOpenSession && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px] font-bold">
                            Active Session
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{officer?.name || 'Logistics Officer'}</p>
                    </div>
                    {log.endKm && log.startKm && (
                      <span className="font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full text-xs border border-red-100">
                        {log.startKm} → {log.endKm} km (+{Number(log.endKm) - Number(log.startKm)} km)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                    <div>
                      <span className="text-slate-500 block mb-1">Check-In (Start)</span>
                      <span className="font-medium text-slate-800">{log.startKm} km</span>
                      <p className="text-xs text-slate-400 mb-2">{log.startTime ? format(new Date(log.startTime), 'HH:mm') : ''}</p>
                      
                      {startProof ? (
                        <div 
                          onClick={() => setPreviewPhoto({
                            url: startProof,
                            title: 'Start Shift Dashboard Proof',
                            subtitle: `${vehicle.name} (${vehicle.plateNumber}) • ${log.startTime ? format(new Date(log.startTime), 'MMM dd, yyyy HH:mm') : format(new Date(log.date), 'MMM dd, yyyy')}`,
                            km: log.startKm
                          })}
                          className="group relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden shrink-0 cursor-pointer shadow-sm hover:shadow transition-all bg-slate-100"
                          title="Click to inspect dashboard audit photo"
                        >
                          <img src={startProof} alt="Start Dashboard" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Search size={16} className="text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {legacyStartOdo && (
                            <div 
                              onClick={() => setPreviewPhoto({
                                url: legacyStartOdo,
                                title: 'Start Odometer Photo',
                                subtitle: `${vehicle.name} (${vehicle.plateNumber})`,
                                km: log.startKm
                              })}
                              className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Legacy Odometer Photo"
                            >
                              <img src={legacyStartOdo} alt="Start Odo" className="w-full h-full object-cover" />
                            </div>
                          )}
                          {legacyStartFuel && (
                            <div 
                              onClick={() => setPreviewPhoto({
                                url: legacyStartFuel,
                                title: 'Start Fuel Photo',
                                subtitle: `${vehicle.name} (${vehicle.plateNumber})`,
                              })}
                              className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Legacy Fuel Photo"
                            >
                              <img src={legacyStartFuel} alt="Start Fuel" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Check-Out (End)</span>
                      <span className="font-medium text-slate-800">{log.endKm || '-'} km</span>
                      <p className="text-xs text-slate-400 mb-2">{log.endTime ? format(new Date(log.endTime), 'HH:mm') : ''}</p>
                      
                      {endProof ? (
                        <div 
                          onClick={() => setPreviewPhoto({
                            url: endProof,
                            title: 'End Shift Dashboard Proof',
                            subtitle: `${vehicle.name} (${vehicle.plateNumber}) • ${log.endTime ? format(new Date(log.endTime), 'MMM dd, yyyy HH:mm') : format(new Date(log.date), 'MMM dd, yyyy')}`,
                            km: log.endKm
                          })}
                          className="group relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden shrink-0 cursor-pointer shadow-sm hover:shadow transition-all bg-slate-100"
                          title="Click to inspect dashboard audit photo"
                        >
                          <img src={endProof} alt="End Dashboard" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Search size={16} className="text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {legacyEndOdo && (
                            <div 
                              onClick={() => setPreviewPhoto({
                                url: legacyEndOdo,
                                title: 'End Odometer Photo',
                                subtitle: `${vehicle.name} (${vehicle.plateNumber})`,
                                km: log.endKm
                              })}
                              className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Legacy Odometer Photo"
                            >
                              <img src={legacyEndOdo} alt="End Odo" className="w-full h-full object-cover" />
                            </div>
                          )}
                          {legacyEndFuel && (
                            <div 
                              onClick={() => setPreviewPhoto({
                                url: legacyEndFuel,
                                title: 'End Fuel Photo',
                                subtitle: `${vehicle.name} (${vehicle.plateNumber})`,
                              })}
                              className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Legacy Fuel Photo"
                            >
                              <img src={legacyEndFuel} alt="End Fuel" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {log.fuelReceipts && log.fuelReceipts.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <span className="text-xs font-semibold text-slate-600 block mb-2 flex items-center gap-1.5">
                        <Fuel size={13} className="text-red-600" />
                        <span>Watermarked Fuel Receipts ({log.fuelReceipts.length})</span>
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {log.fuelReceipts.map((fr: any, idx: number) => (
                          <div
                            key={fr.id || idx}
                            onClick={() => setPreviewPhoto({
                              url: fr.photo,
                              title: `Fuel Receipt (RM ${Number(fr.amount || 0).toFixed(2)})`,
                              subtitle: `${vehicle.name} (${vehicle.plateNumber}) • ${fr.timestamp ? format(new Date(fr.timestamp), 'MMM dd, yyyy HH:mm') : format(new Date(log.date), 'MMM dd, yyyy')}`
                            })}
                            className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5 pr-3 cursor-pointer hover:border-red-400 transition-all shadow-2xs"
                          >
                            <img src={fr.photo} alt="Fuel Receipt" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">RM {Number(fr.amount || 0).toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 block">Inspect Receipt</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <VehicleInspectionGallerySection
                    photos={log.checkInPhotos}
                    vehicleName={vehicle.name}
                    plateNumber={vehicle.plateNumber}
                    dateStr={log.startTime ? log.startTime.slice(0, 16).replace('T', ' ') : log.date}
                    defaultExpanded={Boolean(log.checkInPhotos && log.checkInPhotos.length > 0)}
                    onOpenLightbox={(photos, index, title, subtitle) => {
                      if (onOpenLightbox) {
                        onOpenLightbox(photos, index, title, subtitle);
                      } else {
                        setPreviewPhoto({
                          url: photos[index],
                          title: 'Vehicle Condition & Inspection Photo',
                          subtitle: `${vehicle.name} (${vehicle.plateNumber}) • Photo ${index + 1} of ${photos.length}`,
                        });
                      }
                    }}
                  />

                  {(log.checkInNotes || log.checkOutNotes || log.notes) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                      {log.checkInNotes && (
                        <div className="flex items-start gap-1.5 text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                          <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <span><strong className="text-slate-700 font-medium">Check-In Note:</strong> {log.checkInNotes}</span>
                        </div>
                      )}
                      {log.checkOutNotes && (
                        <div className="flex items-start gap-1.5 text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                          <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <span><strong className="text-slate-700 font-medium">Check-Out Note:</strong> {log.checkOutNotes}</span>
                        </div>
                      )}
                      {!log.checkInNotes && !log.checkOutNotes && log.notes && (
                        <div className="flex items-start gap-1.5 text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                          <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <span><strong className="text-slate-700 font-medium">Note:</strong> {log.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          
          {activeTab === 'tasks' && (
            vehicleTasks.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No tasks found for this vehicle.</p>
            ) : vehicleTasks.map((task: any) => {
              const officer = users.find((u: any) => u.id === task.assigneeId);
              const taskCategory = getTaskCategory(task);
              const taskTitle = getTaskDisplayTitle(task, presets, language);
              const subjectName = getTaskSubjectName(task, students, language);
              
              // Gather all media from subtasks and communication proof
              const allMedia: any[] = [];
              if (task.studentCommunicationMedia) {
                allMedia.push(...task.studentCommunicationMedia.map((m: any) => ({ ...m, type: 'Communication' })));
              }
              task.subTasks?.forEach((st: any) => {
                if (st.media) {
                  allMedia.push(...st.media.map((m: any) => ({ ...m, type: st.titleEn })));
                }
              });
              
              // Sort media by timestamp
              allMedia.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              return (
                <div key={task.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-800">{taskTitle}</h4>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider border ${
                          taskCategory === 'non_student'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : taskCategory === 'student_custom'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                          {taskCategory === 'non_student'
                            ? (t('nonStudentCategory') || 'Non-Student')
                            : taskCategory === 'student_custom'
                            ? (t('studentCustomCategory') || 'Student Custom')
                            : (t('studentPresetCategory') || 'Student SOP')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">
                        {task.isNonStudentTask ? (t('beneficiary') || 'Beneficiary') : (t('student') || 'Student')}: <strong className="text-slate-800">{subjectName}</strong>
                        {' • '}
                        {t('assignedTo') || 'Assigned to'}: <strong className="text-slate-800">{officer?.name || (t('unassigned') || 'Unassigned')}</strong>
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider border shrink-0 ${getTaskStatusBadgeClasses(task.status)}`}>
                      {t(task.status) || task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    <span>{format(new Date(task.createdAt), 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                  
                  {allMedia.length > 0 && (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <h5 className="text-xs font-semibold text-slate-700 mb-2">Attached Media</h5>
                      <div className="flex flex-wrap gap-3">
                        {allMedia.map((media, idx) => (
                          <div key={idx} className="bg-white border border-slate-200 p-2 rounded-lg flex gap-3 items-center">
                            <img src={media.url} alt="Proof" className="w-12 h-12 object-cover rounded-md border border-slate-100" />
                            <div className="flex flex-col text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-700 mb-0.5">{media.type}</span>
                              <span>{format(new Date(media.timestamp), 'MMM dd, HH:mm')}</span>
                              <span className="flex items-center gap-1 mt-0.5"><MapPin size={8} /> {media.location}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {previewPhoto && (
        <AuditPhotoModal 
          photo={previewPhoto} 
          onClose={() => setPreviewPhoto(null)} 
        />
      )}
    </div>
  );
}

function LogForm({ type, vehicle, lastOdometer = 0, startKm, onSubmit, t }: any) {
  const [km, setKm] = useState('');
  const [notes, setNotes] = useState('');
  const [dashboardPhotoUrl, setDashboardPhotoUrl] = useState<string>('');
  const [isDirectUploadingDashboard, setIsDirectUploadingDashboard] = useState(false);
  const [uploadedInspectionPhotos, setUploadedInspectionPhotos] = useState<string[]>([]);
  const [isDirectUploadingInspection, setIsDirectUploadingInspection] = useState(false);
  const [directUploadMsg, setDirectUploadMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [locationStr, setLocationStr] = useState('Fetching GPS location...');
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [formLightbox, setFormLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  const dashboardCameraInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const inspectionCameraInputRef = useRef<HTMLInputElement | null>(null);
  const inspectionGalleryInputRef = useRef<HTMLInputElement | null>(null);

  const baselineOdo = Math.max(Number(lastOdometer) || 0, Number(startKm) || 0);

  const fetchGps = () => {
    setIsAcquiringGps(true);
    getCurrentGpsLocation()
      .then((res) => {
        setLocationStr(res.locationStr);
      })
      .catch((err) => {
        console.warn('GPS initial lookup:', err);
        setLocationStr('GPS Lock Required (Tap Refresh)');
      })
      .finally(() => {
        setIsAcquiringGps(false);
      });
  };

  useEffect(() => {
    fetchGps();
  }, []);

  const handleKmChange = (val: string) => {
    setKm(val);
    if (!val.trim()) {
      setOdometerError(null);
      return;
    }
    const num = Number(val);
    if (isNaN(num) || num < baselineOdo) {
      setOdometerError(`Odometer reading must be greater than or equal to the last recorded reading of ${baselineOdo} km`);
    } else {
      setOdometerError(null);
    }
  };

  // Live Camera Capture & Direct Upload for Mandatory Dashboard Proof
  const handleDashboardLiveCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsDirectUploadingDashboard(true);
    setDirectUploadMsg('Acquiring high-accuracy GPS coordinates...');
    try {
      let activeLocation = locationStr;
      if (!activeLocation || activeLocation.includes('Required') || activeLocation.includes('Fetching') || activeLocation.includes('Unavailable')) {
        try {
          const gpsRes = await getCurrentGpsLocation();
          activeLocation = gpsRes.locationStr;
          setLocationStr(gpsRes.locationStr);
        } catch (gpsErr: any) {
          if (!activeLocation || activeLocation.includes('Required')) {
            throw new Error('GPS access is mandatory for visual audits. Please enable location permissions.');
          }
        }
      }

      setDirectUploadMsg('Watermarking live dashboard proof (0.80 JPEG)...');
      const watermarked = await addWatermark(file, activeLocation);

      setDirectUploadMsg('Directly uploading to Cloud Storage...');
      const targetVehicleId = vehicle?.id || 'temp';
      const fileRef = ref(
        storage,
        `vehicle_logs/${targetVehicleId}_${Date.now()}_${type === 'start' ? 'start' : 'end'}_dashboard.jpg`
      );
      await uploadBytes(fileRef, watermarked);
      const downloadUrl = await getDownloadURL(fileRef);

      setDashboardPhotoUrl(downloadUrl);
      toast.success(type === 'start' ? 'Live dashboard proof watermarked & uploaded!' : 'Check-out dashboard proof watermarked & uploaded!');
    } catch (err: any) {
      console.error('Dashboard direct upload error:', err);
      toast.error(err.message || 'Failed to capture dashboard photo.');
    } finally {
      setIsDirectUploadingDashboard(false);
      setDirectUploadMsg('');
      if (dashboardCameraInputRef.current) {
        dashboardCameraInputRef.current.value = '';
      }
    }
  };

  // Live Camera Capture & Direct Upload for Condition Inspection Photos
  const handleInspectionLiveCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsDirectUploadingInspection(true);
    setDirectUploadMsg('Acquiring high-accuracy GPS coordinates...');
    try {
      let activeLocation = locationStr;
      if (!activeLocation || activeLocation.includes('Required') || activeLocation.includes('Fetching') || activeLocation.includes('Unavailable')) {
        try {
          const gpsRes = await getCurrentGpsLocation();
          activeLocation = gpsRes.locationStr;
          setLocationStr(gpsRes.locationStr);
        } catch (gpsErr: any) {
          if (!activeLocation || activeLocation.includes('Required')) {
            throw new Error('GPS access is mandatory for visual audits. Please enable location permissions.');
          }
        }
      }

      setDirectUploadMsg('Watermarking live inspection photo (0.80 JPEG)...');
      const watermarked = await addWatermark(file, activeLocation);

      setDirectUploadMsg('Directly uploading condition photo to Cloud Storage...');
      const targetVehicleId = vehicle?.id || 'temp';
      const photoIdx = uploadedInspectionPhotos.length;
      const fileRef = ref(
        storage,
        `vehicle_logs/${targetVehicleId}_${Date.now()}_inspection_${photoIdx}.jpg`
      );
      await uploadBytes(fileRef, watermarked);
      const downloadUrl = await getDownloadURL(fileRef);

      setUploadedInspectionPhotos(prev => [...prev, downloadUrl]);
      toast.success(`Vehicle inspection photo #${photoIdx + 1} live-captured & uploaded!`);
    } catch (err: any) {
      console.error('Inspection direct upload error:', err);
      toast.error(err.message || 'Failed to capture inspection photo.');
    } finally {
      setIsDirectUploadingInspection(false);
      setDirectUploadMsg('');
      if (inspectionCameraInputRef.current) {
        inspectionCameraInputRef.current.value = '';
      }
    }
  };

  const handleRemoveInspectionPhoto = (indexToRemove: number) => {
    setUploadedInspectionPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleFormSubmit = async () => {
    const numericKm = Number(km);
    if (!km.trim() || isNaN(numericKm) || numericKm < baselineOdo) {
      const errMsg = `Odometer reading must be greater than or equal to the last recorded reading of ${baselineOdo} km`;
      setOdometerError(errMsg);
      toast.error(errMsg);
      return;
    }

    if (!dashboardPhotoUrl) {
      toast.error('Please live-capture the dashboard proof photo with your camera before submitting.');
      return;
    }

    if (isDirectUploadingDashboard || isDirectUploadingInspection) {
      toast.error('Please wait for current photo to finish uploading.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ 
        km: String(numericKm), 
        dashboardPhotoUrl, 
        checkInPhotos: uploadedInspectionPhotos,
        locationStr,
        notes: notes.trim(),
      });
      setKm('');
      setNotes('');
      setDashboardPhotoUrl('');
      setUploadedInspectionPhotos([]);
      setOdometerError(null);
    } catch (err: any) {
      // Error already toasted in parent handler if validation failed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden Live Camera & Gallery Inputs */}
      <input 
        ref={dashboardCameraInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        disabled={isDirectUploadingDashboard || isSubmitting}
        onChange={handleDashboardLiveCapture} 
      />
      <input 
        ref={dashboardGalleryInputRef}
        type="file" 
        accept="image/*" 
        className="hidden" 
        disabled={isDirectUploadingDashboard || isSubmitting}
        onChange={handleDashboardLiveCapture} 
      />

      <input
        ref={inspectionCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={isDirectUploadingInspection || isSubmitting}
        onChange={handleInspectionLiveCapture}
      />
      <input
        ref={inspectionGalleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isDirectUploadingInspection || isSubmitting}
        onChange={handleInspectionLiveCapture}
      />

      {/* Manual Numeric Input: Odometer Reading with Reference Badge & Monotonic Validation */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label className="block text-sm font-medium text-slate-700">
            {type === 'start' ? 'Check-In Odometer (Start KM)' : 'Check-Out Odometer (End KM)'} ({t('kilometers')}) <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => handleKmChange(String(baselineOdo))}
            title="Click to fill with last recorded reading"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
          >
            <Gauge size={13} className="text-red-600" />
            <span>Last Recorded Odometer: <strong className="font-mono text-slate-900">{baselineOdo} km</strong></span>
          </button>
        </div>
        <div className="relative">
          <Gauge className={`absolute left-3 top-1/2 -translate-y-1/2 ${odometerError ? 'text-red-500' : 'text-slate-400'}`} size={20} />
          <input 
            type="number" 
            min={baselineOdo}
            value={km} 
            onChange={e => handleKmChange(e.target.value)}
            className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 focus:outline-none font-mono ${
              odometerError
                ? 'border-red-500 focus:ring-red-600/20 focus:border-red-600 bg-red-50/30 text-red-900'
                : 'border-slate-200 focus:ring-red-600/20 focus:border-red-600 text-slate-800'
            }`}
            placeholder={`Must be ≥ ${baselineOdo} km`}
          />
        </div>
        {odometerError && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>{odometerError}</span>
          </p>
        )}
      </div>

      {/* Dashboard Proof Photo Capture & Upload */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Camera size={16} className="text-red-600" />
            <span>{t('dashboardProof')} <span className="text-red-500">*</span></span>
          </label>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 size={11} /> Watermark Stamped
          </span>
        </div>

        {isDirectUploadingDashboard ? (
          <div className="p-8 border-2 border-dashed border-red-300 bg-red-50/30 rounded-xl text-center space-y-3">
            <div className="w-10 h-10 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <p className="text-sm font-bold text-slate-800">{directUploadMsg || 'Processing dashboard photo...'}</p>
              <p className="text-xs text-slate-500 mt-1">Stamping GPS coordinates & directly uploading to Cloud Storage...</p>
            </div>
          </div>
        ) : dashboardPhotoUrl ? (
          <div className="space-y-2">
            <div className="relative max-h-56 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
              <img 
                src={dashboardPhotoUrl} 
                alt="Dashboard Proof" 
                className="w-full h-52 object-cover" 
              />
              <div className="absolute top-2 left-2 bg-emerald-700/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md backdrop-blur-xs flex items-center gap-1 shadow">
                <CheckCircle2 size={13} /> Verified & Uploaded
              </div>
              <button
                type="button"
                onClick={() => setDashboardPhotoUrl('')}
                disabled={isSubmitting}
                className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-all cursor-pointer hover:scale-110 z-10"
                title={t('discardPhoto') || "Discard photo"}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} /> Dashboard photo ready
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => dashboardCameraInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Camera size={12} /> {t('cameraShot') || 'Camera'}
                </button>
                <button
                  type="button"
                  onClick={() => dashboardGalleryInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ImageIcon size={12} /> {t('galleryUpload') || 'Gallery'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => !isSubmitting && dashboardCameraInputRef.current?.click()}
              disabled={isSubmitting}
              className="p-5 border-2 border-dashed border-slate-300 hover:border-red-500 hover:bg-red-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-red-50 text-red-600 rounded-full group-hover:scale-105 transition-transform">
                <Camera size={24} />
              </div>
              <p className="text-xs font-bold text-slate-800">{t('cameraShot') || 'Camera Shot'}</p>
              <p className="text-[10px] text-slate-500">Take Live Dashboard Photo</p>
            </button>

            <button
              type="button"
              onClick={() => !isSubmitting && dashboardGalleryInputRef.current?.click()}
              disabled={isSubmitting}
              className="p-5 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-blue-50 text-blue-600 rounded-full group-hover:scale-105 transition-transform">
                <ImageIcon size={24} />
              </div>
              <p className="text-xs font-bold text-slate-800">{t('galleryUpload') || 'Gallery Upload'}</p>
              <p className="text-[10px] text-slate-500">Choose from Photo Library</p>
            </button>
          </div>
        )}
      </div>

      {/* Dedicated Inspection Section: Vehicle Inspection Photos */}
      {type === 'start' && (
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-600" />
                <span>Vehicle Inspection Photos</span>
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Capture condition photos (exterior sides, front, back, interior cabin) via camera or photo library.
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              uploadedInspectionPhotos.length > 0
                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              <Camera size={13} className={uploadedInspectionPhotos.length > 0 ? "text-blue-600" : "text-slate-400"} />
              <span>{uploadedInspectionPhotos.length} {uploadedInspectionPhotos.length === 1 ? 'Photo' : 'Photos'} Uploaded</span>
            </span>
          </div>

          {uploadedInspectionPhotos.length === 0 && !isDirectUploadingInspection ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => !isSubmitting && inspectionCameraInputRef.current?.click()}
                disabled={isSubmitting}
                className="p-5 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
              >
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full group-hover:scale-105 transition-transform">
                  <Camera size={24} />
                </div>
                <p className="text-xs font-bold text-slate-800">{t('cameraShot') || 'Camera Shot'}</p>
                <p className="text-[10px] text-slate-500">Capture Live Photo</p>
              </button>

              <button
                type="button"
                onClick={() => !isSubmitting && inspectionGalleryInputRef.current?.click()}
                disabled={isSubmitting}
                className="p-5 border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
              >
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full group-hover:scale-105 transition-transform">
                  <ImageIcon size={24} />
                </div>
                <p className="text-xs font-bold text-slate-800">{t('galleryUpload') || 'Gallery Upload'}</p>
                <p className="text-[10px] text-slate-500">Pick from Gallery</p>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Photo Preview Grid (Directly Uploaded URLs) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {uploadedInspectionPhotos.map((photoUrl, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setFormLightbox({ photos: uploadedInspectionPhotos, index: idx })}
                    className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video sm:aspect-square shadow-2xs cursor-pointer"
                    title="Click to inspect full resolution preview"
                  >
                    <img 
                      src={photoUrl} 
                      alt={`Inspection photo ${idx + 1}`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    
                    {/* Hover Zoom Overlay */}
                    <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="p-1.5 bg-white/90 text-slate-900 rounded-full shadow-sm">
                        <Search size={14} />
                      </div>
                    </div>

                    {/* Individual Remove ("X") Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveInspectionPhoto(idx);
                      }}
                      disabled={isSubmitting || isDirectUploadingInspection}
                      title={t('discardPhoto') || "Discard photo"}
                      aria-label={`Discard photo ${idx + 1}`}
                      className="absolute top-1.5 right-1.5 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-all cursor-pointer hover:scale-110 z-10 disabled:opacity-50"
                    >
                      <X size={13} />
                    </button>

                    {/* Photo Index Badge */}
                    <div className="absolute bottom-1.5 left-1.5 bg-slate-950/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs pointer-events-none">
                      #{idx + 1}
                    </div>

                    {/* Direct Uploaded Indicator */}
                    <div className="absolute bottom-1.5 right-1.5 bg-emerald-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs pointer-events-none">
                      Cloud ✓
                    </div>
                  </div>
                ))}

                {/* Direct Uploading Placeholder Card */}
                {isDirectUploadingInspection && (
                  <div className="rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 aspect-video sm:aspect-square flex flex-col items-center justify-center p-3 text-center space-y-2">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[11px] font-bold text-blue-900 leading-tight">
                      {directUploadMsg || 'Watermarking & uploading directly...'}
                    </p>
                    <span className="text-[10px] text-blue-600 font-medium">GPS Watermark Applied</span>
                  </div>
                )}
              </div>

              {/* Action Bar: Add Photos (Camera vs Gallery) / Clear All */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => inspectionCameraInputRef.current?.click()}
                    disabled={isSubmitting || isDirectUploadingInspection}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Camera size={13} className="text-red-400" />
                    <span>{t('cameraShot') || 'Camera'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => inspectionGalleryInputRef.current?.click()}
                    disabled={isSubmitting || isDirectUploadingInspection}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <ImageIcon size={13} className="text-blue-400" />
                    <span>{t('galleryUpload') || 'Gallery'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadedInspectionPhotos([])}
                  disabled={isSubmitting || isDirectUploadingInspection}
                  className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors cursor-pointer px-2 py-1"
                >
                  Clear All ({uploadedInspectionPhotos.length})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional Trip Notes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="vehicle-log-notes" className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <FileText size={15} className="text-slate-400" />
            <span>{t('notes') || 'Notes'}</span>
            <span className="text-xs text-slate-400 font-normal">
              ({type === 'start' ? 'Optional Check-In Remarks' : 'Optional Check-Out Remarks'})
            </span>
          </label>
        </div>
        <textarea
          id="vehicle-log-notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={
            type === 'start'
              ? 'Add any optional check-in notes (e.g. initial condition, cleanliness, fuel level, parking bay)...'
              : 'Add any optional check-out notes (e.g. return status, trip summary, key handover location)...'
          }
          disabled={isSubmitting}
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:bg-white focus:outline-none text-sm text-slate-800 placeholder:text-slate-400 transition-all resize-y min-h-[72px]"
        />
      </div>

      {/* GPS Status Indicator */}
      <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs text-slate-600 border border-slate-200/70">
        <div className="flex items-center gap-2 truncate">
          <MapPin size={14} className={isAcquiringGps ? "animate-pulse text-amber-500 shrink-0" : "text-red-600 shrink-0"} />
          <span className="truncate text-[11px]">
            {isAcquiringGps ? 'Acquiring high-accuracy GPS fix...' : locationStr}
          </span>
        </div>
        <button
          type="button"
          onClick={fetchGps}
          disabled={isAcquiringGps || isDirectUploadingDashboard || isDirectUploadingInspection}
          className="p-1 text-slate-400 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
          title="Refresh GPS"
        >
          <RefreshCw size={12} className={isAcquiringGps ? "animate-spin" : ""} />
        </button>
      </div>

      <button 
        type="button"
        disabled={isSubmitting || isDirectUploadingDashboard || isDirectUploadingInspection || !km || !dashboardPhotoUrl || Boolean(odometerError)}
        onClick={handleFormSubmit}
        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
          isSubmitting || isDirectUploadingDashboard || isDirectUploadingInspection || !km || !dashboardPhotoUrl || Boolean(odometerError)
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700 hover:-translate-y-0.5'
        }`}
      >
        {isSubmitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Finalizing Trip Session...</span>
          </>
        ) : isDirectUploadingDashboard || isDirectUploadingInspection ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Directly Uploading Media to Cloud...</span>
          </>
        ) : (
          type === 'start' ? `Check In & ${t('startEngine')}` : `Check Out & ${t('endDay')}`
        )}
      </button>

      {/* Lightbox for Previewing Directly Uploaded Photos Inside Form */}
      {formLightbox && (
        <InspectionLightboxModal
          photos={formLightbox.photos}
          initialIndex={formLightbox.index}
          title="Live Condition Photo Inspection"
          subtitle={`${vehicle?.name || 'Vehicle'} (${vehicle?.plateNumber || ''})`}
          onClose={() => setFormLightbox(null)}
        />
      )}
    </div>
  );
}

function FuelRefillModal({ todaysLog, updateVehicleLog }: { todaysLog: any, updateVehicleLog: any }) {
  const { t } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [cost, setCost] = useState('');
  const [liters, setLiters] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [isPreparingReceipt, setIsPreparingReceipt] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [locationStr, setLocationStr] = useState('Fetching GPS...');
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const fuelCameraInputRef = useRef<HTMLInputElement | null>(null);
  const fuelGalleryInputRef = useRef<HTMLInputElement | null>(null);

  const handleFuelReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;

    setIsPreparingReceipt(true);
    try {
      const prepared = await prepareImageFile(rawFile);
      setReceiptPhoto(prepared);
    } catch (err: any) {
      console.error('Fuel receipt image preparation failed:', err);
      toast.error(err?.message || 'Could not load selected image. Please try another photo.');
    } finally {
      setIsPreparingReceipt(false);
    }
  };

  const fetchGps = () => {
    setIsAcquiringGps(true);
    getCurrentGpsLocation()
      .then(res => setLocationStr(res.locationStr))
      .catch((err) => {
        console.warn('Fuel modal GPS lookup:', err);
        setLocationStr('GPS Lock Required (Tap Refresh)');
      })
      .finally(() => setIsAcquiringGps(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchGps();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!cost || !receiptPhoto) return;
    setIsUploading(true);
    
    try {
      // 1. GPS Lock: Use already resolved location or fetch cached/fast GPS lock
      let activeLocation = locationStr;
      if (!activeLocation || activeLocation.includes('Required') || activeLocation.includes('Fetching') || activeLocation.includes('Unavailable')) {
        const gpsRes = await getCurrentGpsLocation();
        activeLocation = gpsRes.locationStr;
        setLocationStr(activeLocation);
      }

      // 2. Client-side Canvas2D visual audit watermarking (0.80 JPEG)
      const watermarkedReceipt = await addWatermark(receiptPhoto, activeLocation);

      // 3. Dispatch to Firebase Storage
      const fileRef = ref(storage, `receipts/${todaysLog.vehicleId}_${Date.now()}_${watermarkedReceipt.name}`);
      await uploadBytes(fileRef, watermarkedReceipt);
      const url = await getDownloadURL(fileRef);
      
      const newReceipt = {
        cost: Number(cost),
        liters: liters ? Number(liters) : undefined,
        photoUrl: url,
        timestamp: new Date().toISOString()
      };
      
      await updateVehicleLog(todaysLog.id, {
        fuelReceipts: [...(todaysLog.fuelReceipts || []), newReceipt]
      });
      
      toast.success('Watermarked fuel receipt logged');
      setIsOpen(false);
      setCost('');
      setLiters('');
      setReceiptPhoto(null);
    } catch (err: any) {
      console.error('Error logging fuel receipt:', err);
      toast.error(err?.message || 'GPS access is mandatory for visual audits. Please enable location permissions.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm cursor-pointer"
      >
        <DollarSign size={16} /> Log Fuel Refill
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Fuel size={20}/> Log Fuel Refill</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cost</label>
                <input 
                  type="number" 
                  value={cost} 
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20" 
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Liters (Optional)</label>
                <input 
                  type="number" 
                  value={liters} 
                  onChange={(e) => setLiters(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20" 
                  placeholder="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex justify-between items-center">
                  <span>Receipt Photo <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-red-600 font-semibold uppercase">Watermark Stamped</span>
                </label>
                {/* Hidden Inputs for Camera vs Gallery */}
                <input 
                  type="file" 
                  ref={fuelCameraInputRef}
                  accept="image/*" 
                  capture="environment" 
                  disabled={isUploading || isPreparingReceipt}
                  className="hidden"
                  onChange={handleFuelReceiptSelected} 
                />
                <input 
                  type="file" 
                  ref={fuelGalleryInputRef}
                  accept="image/*" 
                  disabled={isUploading || isPreparingReceipt}
                  className="hidden"
                  onChange={handleFuelReceiptSelected} 
                />
                  
                {receiptPhoto ? (
                  <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 shadow-sm">
                    <LocalImagePreview file={receiptPhoto} alt="Receipt" className="w-full h-36 object-cover" />
                    <button
                      type="button"
                      onClick={() => setReceiptPhoto(null)}
                      disabled={isUploading}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-all cursor-pointer hover:scale-110 z-10"
                      title={t('discardPhoto') || "Discard photo"}
                    >
                      <X size={13} />
                    </button>
                    <div className="p-2.5 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-emerald-600 font-medium truncate">✓ {receiptPhoto.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => fuelCameraInputRef.current?.click()}
                          disabled={isUploading}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Camera size={10} /> {t('cameraShot') || 'Camera'}
                        </button>
                        <button
                          type="button"
                          onClick={() => fuelGalleryInputRef.current?.click()}
                          disabled={isUploading}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <ImageIcon size={10} /> {t('galleryUpload') || 'Gallery'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => fuelCameraInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-4 border-2 border-dashed border-slate-300 hover:border-red-500 hover:bg-red-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
                    >
                      <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:scale-105 transition-transform">
                        <Camera size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-800">{t('cameraShot') || 'Camera Shot'}</span>
                      <span className="text-[10px] text-slate-500">Take Live Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fuelGalleryInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-4 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
                    >
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-105 transition-transform">
                        <ImageIcon size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-800">{t('galleryUpload') || 'Gallery Upload'}</span>
                      <span className="text-[10px] text-slate-500">From Photo Library</span>
                    </button>
                  </div>
                )}

                {/* GPS Stamp Info */}
                <div className="mt-2.5 p-2 bg-slate-100 rounded-xl flex items-center justify-between text-xs text-slate-600 border border-slate-200/70">
                  <div className="flex items-center gap-2 truncate">
                    <MapPin size={13} className={isAcquiringGps ? "animate-pulse text-amber-500 shrink-0" : "text-red-600 shrink-0"} />
                    <span className="truncate text-[11px]">
                      {isAcquiringGps ? 'Acquiring GPS fix...' : locationStr}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchGps}
                    disabled={isAcquiringGps}
                    className="p-1 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                    title="Refresh GPS"
                  >
                    <RefreshCw size={11} className={isAcquiringGps ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsOpen(false)} disabled={isUploading} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-medium">Cancel</button>
              <button 
                onClick={handleSubmit} 
                disabled={!cost || !receiptPhoto || isUploading}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Watermarking & Saving...</span>
                  </>
                ) : 'Save Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- Vehicle Condition Inspection & Lightbox Components ----------------

export function VehicleInspectionGallerySection({
  photos,
  vehicleName,
  plateNumber,
  dateStr,
  defaultExpanded = false,
  onOpenLightbox,
}: {
  photos?: string[];
  vehicleName?: string;
  plateNumber?: string;
  dateStr?: string;
  defaultExpanded?: boolean;
  onOpenLightbox: (photos: string[], index: number, title: string, subtitle?: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const photoCount = photos?.length || 0;

  return (
    <div className="mt-4 pt-3 border-t border-slate-200">
      {/* Expandable Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between text-left py-1 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <Camera size={15} className="text-red-600" />
          <span className="text-xs font-bold text-slate-800">
            Vehicle Condition & Inspection Gallery
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            photoCount > 0 
              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
              : 'bg-slate-200 text-slate-600'
          }`}>
            {photoCount} {photoCount === 1 ? 'Photo' : 'Photos'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500 font-medium group-hover:text-slate-700">
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expandable Gallery Grid */}
      {isExpanded && (
        <div className="mt-3">
          {photoCount > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {photos!.map((photoUrl, idx) => (
                <div
                  key={idx}
                  onClick={() => onOpenLightbox(
                    photos!,
                    idx,
                    'Vehicle Condition & Inspection Audit',
                    `${vehicleName || 'Vehicle'} (${plateNumber || 'N/A'}) • ${dateStr || ''}`
                  )}
                  className="group relative aspect-video sm:aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-900 cursor-pointer shadow-2xs hover:shadow-md transition-all"
                  title={`Click to inspect condition photo #${idx + 1}`}
                >
                  <img
                    src={photoUrl}
                    alt={`Inspection condition ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  {/* Hover Overlay with Zoom Icon */}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="p-1.5 bg-white/95 text-slate-900 rounded-full shadow-sm">
                      <Search size={16} />
                    </div>
                  </div>
                  {/* Photo Index Badge */}
                  <div className="absolute bottom-1.5 left-1.5 bg-slate-950/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs">
                    #{idx + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3.5 bg-white rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
              No vehicle condition inspection photos recorded for this check-in session.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VehicleLogInspectionModal({
  log,
  vehicle,
  officer,
  onClose,
  onOpenLightbox,
}: {
  log: VehicleLog;
  vehicle?: Vehicle;
  officer?: any;
  onClose: () => void;
  onOpenLightbox: (photos: string[], index: number, title: string, subtitle?: string) => void;
}) {
  const startKm = Number(log.startKm) || 0;
  const endKm = Number(log.endKm) || 0;
  const deltaKm = endKm > startKm ? endKm - startKm : 0;
  const startProof = log.dashboardPhotoUrl || log.startDashboardPhoto || log.startDashboardPhotoUrl;
  const endProof = log.endDashboardPhoto || log.endDashboardPhotoUrl || log.endPhotoUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
              <History size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">
                  Vehicle Trip Log Inspection & Audit
                </h2>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  log.endTime
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {log.endTime ? 'Completed Shift' : 'In Progress / Active'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {vehicle?.name || 'Vehicle'} ({vehicle?.plateNumber || log.vehicleId}) • {log.date || (log.startTime ? log.startTime.slice(0, 10) : '')}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Logistics Officer</span>
              <span className="font-bold text-slate-800 text-sm mt-0.5 block truncate">{officer?.name || 'Staff Member'}</span>
              <span className="text-[10px] text-slate-500">Field Officer</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Shift Timing</span>
              <span className="font-bold text-slate-800 text-sm mt-0.5 block font-mono">
                {log.startTime ? log.startTime.slice(11, 16) : '--:--'} &rarr; {log.endTime ? log.endTime.slice(11, 16) : 'Active'}
              </span>
              <span className="text-[10px] text-slate-500">{log.date}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Odometer</span>
              <span className="font-bold text-slate-800 text-sm mt-0.5 block font-mono">
                {startKm} &rarr; {endKm || '...'} km
              </span>
              <span className="text-[10px] text-slate-500">Recorded Readings</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Mileage Delta</span>
              <span className="font-bold text-red-600 text-sm mt-0.5 block font-mono">
                {deltaKm > 0 ? `+${deltaKm} km` : (log.endTime ? '0 km' : 'Active')}
              </span>
              <span className="text-[10px] text-slate-500">Net Shift Distance</span>
            </div>
          </div>

          {/* Dashboard Proofs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700">Check-In Dashboard Proof</span>
                <span className="text-xs font-mono font-bold text-slate-800">{startKm} km</span>
              </div>
              {startProof ? (
                <div 
                  onClick={() => onOpenLightbox(
                    [startProof],
                    0,
                    'Check-In Dashboard Proof',
                    `${vehicle?.name} (${vehicle?.plateNumber}) • ${startKm} km`
                  )}
                  className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group cursor-pointer shadow-2xs"
                >
                  <img src={startProof} alt="Start Dashboard" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Search size={18} className="text-white" />
                  </div>
                </div>
              ) : (
                <div className="aspect-video rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                  No dashboard proof recorded
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700">Check-Out Dashboard Proof</span>
                <span className="text-xs font-mono font-bold text-slate-800">{endKm ? `${endKm} km` : 'In Progress'}</span>
              </div>
              {endProof ? (
                <div 
                  onClick={() => onOpenLightbox(
                    [endProof],
                    0,
                    'Check-Out Dashboard Proof',
                    `${vehicle?.name} (${vehicle?.plateNumber}) • ${endKm} km`
                  )}
                  className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-900 group cursor-pointer shadow-2xs"
                >
                  <img src={endProof} alt="End Dashboard" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Search size={18} className="text-white" />
                  </div>
                </div>
              ) : (
                <div className="aspect-video rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                  {log.endTime ? 'No dashboard proof recorded' : 'Trip currently in progress'}
                </div>
              )}
            </div>
          </div>

          {/* Expandable Vehicle Condition & Inspection Gallery */}
          <VehicleInspectionGallerySection
            photos={log.checkInPhotos}
            vehicleName={vehicle?.name}
            plateNumber={vehicle?.plateNumber}
            dateStr={log.startTime ? log.startTime.slice(0, 16).replace('T', ' ') : log.date}
            defaultExpanded={true}
            onOpenLightbox={onOpenLightbox}
          />

          {/* Fuel Receipts (if any) */}
          {log.fuelReceipts && log.fuelReceipts.length > 0 && (
            <div className="pt-3 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-700 block mb-2 flex items-center gap-1.5">
                <Fuel size={14} className="text-red-600" />
                <span>Watermarked Fuel Receipts ({log.fuelReceipts.length})</span>
              </span>
              <div className="flex flex-wrap gap-3">
                {log.fuelReceipts.map((fr: any, idx: number) => (
                  <div
                    key={fr.id || idx}
                    onClick={() => onOpenLightbox(
                      [fr.photoUrl || fr.photo],
                      0,
                      `Fuel Refill Receipt (RM ${Number(fr.cost || fr.amount || 0).toFixed(2)})`,
                      `${vehicle?.name} (${vehicle?.plateNumber})`
                    )}
                    className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 pr-3 cursor-pointer hover:border-red-400 transition-all shadow-2xs"
                  >
                    <img src={fr.photoUrl || fr.photo} alt="Receipt" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">RM {Number(fr.cost || fr.amount || 0).toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block">Click to Inspect</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trip Notes (if any) */}
          {(log.checkInNotes || log.checkOutNotes || log.notes) && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText size={14} className="text-slate-500" />
                <span>Trip Notes</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {log.checkInNotes && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Check-In Notes</span>
                    <p className="text-slate-700 whitespace-pre-wrap">{log.checkInNotes}</p>
                  </div>
                )}
                {log.checkOutNotes && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Check-Out Notes</span>
                    <p className="text-slate-700 whitespace-pre-wrap">{log.checkOutNotes}</p>
                  </div>
                )}
              </div>
              {!log.checkInNotes && !log.checkOutNotes && log.notes && (
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs">
                  <p className="text-slate-700 whitespace-pre-wrap">{log.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Reported Issues (if any) */}
          {log.issueNotes && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Reported Issues & Driver Notes</span>
              </span>
              <p className="text-xs text-rose-700 italic">"{log.issueNotes}"</p>
              {log.issueMediaUrls && log.issueMediaUrls.length > 0 && (
                <div className="flex gap-2 pt-1">
                  {log.issueMediaUrls.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenLightbox(log.issueMediaUrls!, i, 'Vehicle Reported Issue Proof', vehicle?.name)}
                      className="w-12 h-12 rounded-lg border border-rose-300 overflow-hidden hover:opacity-80 cursor-pointer"
                    >
                      <img src={url} alt="Proof" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close Inspection
          </button>
        </div>
      </div>
    </div>
  );
}

export function InspectionLightboxModal({
  photos,
  initialIndex = 0,
  title = 'Vehicle Condition & Inspection Lightbox',
  subtitle,
  onClose,
}: {
  photos: string[];
  initialIndex?: number;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : photos.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setCurrentIndex(prev => (prev < photos.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, onClose]);

  if (!photos || photos.length === 0) return null;
  const currentPhoto = photos[currentIndex] || photos[0];

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-slate-950/95 backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      {/* Lightbox Top Bar */}
      <div 
        className="flex justify-between items-center bg-slate-900/80 px-3.5 sm:px-4 py-3 rounded-xl border border-slate-800 text-white shadow-lg shrink-0 pt-safe"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="p-2 bg-red-600/20 text-red-500 rounded-lg shrink-0">
            <Camera size={18} />
          </div>
          <div className="truncate">
            <h3 className="font-bold text-sm sm:text-base text-white truncate">{title}</h3>
            <p className="text-xs text-slate-400 truncate">
              {subtitle ? `${subtitle} • ` : ''}Photo {currentIndex + 1} of {photos.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={currentPhoto}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-colors"
            title="Open in new window"
          >
            <ExternalLink size={13} />
            <span>Full Resolution</span>
          </a>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close Lightbox (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Lightbox Image View with Navigation Arrows */}
      <div 
        className="relative flex-1 flex items-center justify-center my-3 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : photos.length - 1))}
            className="absolute left-2 sm:left-4 z-20 p-2.5 sm:p-3 bg-slate-900/80 hover:bg-red-600 text-white rounded-full transition-all cursor-pointer shadow-lg backdrop-blur-xs"
            title="Previous photo (Left Arrow)"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <div className="relative max-w-full max-h-[75vh] flex items-center justify-center">
          <img
            src={currentPhoto}
            alt={`Inspection photo ${currentIndex + 1}`}
            className="max-h-[75vh] max-w-[92vw] sm:max-w-[85vw] object-contain rounded-xl shadow-2xl border border-slate-800/80"
          />
        </div>

        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => setCurrentIndex(prev => (prev < photos.length - 1 ? prev + 1 : 0))}
            className="absolute right-2 sm:right-4 z-20 p-2.5 sm:p-3 bg-slate-900/80 hover:bg-red-600 text-white rounded-full transition-all cursor-pointer shadow-lg backdrop-blur-xs"
            title="Next photo (Right Arrow)"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Lightbox Footer & Filmstrip */}
      <div 
        className="bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-white shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin size={13} className="text-red-500 shrink-0" />
          <span>Visual audit watermark stamped with GPS coordinates & timestamps on bottom banner</span>
        </div>

        {/* Filmstrip thumbnails */}
        {photos.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1">
            {photos.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                  currentIndex === idx
                    ? 'border-red-500 scale-105 shadow-md'
                    : 'border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={p} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {currentIndex + 1} / {photos.length}
          </span>
          <a
            href={currentPhoto}
            target="_blank"
            rel="noreferrer"
            className="sm:hidden text-xs text-red-400 font-semibold hover:underline"
          >
            Full Res ↗
          </a>
        </div>
      </div>
    </div>
  );
}
