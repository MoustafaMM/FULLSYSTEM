import { useState, type FormEvent } from 'react';
import { Field, Modal, ErrorNote } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { createStudent, updateStudentInfo, type NewStudentInput } from '../../lib/actions';
import { useCollection } from '../../lib/hooks';
import { usersQuery } from '../../lib/queries';
import { MAX_MANUAL } from '../../lib/pipeline';
import { countries } from '../../lib/countries';
import { UNIVERSITIES } from '../../lib/universities';
import type { AppUser, Student } from '../../lib/types';

export default function StudentForm({ student, onClose }: { student?: Student; onClose: () => void }) {
  const me = useMe();
  const isAdmin = me.role === 'admin';
  const { data: users } = useCollection<AppUser & { id: string }>(isAdmin ? usersQuery() : null, [isAdmin]);
  const counselors = users.filter((u) => u.role === 'counselor').map((u) => ({ ...u, uid: u.id }));

  const [f, setF] = useState<NewStudentInput>({
    name: student?.name ?? '', email: student?.email ?? '', phone: student?.phone ?? '',
    nationality: student?.nationality ?? '', nationalityCode: student?.nationalityCode ?? '', passportNo: student?.passportNo ?? '',
    university: student?.university ?? '', program: student?.program ?? '', intake: student?.intake ?? '',
    expectedValue: student?.expectedValue ?? 0, confidence: student?.confidence ?? 20,
    arrivalDate: student?.arrivalDate ?? '', arrivalTime: student?.arrivalTime ?? '', airline: student?.airline ?? '',
    flightNumber: student?.flightNumber ?? '', hotel: student?.hotel ?? '', servicePackage: student?.servicePackage ?? 'Free',
  });
  const [counselorId, setCounselorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof NewStudentInput>(k: K, v: NewStudentInput[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (student) await updateStudentInfo(me, student, f);
      else {
        const owner = isAdmin ? counselors.find((c) => c.uid === counselorId) : undefined;
        if (isAdmin && !owner) throw new Error('Choose the counselor for this student.');
        await createStudent(me, f, owner);
      }
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={student ? 'Edit student' : 'Add student'} onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <ErrorNote error={err} />
        <Field label="Full name *"><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone / WhatsApp *"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
        <Field label="Nationality * (used for the EMGS check)">
          <select value={f.nationalityCode} required onChange={(e) => {
            const c = countries.find((x) => x.code === e.target.value);
            setF((p) => ({ ...p, nationalityCode: c?.code ?? '', nationality: c?.name ?? '' }));
          }}>
            <option value="">— choose —</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Passport no. (needed for the Visa Tracker)"><input value={f.passportNo} onChange={(e) => set('passportNo', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
        <Field label="University *">
          <input list="uni-list" value={f.university} onChange={(e) => set('university', e.target.value)} required />
          <datalist id="uni-list">{UNIVERSITIES.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Program"><input value={f.program} onChange={(e) => set('program', e.target.value)} /></Field>
        <Field label="Intake (month)"><input type="month" value={f.intake} onChange={(e) => set('intake', e.target.value)} /></Field>
        <Field label="Expected value (RM)">
          <input type="number" min={0} value={f.expectedValue} onChange={(e) => set('expectedValue', Number(e.target.value))} />
        </Field>
        <div className="span-2 form-section">Arrival (for Logistics)</div>
        <Field label="Arrival date"><input type="date" value={f.arrivalDate} onChange={(e) => set('arrivalDate', e.target.value)} /></Field>
        <Field label="Arrival time"><input type="time" value={f.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} /></Field>
        <Field label="Airline"><input value={f.airline} onChange={(e) => set('airline', e.target.value)} /></Field>
        <Field label="Flight no."><input value={f.flightNumber} onChange={(e) => set('flightNumber', e.target.value.toUpperCase())} /></Field>
        <Field label="Hotel / accommodation"><input value={f.hotel} onChange={(e) => set('hotel', e.target.value)} /></Field>
        <Field label="Service package">
          <select value={f.servicePackage} onChange={(e) => set('servicePackage', e.target.value)}>
            <option>Free</option><option>300$</option><option>500$</option><option>300$(Free)</option>
          </select>
        </Field>
        {isAdmin && !student && (
          <Field label="Counselor *">
            <select value={counselorId} onChange={(e) => setCounselorId(e.target.value)} required>
              <option value="">— choose —</option>
              {counselors.map((c) => <option key={c.uid} value={c.uid}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {!student && (
          <div className="span-2">
            <Field label={`Confidence of confirmation: ${f.confidence}%${f.confidence >= MAX_MANUAL ? ' — Predicted' : ' — Lead'}`}>
              <input type="range" min={0} max={MAX_MANUAL} step={5} value={f.confidence}
                onChange={(e) => set('confidence', Number(e.target.value))} />
            </Field>
            <p className="muted small">You can set up to {MAX_MANUAL}% (Predicted). 100% is set when the visa payment is recorded.</p>
          </div>
        )}
        <div className="span-2 row gap end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
