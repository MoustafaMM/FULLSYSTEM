import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHead } from '../components/ui';
import { useCollection } from '../lib/hooks';
import { kbQuery } from '../lib/queries';
import type { KbEntry } from '../lib/types';

interface Msg { from: 'me' | 'bot'; text: string; suggestions?: KbEntry[] }

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'how', 'do', 'does', 'for', 'to', 'of', 'in', 'and', 'or', 'i', 'we', 'can', 'my', 'me', 'it', 'on', 'with', 'about', 'please', 'tell']);

const tokens = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Keyword scoring: keyword phrase hit = 3, question word overlap = 1, answer word overlap = 0.3 */
function rank(q: string, kb: KbEntry[]) {
  const qt = tokens(q);
  const ql = q.toLowerCase();
  return kb
    .map((k) => {
      let score = 0;
      for (const kw of k.keywords) if (kw && ql.includes(kw)) score += 3;
      const qw = new Set(tokens(k.question));
      const aw = new Set(tokens(k.answer));
      for (const t of qt) { if (qw.has(t)) score += 1; else if (aw.has(t)) score += 0.3; }
      return { k, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export default function Chatbot() {
  const { data: kb } = useCollection<KbEntry>(kbQuery(), []);
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: 'Hi! Ask me about products & pricing, internal process, university processes or visa steps.' }]);
  const [input, setInput] = useState('');
  const [cat, setCat] = useState('all');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);

  const pool = kb.filter((k) => cat === 'all' || k.category === cat);
  const cats = Array.from(new Set(kb.map((k) => k.category)));

  function ask(text: string) {
    if (!text.trim()) return;
    const hits = rank(text, pool);
    const reply: Msg = hits.length
      ? { from: 'bot', text: hits[0].k.answer, suggestions: hits.slice(1, 4).map((h) => h.k) }
      : { from: 'bot', text: "I don't have an answer for that yet. Please ask your manager — an admin can add it under Chatbot Answers.", suggestions: pool.slice(0, 3) };
    setMsgs((m) => [...m, { from: 'me', text }, reply]);
    setInput('');
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(input); };

  return (
    <>
      <PageHead title="Sales Assistant" sub={`${kb.length} answers loaded`}
        actions={<select value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All topics</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>} />
      <div className="chat">
        <div className="chat-log">
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.from}`}>
              <div className="pre">{m.text}</div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="suggest">
                  <span className="muted small">Related:</span>
                  {m.suggestions.map((s) => <button key={s.id} className="chip" onClick={() => ask(s.question)}>{s.question}</button>)}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="chat-input" onSubmit={submit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a question…" autoFocus />
          <button className="btn btn-primary">Send</button>
        </form>
      </div>
    </>
  );
}
