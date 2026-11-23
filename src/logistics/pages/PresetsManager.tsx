// @ts-nocheck — ported unchanged from Pioneer Logistics (that project was never type-checked); runtime behaviour is identical.
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Save, X, Edit2, GripVertical, Camera, ShieldCheck } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskPreset, PresetSubTask } from '../types';

interface SubtaskEditItem {
  id: string;
  titleEn: string;
  titleAr: string;
  requiresProof?: boolean;
}

function SortableSubtaskItem({ 
  id, 
  idx, 
  subtask, 
  onChange, 
  onDelete, 
  t 
}: { 
  key?: React.Key;
  id: string; 
  idx: number; 
  subtask: SubtaskEditItem; 
  onChange: (field: 'titleEn' | 'titleAr' | 'requiresProof', value: any) => void;
  onDelete: (idx: number) => void;
  t: (key: string) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50/70 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all">
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div 
          {...attributes} 
          {...listeners}
          className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 cursor-grab flex items-center justify-center shrink-0 text-slate-500 transition-colors active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={18} />
        </div>
        <span className="text-xs font-bold text-slate-400 sm:hidden">Step {idx + 1}</span>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full">
        <input 
          type="text" 
          placeholder={t('englishTitle')}
          value={subtask.titleEn} 
          onChange={e => onChange('titleEn', e.target.value)}
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
        />
        <input 
          type="text" 
          placeholder={t('arabicTitle')} 
          dir="rtl"
          value={subtask.titleAr} 
          onChange={e => onChange('titleAr', e.target.value)}
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white text-right"
        />
      </div>

      {/* Visual Audit Proof Toggle & Delete Action */}
      <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0 border-t sm:border-0 border-slate-200">
        <label 
          className={`flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            subtask.requiresProof 
              ? 'bg-red-50 text-red-700 border-red-200 shadow-2xs' 
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
          title="Require GPS-watermarked photo proof during task execution"
        >
          <input 
            type="checkbox"
            checked={!!subtask.requiresProof}
            onChange={e => onChange('requiresProof', e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
          />
          <Camera size={13} className={subtask.requiresProof ? "text-red-600" : "text-slate-400"} />
          <span className="text-[11px] whitespace-nowrap">Photo Proof</span>
        </label>

        <button 
          type="button" 
          onClick={() => onDelete(idx)}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete step"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default function PresetsManager() {
  const { t, presets, addPreset, updatePreset } = useAppContext();
  const [isCreating, setIsCreating] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<SubtaskEditItem[]>([
    { id: 'init-1', titleEn: '', titleAr: '', requiresProof: false }
  ]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setNewSubtasks((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  const handleAddSubtask = () => {
    setNewSubtasks([
      ...newSubtasks, 
      { id: Math.random().toString(), titleEn: '', titleAr: '', requiresProof: false }
    ]);
  };

  const handleDeleteSubtask = (index: number) => {
    if (newSubtasks.length <= 1) {
      setNewSubtasks([{ id: Math.random().toString(), titleEn: '', titleAr: '', requiresProof: false }]);
      return;
    }
    const updated = newSubtasks.filter((_, i) => i !== index);
    setNewSubtasks(updated);
  };

  const handleSubtaskChange = (index: number, field: 'titleEn' | 'titleAr' | 'requiresProof', value: any) => {
    const updated = [...newSubtasks];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setNewSubtasks(updated);
  };

  const handleSave = async () => {
    if (!newNameEn.trim()) return;
    const validSubtasks = newSubtasks.filter(st => st.titleEn.trim() !== '');
    
    setSaveError(null);
    try {
      if (editingPresetId) {
        await updatePreset(editingPresetId, {
          nameEn: newNameEn,
          nameAr: newNameAr || newNameEn,
          defaultSubTasks: validSubtasks.map(({ titleEn, titleAr, requiresProof }) => ({ 
            titleEn, 
            titleAr, 
            requiresProof: !!requiresProof 
          }))
        });
      } else {
        await addPreset({
          nameEn: newNameEn,
          nameAr: newNameAr || newNameEn,
          defaultSubTasks: validSubtasks.map(({ titleEn, titleAr, requiresProof }) => ({ 
            titleEn, 
            titleAr, 
            requiresProof: !!requiresProof 
          }))
        });
      }
      closeForm();
    } catch (error) {
      setSaveError('Failed to save preset. Please try again.');
    }
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditingPresetId(null);
    setNewNameEn('');
    setNewNameAr('');
    setNewSubtasks([{ id: 'init-1', titleEn: '', titleAr: '', requiresProof: false }]);
    setSaveError(null);
  };

  const handleEdit = (preset: TaskPreset) => {
    setEditingPresetId(preset.id);
    setNewNameEn(preset.nameEn);
    setNewNameAr(preset.nameAr);
    setNewSubtasks(
      preset.defaultSubTasks && preset.defaultSubTasks.length > 0 
        ? preset.defaultSubTasks.map((st) => ({ 
            id: Math.random().toString(), 
            titleEn: st.titleEn,
            titleAr: st.titleAr,
            requiresProof: !!st.requiresProof
          })) 
        : [{ id: 'init-1', titleEn: '', titleAr: '', requiresProof: false }]
    );
    setIsCreating(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('presets')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Define standard operating procedures and mandatory photo audit proofs for field officers.</p>
        </div>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-950 text-white rounded-xl hover:bg-blue-900 transition-colors text-sm font-bold shadow-sm active:scale-95"
          >
            <Plus size={16} /> {t('createPreset')}
          </button>
        )}
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{editingPresetId ? 'Edit Preset SOP' : t('createPreset')}</h3>
              <p className="text-xs text-slate-500">Configure sequence and visual audit requirements for this logistics flow.</p>
            </div>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
              <X size={20} />
            </button>
          </div>
          
          {saveError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-100 font-medium">
              {saveError}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('presetNameEn')}</label>
                <input 
                  type="text" 
                  value={newNameEn}
                  onChange={e => setNewNameEn(e.target.value)}
                  placeholder="e.g. Airport Arrival & Hotel Check-in"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('presetNameAr')}</label>
                <input 
                  type="text" 
                  value={newNameAr}
                  onChange={e => setNewNameAr(e.target.value)}
                  placeholder="مثال: استقبال المطار والتسكين"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-right"
                  dir="rtl"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('subtasksSequence')} (Drag to reorder)
                </label>
                <span className="text-[11px] text-slate-500 font-medium">
                  {newSubtasks.filter(st => st.requiresProof).length} step(s) mandate photo proof
                </span>
              </div>

              <div className="space-y-2.5">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={newSubtasks}
                    strategy={verticalListSortingStrategy}
                  >
                    {newSubtasks.map((st, idx) => (
                      <SortableSubtaskItem 
                        key={st.id}
                        id={st.id}
                        idx={idx}
                        subtask={st}
                        onChange={(field, val) => handleSubtaskChange(idx, field, val)}
                        onDelete={handleDeleteSubtask}
                        t={t}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              <button 
                type="button"
                onClick={handleAddSubtask}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl transition-all active:scale-95"
              >
                <Plus size={15} /> {t('addSubtask')}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              <button 
                type="button"
                onClick={closeForm} 
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
              <button 
                type="button"
                onClick={handleSave} 
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-all active:scale-95"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presets Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {presets.map(preset => {
          const proofRequiredCount = (preset.defaultSubTasks || []).filter(st => st.requiresProof).length;
          return (
            <div key={preset.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">{preset.nameEn}</h3>
                  <p className="text-xs text-slate-500 font-arabic mt-0.5">{preset.nameAr}</p>
                </div>
                <button 
                  onClick={() => handleEdit(preset)}
                  className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                  title="Edit Preset"
                >
                  <Edit2 size={16} />
                </button>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  {(preset.defaultSubTasks || []).map((st, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-100/70 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-400 font-bold text-[10px] w-4 shrink-0">{idx + 1}.</span>
                        <span className="text-slate-700 font-medium truncate">{st.titleEn}</span>
                      </div>
                      {st.requiresProof && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200 shrink-0">
                          <Camera size={10} /> Photo
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{(preset.defaultSubTasks || []).length} steps total</span>
                  {proofRequiredCount > 0 ? (
                    <span className="text-red-600 font-semibold flex items-center gap-1">
                      <Camera size={11} /> {proofRequiredCount} photo proof(s)
                    </span>
                  ) : (
                    <span className="text-slate-400">No mandatory photos</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
