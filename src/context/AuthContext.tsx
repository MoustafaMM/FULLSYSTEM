import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AppUser } from '../lib/types';

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsub = onAuthStateChanged(auth, (u) => {
      unsubProfile?.();
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          if (!snap.exists()) { setProfile(null); setError('Your account has no role yet. Ask an admin to set it up.'); }
          else {
            const p = { uid: u.uid, ...snap.data() } as AppUser;
            if (p.active === false) { setProfile(null); setError('Your account is deactivated.'); }
            else {
              // role / active live in Firebase Auth custom claims too (used by the Logistics database rules):
              // refresh the token whenever the profile changes so the new claims apply straight away
              u.getIdToken(true).catch(() => undefined);
              setProfile(p); setError(null);
            }
          }
          setLoading(false);
        },
        (e) => { setError(e.message); setLoading(false); },
      );
    });
    return () => { unsub(); unsubProfile?.(); };
  }, []);

  const value: AuthState = {
    user, profile, loading, error,
    login: async (email, password) => { await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password); },
    logout: () => signOut(auth),
    resetPassword: (email) => sendPasswordResetEmail(auth, email.trim().toLowerCase()),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** For pages behind <RequireRole>: profile is guaranteed. */
export function useMe(): AppUser {
  const { profile } = useAuth();
  if (!profile) throw new Error('No profile');
  return profile;
}
