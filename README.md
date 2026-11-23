# Express Tracker

One website for the whole student journey, with tabs shown according to each person's role:

**Sales pipeline (confidence %) → Admission → EMGS Visa Tracker → Logistics (full Pioneer Logistics module) → Quality Control → Analytics**, plus a sales chatbot.

Built with React, TypeScript, Vite, Tailwind (used by the Logistics pages), Firebase (Auth, two Firestore databases, Storage, Messaging, Functions) and Express.

## Pipeline rules

| Stage | Confidence | Who / how |
|---|---|---|
| Lead | 0–79 % | Counselor sets it with a slider |
| Predicted | 80 % | Counselor sets 80 %, the highest value they can enter |
| Visa Paid | 100 % | Counselor records the payment receipt. The student is **added to the Visa Tracker automatically** (first EMGS check runs immediately) **and copied into the Logistics Arrivals Directory** |
| Registered | Done ✓ | Admission confirms |
| Lost | 0 % | A reason is required. The student can be reopened as a Lead |

These rules are enforced in the UI **and** in `firestore.rules`, so they can't be bypassed from the browser console.

## Roles and tabs

| Role | Core tabs | Logistics tabs |
|---|---|---|
| **1. Counselor (sales)** | Students & Pipeline (own students only), Follow-ups, Visa Tracker (own), Sales Assistant | My Students (logistics view), Logistics Tasks (request a task), Counselor Tasks, Student Feedback |
| **2. Admission** | Students & Pipeline, Document Review, Visa Tracker (review every application, refresh EMGS, confirm Registered), Sales Assistant | Arrivals Directory |
| **3a. Logistics — Coordinator** | Visa Tracker (read), Sales Assistant | Dashboard, Live Operations, Arrivals Directory, Live Map, Vehicles, Wallets, Overtime, Staff History, Student Feedback, Task Presets, Logistics Analytics |
| **3b. Logistics — Team (field officer)** | Sales Assistant | My Field Tasks (steps with GPS-watermarked photo proof), My Wallet, Vehicles (check-in/out), Overtime |
| **4. Quality Control** | Students, Visa Tracker, Quality Control (automatic checks + flags), Audit Log | Logistics QC, Student Feedback, Staff History, Arrivals Directory, Logistics Analytics |
| **5. Admin** | Everything, plus Analytics, Users & Roles, Chatbot Answers | Every logistics tab, plus Counselor Tasks |

Where these are set:
- Core tabs: `src/lib/roles.ts` (`NAV`)
- Logistics tabs: `src/logistics/bridge.ts` (`LOGI_TABS`)
- Data access: `firestore.rules` (default database) and `firestore.logistics.rules` (logistics database)
- Files: `storage.rules`

## Single sign-in

There is one login, through Firebase Auth. When an admin creates a user or changes their role in **Users & Roles**, the server:
1. Writes the user to `users/{uid}` in the main database.
2. Sets Firebase Auth **custom claims** `{ role, active }`. The logistics database rules and the Storage rules read these.
3. Creates or updates the matching Logistics profile (`logistics` database `users/{uid}`). This profile holds the wallet balance, GPS location and push tokens.

Roles map to the Logistics module's own roles like this: coordinator → `coordinator`, team → `field_officer`, counselor → `counselor`, admission and QC → `counselor_manager`.

## Project structure

```
express-tracker/
├─ public/                      logo.png, favicon, PWA icons, feedback-email logo
├─ src/
│  ├─ theme.css                 Pioneer colours (navy #293b8f, red #dd2826)
│  ├─ App.tsx                   routes + role guards (Logistics loaded on demand)
│  ├─ main.tsx                  also serves the public feedback form (?view=feedback&taskId=…)
│  ├─ context/AuthContext.tsx   Firebase Auth + role profile, refreshes claims
│  ├─ components/               Layout (sidebar tabs grouped by area), ui, RequireRole
│  ├─ lib/                      pipeline rules, actions (+ audit log), queries, roles, countries, universities
│  ├─ pages/                    counselor/, admission/, qc/, admin/, Tracker, Chatbot, Login
│  └─ logistics/                ← Pioneer Logistics module
│     ├─ bridge.ts              role mapping + tabs per role
│     ├─ LogisticsShell.tsx     mounts the module inside the site (notifications, AR/EN switch)
│     ├─ config/firebase.ts     logistics database + Storage + Messaging
│     ├─ context/AppContext.tsx live data store (uses the site's Firebase Auth identity)
│     ├─ pages/, components/, utils/, i18n/   tasks, wallet, vehicles, live map, overtime, feedback, QC…
├─ server/
│  ├─ index.ts                  users API (+ claims), EMGS refresh/check, push service worker, serves dist/
│  ├─ emgs.ts                   EMGS scraper (ported from Pioneer-emgs-tracker)
│  ├─ logisticsSync.ts          Visa Paid students → Logistics Arrivals Directory
│  └─ firebaseAdmin.ts
├─ functions/                   Cloud Functions: feedback / completion emails (SMTP), push notifications
├─ scripts/                     seed-admin.ts, seed-kb.ts
├─ firestore.rules              main database
├─ firestore.logistics.rules    logistics database
├─ storage.rules, firebase.json, .env.example
```

