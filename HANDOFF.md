# Somni Board — Developer Handoff / دليل تسليم المشروع

> A bilingual handoff for the next developer. Read this top‑to‑bottom before
> touching the code. كل قسم فيه شرح بالعربي تحته.

---

## 1. What this project is / ما هو المشروع

**Somni Board** is a multi‑tenant **corporate governance platform**. One
deployment serves many companies ("tenants"); every document carries a
`tenantId` and isolation is enforced in Firestore rules. Main areas:

- **HR / Employees** — employee records, branches, departments, committees.
- **Elections** — create elections, candidates, voters (roster or open),
  cast/change votes, live results, PDF reports.
- **Motions** — board decision voting (approve/reject/abstain).
- **Meetings & Minutes** — Jitsi meetings, recorded minutes, e‑signatures.
- **Attendance** — GPS check‑in/out, work schedule, monthly reports,
  employee map, Excel export, daily late/absent alerts. *(newest area)*
- **Integrations** — API keys + outbound webhooks for connected apps.
- **Payments** — Paymob payment intents + webhook.
- **Admin console** — platform‑owner (superAdmin) dashboard over all tenants.

> **بالعربي:** المشروع منصة حوكمة لإدارة عدة شركات في نفس النظام. كل شركة
> (tenant) معزولة عن غيرها. الأقسام: الموظفون، الانتخابات، القرارات،
> الاجتماعات، الحضور والانصراف، التطبيقات المتصلة، المدفوعات، ولوحة مالك المنصة.

---

## 2. Tech stack / التقنيات

| Layer | Tech |
|-------|------|
| Frontend | **Next.js 15** (App Router), React, TypeScript — in `web/` |
| Backend | **Firebase Cloud Functions (2nd gen)**, TypeScript — in `functions/` |
| Database | **Cloud Firestore** (primary) + **Realtime Database** (live chat/results) |
| Auth | **Firebase Auth** + custom claims (`role`, `tenantId`, `employeeId`, `branchId`) |
| Storage | **Cloud Storage** (candidate photos, PDFs) |
| Hosting | **Firebase Hosting** with Next.js SSR (`frameworksBackend`) |
| Region | **europe-west1** for everything |
| i18n | Arabic (default, RTL) + English — `web/src/i18n/{ar,en}.json` |

Firebase project id: **`somini-board`**. Node 20 for functions.

---

## 3. Repo layout / هيكل المشروع

```
somini-board/
├── firebase.json            # Firebase config (hosting, functions, rules…)
├── firestore.rules          # Firestore security rules (tenant isolation)
├── firestore.indexes.json   # Composite indexes — REQUIRED for multi-field queries
├── database.rules.json      # Realtime DB rules (chat / live results)
├── storage.rules            # Cloud Storage rules
├── .firebaserc              # default project = somini-board
├── functions/               # Cloud Functions (backend)
│   └── src/
│       ├── index.ts         # ⭐ every function is re-exported here to deploy
│       ├── lib/             # admin SDK singletons, caller context, secrets
│       ├── attendance/      # ⭐ attendance (this handoff's focus)
│       ├── hr/ org/ elections/ voting/ voters/ motions/
│       ├── meetings/ results/ integrations/ payments/ admin/
└── web/                     # Next.js frontend
    └── src/
        ├── app/             # routes (App Router)
        │   ├── dashboard/   # company dashboard (per-tenant)
        │   ├── admin/       # platform-owner console (superAdmin)
        │   ├── auth/ signup/ vote/ results/
        ├── components/      # SideNav, DashboardNav, etc.
        ├── lib/             # firebase.ts, api.ts, auth-context.tsx
        └── i18n/            # ar.json / en.json + provider
```

> **بالعربي:** أهم ملف في الباك‑إند هو `functions/src/index.ts` — أي دالة جديدة
> لازم تتصدّر منه عشان تتنشر. وأهم ملفات الأمان: `firestore.rules` و
> `firestore.indexes.json`.

