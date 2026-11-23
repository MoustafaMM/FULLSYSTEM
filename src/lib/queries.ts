import { collection, orderBy, query, where, limit, type Query } from 'firebase/firestore';
import { db } from './firebase';
import type { AppUser } from './types';
import { db as ldb } from '../logistics/config/firebase';

/** Counselors only ever query their own students (Firestore rules enforce the same). */
export function studentsQuery(me: AppUser): Query {
  const col = collection(db, 'students');
  return me.role === 'counselor'
    ? query(col, where('counselorId', '==', me.uid))
    : query(col);
}

export function trackerQuery(me: AppUser): Query {
  const col = collection(db, 'trackerApps');
  return me.role === 'counselor' ? query(col, where('counselorId', '==', me.uid)) : query(col);
}

/** All logistics tasks (logistics database) — admin / QC overview. */
export const logiTasksQuery = () => query(collection(ldb, 'tasks'));
export const logiTasksForStudent = (studentId: string) => query(collection(ldb, 'tasks'), where('studentId', '==', studentId));

export const followupsQuery = (me: AppUser) =>
  me.role === 'admin'
    ? query(collection(db, 'followups'))
    : query(collection(db, 'followups'), where('ownerId', '==', me.uid));

export const usersQuery = () => query(collection(db, 'users'));
export const kbQuery = () => query(collection(db, 'kb'));
export const flagsQuery = () => query(collection(db, 'qcFlags'));
export const auditQuery = (n = 300) => query(collection(db, 'auditLog'), orderBy('at', 'desc'), limit(n));
