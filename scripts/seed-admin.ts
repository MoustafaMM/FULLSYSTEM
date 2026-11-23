/**
 * Create (or promote) the first admin.
 *   npm run seed:admin -- you@example.com "Your Name" StrongPass123
 */
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, syncAccess } from '../server/firebaseAdmin';

const [email, name = 'Admin', password] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run seed:admin -- <email> "<name>" [password]');
  process.exit(1);
}

const lower = email.trim().toLowerCase();
let uid: string;
try {
  uid = (await adminAuth.getUserByEmail(lower)).uid;
  console.log('User exists — promoting to admin');
} catch {
  if (!password) { console.error('User does not exist: provide a password to create it.'); process.exit(1); }
  uid = (await adminAuth.createUser({ email: lower, password, displayName: name })).uid;
  console.log('User created');
}
await adminDb.doc(`users/${uid}`).set(
  { uid, email: lower, name, role: 'admin', active: true, createdAt: FieldValue.serverTimestamp() },
  { merge: true },
);
await syncAccess(uid, { name, email: lower, role: 'admin', active: true });
console.log(`✔ ${lower} is admin (uid ${uid})`);
process.exit(0);