---

## 4. Roles & custom claims / الأدوار والصلاحيات

Auth users carry **custom claims** set by Cloud Functions:

```ts
{ role, tenantId, companyId?, branchId?, employeeId? }
```

Roles:

| Role | Meaning |
|------|---------|
| `superAdmin` | Platform owner. Uses **`/admin`**, NOT the company dashboard. |
| `companyAdmin` | Company owner/admin. Full access within their tenant. |
| `secretary` | Company staff (same powers as admin for most ops). |
| `hr` | HR — manages employees, creates logins, views reports. |
| `branchManager` | Manages one branch (`branchId` claim must match). |
| `employee` | Normal employee. `employeeId` claim == their auth uid. |

⚠️ **Important nuance:** in `functions/src/lib/context.ts`, `isStaff()` returns
true **only** for `companyAdmin` and `secretary`. `hr` and `branchManager` are
NOT "staff" there. So a function guarded by `isStaff()` rejects hr/branchManager
even though the frontend may show them the button. Keep frontend role checks and
backend guards in sync (see Known Issues #3).

> **بالعربي:** الصلاحيات محفوظة في الـ token (custom claims). انتبه: `isStaff()`
> في الباك‑إند بيسمح فقط لـ companyAdmin و secretary — مش hr ولا branchManager.
> لو الواجهة بتورّي زر لدور والباك‑إند رافضه، دي مصدر أخطاء صلاحيات.

### Why the attendance page can look blank / لماذا تظهر شاشة بيضاء

`/dashboard/attendance` renders sections per role: a personal check‑in card for
anyone with an `employeeId` claim, and management tables for managers. A
**`superAdmin`** (the platform owner) has neither — so the page would be empty.
A fallback message now explains this; superAdmins should use **`/admin`**.

---

## 5. Attendance module / وحدة الحضور والانصراف

All backend logic: `functions/src/attendance/attendance.ts`. Frontend:
`web/src/app/dashboard/attendance/page.tsx`.

Cloud Functions (all callable unless noted):

| Function | Who | What |
|----------|-----|------|
| `setAttendanceConfig` | companyAdmin | Work hours, late grace, work days, geofence radius, timezone (on tenant doc). |
| `setBranchLocation` | staff | Set a branch's GPS centre + radius. |
| `createEmployeeLogin` | companyAdmin/hr | Create an auth login for an employee. |
| `checkIn` | employee | Geofence check → record present/late + late minutes. |
| `checkOut` | employee | Record check‑out + worked minutes. |
| `getMonthlyReport` | staff | Per‑employee monthly stats (present/late/absent/hours). |
| `getEmployeeLocations` | staff | Today's checked‑in employees with GPS for the map. |
| `exportAttendanceExcel` | staff | Month's records as CSV (Excel‑compatible). |
| `sendAttendanceAlerts` | **scheduled** 07:30 UTC daily (≈09:30 Cairo) | Detect late/absent, write to `attendanceAlerts`. |

Data model — collection `attendance`, doc id `"{employeeId}_{YYYY-MM-DD}"`:

```ts
{ attendanceId, tenantId, employeeId, branchId, date /* YYYY-MM-DD */,
  checkInAt, checkInLocation{lat,lng}, checkInDistance,
  checkOutAt, checkOutLocation?, workedMinutes,
  status: "present"|"late"|"absent", lateMinutes, offDay }
```

Collection `attendanceAlerts` (written only by `sendAttendanceAlerts`):
`{ tenantId, date, alertCount, alerts[], createdAt }`.

> **بالعربي:** كل دوال الحضور في ملف واحد. مهم: الدوال اللي بتعمل استعلام على أكثر
> من حقل (مثل `getMonthlyReport`) محتاجة **فهرس composite** في
> `firestore.indexes.json`، وإلا بترجع خطأ "internal".

---

## 6. ⚠️ The "internal" error — root cause & fix / خطأ internal

**Symptom:** clicking *Monthly report* / *Live locations* / *Export* showed
`حدث خطأ: internal`.

**Cause:** those functions run **multi‑field Firestore queries**
(`tenantId == … AND date >= … AND date < …`). Firestore requires a **composite
index** for such queries. The `attendance` collection had **no indexes**, so the
query threw `FAILED_PRECONDITION: The query requires an index`, which a callable
function reports to the client as the generic `internal`.

**Fix applied:**
1. Added the missing indexes to `firestore.indexes.json` (collection
   `attendance`: `(tenantId,date)`, `(tenantId,date,employeeId)`,
   `(tenantId,date,branchId)`) and deployed them.
2. Wrapped the queries in a `runQuery()` helper that catches the index error
   and returns a clear `failed-precondition` message ("index is still being
   built, try again in a few minutes") instead of `internal`.
3. Also added the long‑missing indexes for the scheduled `openCloseElections`
   and `closeExpiredMotions` jobs (`elections (status,startDate)`,
   `(status,endDate)`; `motions (status,endDate)`), which were failing in prod.

> **Rule of thumb:** any time you write a Firestore query with more than one
> `where`, or a `where` + `orderBy` on different fields, **add a matching entry
> to `firestore.indexes.json` and redeploy indexes.** Newly deployed indexes
> take a few minutes to build.

> **بالعربي:** خطأ "internal" كان سببه فهارس مفقودة. أي استعلام على أكثر من حقل
> محتاج فهرس في `firestore.indexes.json`. تم إضافة الفهارس ونشرها، وتم تحسين
> رسالة الخطأ لتكون واضحة بدل "internal".

---

## 7. How deployment works / كيف يتم النشر

### 7.1 The big picture

Everything deploys to the **`somini-board`** Firebase project via the Firebase
CLI. There are five independently‑deployable targets:

| Target | Command | Notes |
|--------|---------|-------|
| Firestore rules + indexes | `firebase deploy --only firestore` | Fast. Indexes build async. |
| Cloud Functions | `firebase deploy --only functions` | Slow (minutes). Runs `npm run build` first via predeploy. |
| Hosting (web) | `firebase deploy --only hosting` | Builds Next.js, deploys SSR function + static. |
| Storage rules | `firebase deploy --only storage` | Fast. |
| Realtime DB rules | `firebase deploy --only database` | Fast. (⚠ see Known Issues #1) |

Deploy one function only: `firebase deploy --only functions:getMonthlyReport`.

### 7.2 Authentication — the part that bites you / المصادقة

The CLI needs to authenticate to Google. Two ways:

1. **Interactive (your laptop):** `firebase login` once, then deploy.
2. **Headless / CI / sandbox (no browser):** use a **service account**.
   - Get a service‑account JSON (Firebase console → Project settings → Service
     accounts → *Generate new private key*), or use one already provisioned.
   - Point the CLI at it:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
     firebase deploy --project somini-board
     ```
   - The service account needs the *Firebase Admin* / *Editor* role (plus
     *Cloud Functions Admin*, *Service Account User*) on `somini-board`.

> 🔴 **This was the trap in earlier sessions:** the environment had no
> `firebase login`, so every `firebase deploy` failed with
> `Error: Failed to authenticate, have you run firebase login?` (see the old
> `deploy.log`). Code was built and committed, but **never actually deployed**.
> The fix was to use the provisioned service account via
> `GOOGLE_APPLICATION_CREDENTIALS`. Always confirm a deploy printed
> **`✔ Deploy complete!`** before claiming success.

> **بالعربي:** أكبر فخّ هو المصادقة. في البيئات بدون متصفح لازم تستخدم
> **service account** وتضبط `GOOGLE_APPLICATION_CREDENTIALS` يشير لملف الـ JSON.
> لا تقل إن النشر نجح إلا لما ترى رسالة `✔ Deploy complete!`.

### 7.3 Recommended deploy order / ترتيب النشر المقترح

```bash
# 0) build locally to catch errors first
( cd functions && npm run build )
( cd web && npm run build )

# 1) indexes/rules first (so functions that query won't hit missing indexes)
firebase deploy --only firestore --project somini-board

# 2) backend
firebase deploy --only functions --project somini-board

# 3) frontend
firebase deploy --only hosting --project somini-board

# 4) (optional) storage / database rules
firebase deploy --only storage --project somini-board
```

Live URLs after deploy:
- App: **https://somini-board.web.app**
- Console: https://console.firebase.google.com/project/somini-board

### 7.4 Verifying a deploy / التحقق

- `firebase functions:log --project somini-board` — read runtime errors.
- Open the app, sign in, exercise the changed flow.
- For Firestore index errors, the log prints a direct "create index" link.

---

## 8. Local development / التطوير المحلي

```bash
# Frontend
cd web && npm install && npm run dev          # http://localhost:3000

# Backend (emulators)
cd functions && npm install && npm run serve  # functions emulator

# Full emulator suite
firebase emulators:start
```

To make the web app talk to local emulators, set
`NEXT_PUBLIC_USE_EMULATORS=1` in `web/.env.local`.

Required env: copy `web/.env.example` → `web/.env.local` and fill the
`NEXT_PUBLIC_FIREBASE_*` values from the Firebase console (Web app config).

> **بالعربي:** للتطوير المحلي شغّل `npm run dev` للواجهة و`npm run serve` أو
> `firebase emulators:start` للباك‑إند. واملأ `web/.env.local` من
> `web/.env.example`.

---

## 9. Known issues / مشاكل معروفة (TODO)

1. **`firebase deploy --only database` fails** with
   `Unable to parse JSON: … "request re"…`. The local `database.rules.json` is
   valid JSON, so the broken content is the **rules already live on the server**
   (looks like Firestore‑style syntax was uploaded there once). Fix by
   re‑deploying RTDB rules from the valid local file once the server copy is
   cleared, or inspect the RTDB rules in the console. Not blocking — the rest of
   the deploy works when you exclude `database`.
2. **superAdmin on `/dashboard/attendance`** sees the new fallback card, not
   real data — by design. Platform owners belong in `/admin`. Consider
   redirecting superAdmin away from `/dashboard/*` entirely.
3. **Role mismatch (frontend vs backend):** the attendance page treats
   `hr` and `branchManager` as managers and shows them the report/map/export
   buttons, but the backend `isStaff()` guard rejects them. Either broaden the
   backend guard (add an `isManager()` helper) or hide those buttons for
   hr/branchManager. Decide the intended access and align both sides.
4. **App Check is off.** `web/src/lib/firebase.ts` only initialises App Check if
   `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is set, and functions only enforce it if
   `ENFORCE_APP_CHECK=true`. Turn both on together once a reCAPTCHA v3 key is
   configured — enabling one without the other breaks all calls.
5. **`firebase-functions` is a major version behind** (deploy prints an upgrade
   warning). Upgrade deliberately; v7 has breaking changes.

> **بالعربي:** أهم نقطة مفتوحة: توحيد صلاحيات hr/branchManager بين الواجهة
> والباك‑إند (نقطة 3)، ومشكلة قواعد Realtime DB القديمة على السيرفر (نقطة 1).

---

## 10. Git workflow / سير العمل على Git

- Default working branch in earlier sessions: `claude/eager-goodall-atkulz`.
- **All code now lives on `main`** (see push below). Develop against `main`,
  or open feature branches and merge into `main`.
- Build both `functions` and `web` before every deploy; deploy only after a
  clean build and a confirmed `✔ Deploy complete!`.

> **بالعربي:** كل الكود الآن على فرع `main`. اعمل تطويرك عليه (أو فرّع منه وادمج
> فيه). ابنِ المشروع وتأكد من `✔ Deploy complete!` قبل ما تقول إنه اتنشر.
