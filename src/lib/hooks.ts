import { useEffect, useState } from 'react';
import { onSnapshot, type Query, type DocumentReference } from 'firebase/firestore';

/** Live query → typed array with ids. Pass null to skip (e.g. until profile is loaded). */
export function useCollection<T>(q: Query | null, deps: unknown[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!q) { setData([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError(null);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

export function useDocument<T>(ref: DocumentReference | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref) { setData(null); setLoading(false); return; }
    return onSnapshot(
      ref,
      (snap) => { setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null); setLoading(false); },
      (err) => { setError(err.message); setLoading(false); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}
