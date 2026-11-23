/**
 * Starter answers for the Sales Assistant. Edit freely afterwards in the app (Admin → Chatbot Answers).
 *   npm run seed:kb
 * The text below is placeholder wording — replace prices and steps with your real ones.
 */
import { adminDb } from '../server/firebaseAdmin';

import { entries } from './kbEntries';

const col = adminDb.collection('kb');
for (const e of entries) await col.add(e);
console.log(`✔ Added ${entries.length} starter answers`);
process.exit(0);
