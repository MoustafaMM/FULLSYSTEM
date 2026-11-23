import { format } from 'date-fns';
import { Expense, ExpenseCategory, Task, Vehicle, VehicleLog } from '../types';
import { normalizeTaskStatus } from './taskClassification';

export type VehicleDetectionSource =
  | 'active_trip'
  | 'checked_out'
  | 'task'
  | 'today_trip'
  | 'assigned'
  | null;

export interface DetectedVehicleResult {
  vehicle: Vehicle | null;
  source: VehicleDetectionSource;
}

export interface ResolvedExpenseVehicle {
  id?: string;
  name: string;
  plateNumber?: string;
  label: string;
}

/**
 * Returns true if the expense category requires / benefits from tracking which fleet vehicle was used.
 */
export function isVehicleExpenseCategory(category?: ExpenseCategory | string | null): boolean {
  return category === 'Fuel' || category === 'Tolls' || category === 'Parking';
}

/**
 * Formats a vehicle display label consistently as "Name (Plate)" when plate is present.
 */
export function formatVehicleLabel(vehicle?: { name?: string; plateNumber?: string } | null): string {
  if (!vehicle) return '';
  const name = vehicle.name?.trim() || '';
  const plate = vehicle.plateNumber?.trim() || '';
  if (name && plate) return `${name} (${plate})`;
  return name || plate;
}

/**
 * Resolves vehicle display information for an Expense record, preferring live fleet data
 * by vehicleId and falling back to denormalized vehicleName/vehiclePlateNumber snapshots.
 */
export function resolveExpenseVehicle(
  expense?: Pick<Expense, 'vehicleId' | 'vehicleName' | 'vehiclePlateNumber'> | null,
  vehicles: Vehicle[] = []
): ResolvedExpenseVehicle | null {
  if (!expense) return null;
  const matched = expense.vehicleId ? vehicles.find(v => v.id === expense.vehicleId) : undefined;
  const name = matched?.name?.trim() || expense.vehicleName?.trim() || '';
  const plateNumber = matched?.plateNumber?.trim() || expense.vehiclePlateNumber?.trim() || '';

  if (!name && !plateNumber) return null;

  const displayName = name || plateNumber;
  const label = name && plateNumber ? `${name} (${plateNumber})` : displayName;

  return {
    id: matched?.id || expense.vehicleId || undefined,
    name: displayName,
    plateNumber: plateNumber || undefined,
    label,
  };
}

function getLogTimestampMs(log: VehicleLog): number {
  const raw = log.startTime || log.date;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return isNaN(ms) ? 0 : ms;
}

function isLogFromDate(log: VehicleLog, targetDateStr: string): boolean {
  if (log.date === targetDateStr) return true;
  if (log.startTime) {
    try {
      return format(new Date(log.startTime), 'yyyy-MM-dd') === targetDateStr;
    } catch {
      return log.startTime.slice(0, 10) === targetDateStr;
    }
  }
  return false;
}

/**
 * Automatically detects which fleet vehicle a user is currently driving / using.
 *
 * Detection priority:
 * 1. Open active trip session (`vehicleLogs` with `startTime` and no `endTime` for `userId`)
 * 2. Vehicle currently flagged `isCheckedOut` with `assignedOfficerId === userId`
 * 3. Explicit vehicle attached to the linked `task` (`task.vehicleId`)
 * 4. Most recent trip log recorded today by `userId` (unless currently checked out by someone else)
 * 5. Officer's current `in_progress` task vehicle (if logging under general / another task without vehicleId)
 * 6. Vehicle where `assignedOfficerId === userId` (unless currently checked out by someone else)
 */
export function detectActiveUserVehicle({
  userId,
  vehicles,
  vehicleLogs,
  task,
  activeTasks = [],
  todayStr = format(new Date(), 'yyyy-MM-dd'),
}: {
  userId?: string | null;
  vehicles: Vehicle[];
  vehicleLogs: VehicleLog[];
  task?: Task | null;
  activeTasks?: Task[];
  todayStr?: string;
}): DetectedVehicleResult {
  if (!vehicles || vehicles.length === 0) {
    return { vehicle: null, source: null };
  }

  // Track which vehicles are currently checked out in an open trip by a different user
  const openLogsAll = vehicleLogs
    .filter(l => Boolean(l.startTime) && !l.endTime)
    .sort((a, b) => getLogTimestampMs(b) - getLogTimestampMs(a));

  const checkedOutByOtherUser = new Set<string>();
  for (const log of openLogsAll) {
    if (userId && log.userId !== userId) {
      checkedOutByOtherUser.add(log.vehicleId);
    }
  }

  // 1. Live active trip session in vehicleLogs for this user
  if (userId) {
    const myOpenLogs = openLogsAll.filter(l => l.userId === userId);
    for (const log of myOpenLogs) {
      const matched = vehicles.find(v => v.id === log.vehicleId);
      if (matched) {
        return { vehicle: matched, source: 'active_trip' };
      }
    }

    // 2. Flagged checked out on vehicle document for this user
    const checkedOutVehicle =
      vehicles.find(v => v.isCheckedOut && v.assignedOfficerId === userId && v.status === 'active') ||
      vehicles.find(v => v.isCheckedOut && v.assignedOfficerId === userId);
    if (checkedOutVehicle) {
      return { vehicle: checkedOutVehicle, source: 'checked_out' };
    }
  }

  // 3. Linked task explicitly specifies a vehicle
  if (task?.vehicleId) {
    const taskVehicle = vehicles.find(v => v.id === task.vehicleId);
    if (taskVehicle) {
      return { vehicle: taskVehicle, source: 'task' };
    }
  }

  // 4. Today's most recent completed trip log for this user (not taken by another driver since)
  if (userId) {
    const myTodayLogs = vehicleLogs
      .filter(l => l.userId === userId && isLogFromDate(l, todayStr))
      .sort((a, b) => getLogTimestampMs(b) - getLogTimestampMs(a));

    for (const log of myTodayLogs) {
      const matched = vehicles.find(v => v.id === log.vehicleId);
      if (matched && !checkedOutByOtherUser.has(matched.id)) {
        return { vehicle: matched, source: 'today_trip' };
      }
    }

    // 5. Fallback to an active in_progress task assigned to this officer that specifies a vehicle
    const inProgressTaskWithVehicle = activeTasks.find(
      t => t.assigneeId === userId && normalizeTaskStatus(t) === 'in_progress' && Boolean(t.vehicleId)
    );
    if (inProgressTaskWithVehicle?.vehicleId) {
      const activeTaskVeh = vehicles.find(v => v.id === inProgressTaskWithVehicle.vehicleId);
      if (activeTaskVeh && !checkedOutByOtherUser.has(activeTaskVeh.id)) {
        return { vehicle: activeTaskVeh, source: 'task' };
      }
    }

    // 6. Vehicle directly associated with this officer in fleet registry (not taken by another driver)
    const assignedVehicle =
      vehicles.find(
        v => v.assignedOfficerId === userId && v.status === 'active' && !checkedOutByOtherUser.has(v.id)
      ) ||
      vehicles.find(v => v.assignedOfficerId === userId && !checkedOutByOtherUser.has(v.id));

    if (assignedVehicle) {
      return { vehicle: assignedVehicle, source: 'assigned' };
    }
  }

  return { vehicle: null, source: null };
}
