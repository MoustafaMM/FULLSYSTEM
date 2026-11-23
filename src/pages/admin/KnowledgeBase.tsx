import { useState } from 'react';
import { Empty, ErrorNote, Field, Modal, PageHead } from '../../components/ui';
import { useCollection } from '../../lib/hooks';
import { kbQuery } from '../../lib/queries';
import { deleteKb, saveKb } from '../../lib/actions';
import type { KbEntry } from '../../lib/types';

export const KB_CATEGORIES = ['Products & pricing', 'Internal process', 'University process', 'Visa / EMGS', 'Logistics', 'General'];

export default function KnowledgeBase() {
  const { data, error } = useCollection<KbEntry>(kbQuery(), []);
  const [editing, setEditing] = useState<Partial<KbEntry> | null>(null);
  const [cat, setCat] = useState('all');
  const rows = data.filter((k) => cat === 'all' || k.category === cat).sort((a, b) => a.category.localeCompare(b.category));
  return (
    <>
      <PageHead title="Chatbot Answers" sub="The Sales Assistant answers only from these entries (no AI API)."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ category: KB_CATEGORIES[0], keywords: [] })}>+ Add answer</button>} />
      <ErrorNote error={error} />
      <div className="chips">
        <button className={cat === 'all' ? 'chip on' : 'chip'} onClick={() => setCat('all')}>All ({data.length})</button>
        {KB_CATEGORIES.map((c) => <button key={c} className={cat === c ? 'chip on' : 'chip'} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      {rows.length === 0 ? <Empty>No answers yet. Run <code>npm run seed:kb</code> for starter entries.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Question</th><th>Answer</th><th>Keywords</th><th /></tr></thead>
            <tbody>{rows.map((k) => (
              <tr key={k.id}>
                <td>{k.category}</td><td><strong>{k.question}</strong></td><td className="pre">{k.answer}</td>
                <td className="small">{k.keywords.join(', ')}</td>
                <td className="row gap"><button className="btn btn-sm" onClick={() => setEditing(k)}>Edit</button>
                  <button className="btn btn-sm btn-danger-ghost" onClick={() => confirm('Delete this answer?') && deleteKb(k.id)}>Delete</button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <KbForm entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function KbForm({ entry, onClose }: { entry: Partial<KbEntry>; onClose: () => void }) {
  const [category, setCategory] = useState(entry.category ?? KB_CATEGORIES[0]);
  const [question, setQuestion] = useState(entry.question ?? '');
  const [answer, setAnswer] = useState(entry.answer ?? '');
  const [keywords, setKeywords] = useState((entry.keywords ?? []).join(', '));
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try { await saveKb({ category, question, answer, keywords: keywords.split(',') }, entry.id); onClose(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={entry.id ? 'Edit answer' : 'Add answer'} onClose={onClose} wide>
      <ErrorNote error={err} />
      <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value)}>{KB_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Question"><input value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
      <Field label="Answer"><textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
      <Field label="Keywords (comma separated — include university names, Arabic terms, common misspellings)"><input value={keywords} onChange={(e) => setKeywords(e.target.value)} /></Field>
      <div className="row gap end"><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!question || !answer} onClick={save}>Save</button></div>
    </Modal>
  );
}
