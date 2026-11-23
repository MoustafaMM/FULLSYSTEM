// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, User, Activity, Clock } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import {
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskSubjectName,
  isOpenTask,
  normalizeTaskStatus
} from '../utils/taskClassification';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Distinct canonical marker icons: Blue pulsing for live in_progress vs Amber for pending standby
const inProgressIcon = L.divIcon({
  html: renderToString(
    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md ring-4 ring-blue-400/35">
      <User size={16} />
    </div>
  ),
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const pendingIcon = L.divIcon({
  html: renderToString(
    <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md">
      <Clock size={15} />
    </div>
  ),
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Helper to generate a deterministic but pseudo-random coordinate around a center
const generateJitteredCoord = (id: string, center: [number, number], radiusInKm: number = 5) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to a pseudo-random value between 0 and 1
  const rand1 = Math.abs(Math.sin(hash)) * 10000;
  const rand2 = Math.abs(Math.cos(hash)) * 10000;
  
  const random1 = rand1 - Math.floor(rand1);
  const random2 = rand2 - Math.floor(rand2);

  const radiusInDegrees = radiusInKm / 111; // 1 degree is roughly 111km
  
  const w = radiusInDegrees * Math.sqrt(random1);
  const t = 2 * Math.PI * random2;
  const x = w * Math.cos(t);
  const y = w * Math.sin(t);

  // Adjust x for longitude distortion
  const adjustedX = x / Math.cos(center[0] * (Math.PI / 180));

  return [center[0] + y, center[1] + adjustedX] as [number, number];
};

export default function LiveMap() {
  const { tasks, students, users, presets, t, language } = useAppContext();
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'pending'>('all');

  // Default center: Kuala Lumpur
  const defaultCenter: [number, number] = [3.1390, 101.6869];

  const allOpenMapTasks = useMemo(() => {
    const openTasks = tasks.filter(task => isOpenTask(task));

    return openTasks.map(task => {
      const assignee = users.find(u => u.id === task.assigneeId);
      const coords = assignee?.lastLocation
        ? [assignee.lastLocation.lat, assignee.lastLocation.lng] as [number, number]
        : generateJitteredCoord(task.id, defaultCenter);

      return {
        ...task,
        status: normalizeTaskStatus(task),
        category: getTaskCategory(task),
        studentName: getTaskSubjectName(task, students, language),
        assigneeName: assignee?.name || 'Unknown Officer',
        presetName: getTaskDisplayTitle(task, presets, language),
        coords,
        lastLocationTime: assignee?.lastLocation?.timestamp,
      };
    });
  }, [tasks, students, users, presets, language]);

  const inProgressCount = useMemo(
    () => allOpenMapTasks.filter(item => item.status === 'in_progress').length,
    [allOpenMapTasks]
  );
  const pendingCount = useMemo(
    () => allOpenMapTasks.filter(item => item.status === 'pending').length,
    [allOpenMapTasks]
  );

  const visibleMapTasks = useMemo(() => {
    if (statusFilter === 'all') return allOpenMapTasks;
    return allOpenMapTasks.filter(item => item.status === statusFilter);
  }, [allOpenMapTasks, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="text-red-600" /> {t('liveMap') || 'Live Map'}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Open ({allOpenMapTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              statusFilter === 'in_progress'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            }`}
          >
            <Activity size={13} />
            <span>{t('in_progress') || 'In Progress'} ({inProgressCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Clock size={13} />
            <span>{t('pending') || 'Pending'} ({pendingCount})</span>
          </button>
        </div>
      </div>

      <div className="relative z-0 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 210px)', minHeight: '500px' }}>
        <MapContainer 
          center={defaultCenter} 
          zoom={12} 
          className="relative z-0"
          style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        >
          <TileLayer
            key={import.meta.env.VITE_CARTO_API_KEY || 'cb1_33fs_1_e906bb0983afeca0a0534074'}
            url={`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${import.meta.env.VITE_CARTO_API_KEY || 'cb1_33fs_1_e906bb0983afeca0a0534074'}`}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          {visibleMapTasks.map(task => (
            <Marker
              key={task.id}
              position={task.coords}
              icon={task.status === 'in_progress' ? inProgressIcon : pendingIcon}
            >
              <Popup className="rounded-xl overflow-hidden shadow-xl border-0">
                <div className="p-2 min-w-[200px]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-bold text-slate-900">{task.assigneeName}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      task.category === 'non_student'
                        ? 'bg-purple-100 text-purple-700'
                        : task.category === 'student_custom'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {task.category === 'non_student'
                        ? (t('nonStudentCategory') || 'Non-Student')
                        : task.category === 'student_custom'
                        ? (t('studentCustomCategory') || 'Student Custom')
                        : (t('studentPresetCategory') || 'Student SOP')}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <p className="text-slate-600 flex justify-between gap-4">
                      <span className="text-slate-400">
                        {task.isNonStudentTask ? 'Beneficiary:' : 'Student:'}
                      </span> 
                      <span className="font-medium text-slate-900">{task.studentName}</span>
                    </p>
                    <p className="text-slate-600 flex justify-between gap-4">
                      <span className="text-slate-400">Task:</span> 
                      <span className="font-medium text-slate-900">{task.presetName}</span>
                    </p>
                    <p className="text-slate-600 flex justify-between gap-4">
                      <span className="text-slate-400">Status:</span> 
                      <span className={`font-bold ${task.status === 'in_progress' ? 'text-blue-600' : 'text-amber-600'}`}>
                        {task.status === 'in_progress' ? (t('in_progress') || 'In Progress') : (t('pending') || 'Pending')}
                      </span>
                    </p>
                    {task.lastLocationTime && (
                      <p className="text-slate-600 flex justify-between gap-4 mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-400">Last Seen:</span> 
                        <span className="font-medium text-slate-500">
                          {new Date(task.lastLocationTime).toLocaleTimeString()}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