## Test everything first (TEST MODE — free, no Blaze needed)

TEST MODE runs the whole system on your PC with the **Firebase Emulator Suite**: Auth, both Firestore databases, Storage and Functions. It uses fake data and needs no billing, so you can check every tab and role before upgrading.

**Needs:** Node 20+, plus **Java 21** (for the Firestore emulator: https://adoptium.net).

`.env` already has `USE_EMULATORS=true` and `VITE_USE_EMULATORS=true`.

```bash
npm install
cd functions && npm install && cd ..

# terminal 1 — local Firebase (data is kept in ./emulator-data between runs)
npm run emulators

# terminal 2 — once: test accounts + sample students in every stage
npm run seed:demo
npm run server

# terminal 3 — the website
npm run dev          # → http://localhost:5173
```

Emulator dashboard: http://127.0.0.1:4000 (see the data, users and rule denials).

| Test account | Role |
|---|---|
| admin@test.local | Admin |
| counselor1@test.local / counselor2@test.local | Counselor |
| admission@test.local | Admission |
| coordinator@test.local | Logistics coordinator |
| field1@test.local / field2@test.local | Logistics team |
| qc@test.local | Quality Control |

Password for all: `Test1234!`

What works in TEST MODE: everything, including the real EMGS check (it runs from your PC). Two exceptions: push notifications need the live site, and feedback emails need `SMTP_PASS` in `functions/.env`.

**Going live:** upgrade to Blaze, create the `logistics` database and Storage, paste the service account into `.env`, and set both `USE_EMULATORS` and `VITE_USE_EMULATORS` to `false`. Then follow **Setup** below.

## Setup

1. **Create the Firebase project** under your own Google account.
   - Enable **Authentication → Email/Password**.
   - Enable **Firestore**, then **add a second database named `logistics`** (Firestore → Add database).
   - Enable **Storage** (photo proofs, receipts, vehicle photos).
   - Enable **Cloud Messaging** and create a Web Push key pair. It goes in `VITE_FIREBASE_VAPID_KEY`.
2. **Fill in `.env`.** Copy `.env.example`, add the web app config, paste the service account JSON (on one line) into `FIREBASE_SERVICE_ACCOUNT`, and set `VITE_PUBLIC_URL`.
3. **Install:**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```
4. **Deploy the rules and functions.** Functions need the Blaze plan. Before deploying, copy `functions/.env.example` to `functions/.env` and fill in the SMTP details.
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore,storage
   firebase deploy --only functions
   ```
5. **Create the first admin:**
   ```bash
   npm run seed:admin -- you@example.com "Moustafa" YourStrongPass123
   ```
6. **(Optional) Load starter chatbot answers:** `npm run seed:kb`
7. **Run locally.** Use two terminals:
   ```bash
   npm run server     # API on :3001
   npm run dev        # site on http://localhost:5173
   ```
8. Sign in. Go to **Users & Roles** and add the counselors, admission staff, logistics coordinator and field team, and QC. Then open **Logistics → Task Presets**. The standard SOPs (Reception, Medical, Registration, Viewing, Check-in, Attestation) are created the first time an admin or coordinator opens Logistics.

## Moving data from the old apps (optional)

The new site starts with empty databases. To bring old records across, export each collection with `gcloud firestore export` or a script, then import it into the new project:
- **Students** from Pioneer-emgs-tracker → main database `students`. Map `passportNo`, `nationality`/`nationalityCode`, `university`, `counselorId`, and set `stage` (for example `visa_paid` when there's an EMGS record).
- **Logistics data** (`students`, `tasks`, `presets`, `vehicles`, `vehicleLogs`, `expenses`, `topups`, `overtimeLogs`, `feedback`, `qc*`) → the `logistics` database, under the same collection names.

Staff accounts must be created again in **Users & Roles**, because the old apps used separate logins.

## EMGS tracker

- `server/emgs.ts` contains the scraper from Pioneer-emgs-tracker unchanged: form_key and session handling, Cloudflare/WAF detection with backoff, progress % and colour, application issues, and details.
- **Refresh EMGS status** (Admin and Admission) checks every application under 100 %. The server also runs this automatically every `TRACKER_INTERVAL_MIN` minutes, 2.5 s apart. Each row has **Check now**.
- Status changes go into each application's `history`. EMGS issues appear on the Tracker and on the student page.

## Deploy (Railway)

- Build command: `npm run build`. Set all `VITE_*` variables in Railway **before** building.
- Start command: `npm start`
- Variables: everything in `.env.example`
- One service runs the API, the website, the EMGS scheduler and the Logistics sync. Cloud Functions are deployed separately with `firebase deploy --only functions`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Frontend dev server |
| `npm run server` | API server with reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Production server |
| `npm run typecheck` | Type-check the frontend and the server |
| `npm run seed:admin` | Create or promote an admin |
| `npm run seed:kb` | Starter chatbot answers |
| `npm run emulators` | TEST MODE: start the local Firebase emulators |
| `npm run seed:demo` | TEST MODE: test accounts + sample data |
#   F U L L S Y S T E M  
 