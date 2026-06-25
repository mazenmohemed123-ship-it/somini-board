# Firebase — Quick AI Prompt / دليل سريع للـ AI

> A short, copy-paste brief for the next AI working on **Somni Board**.
> برومت قصير للـ AI اللي هيشتغل بعدك على المشروع.

---

## The project / المشروع
Multi-tenant governance platform. Firebase project id: **`somini-board`**, region
**`europe-west1`**. Frontend = Next.js (`web/`), backend = Cloud Functions
(`functions/`), DB = Firestore.

---

## How to deploy / كيفية النشر

### 1. Authenticate (headless / sandbox) / المصادقة
No browser → use a **service account JSON**:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```
The service account (`firebase-adminsdk-...@somini-board.iam.gserviceaccount.com`)
needs these IAM roles on the project:
- **Editor** (or Firebase Admin)
- **Cloud Functions Admin** + **Cloud Functions Developer**
- **Service Account User** — *granted on* `somini-board@appspot.gserviceaccount.com`
- **Secret Manager Secret Accessor** (only for payment functions)
- **Firebase Authentication Admin**, **Storage Admin**

Also enable the **Cloud Billing API** for the project (2nd-gen functions require it).

### 2. Build first / ابنِ أولاً
```bash
( cd functions && npm run build )   # tsc — must pass
( cd web && npm run build )         # next build — must pass
```

### 3. Deploy / انشر
```bash
firebase deploy --only firestore --project somini-board   # rules + indexes
firebase deploy --only functions --project somini-board   # backend
firebase deploy --only hosting   --project somini-board   # Next.js SSR
```
Deploy a single function: `firebase deploy --only functions:NAME`.
✅ Success = the CLI prints **`✔ Deploy complete!`**. Don't claim success otherwise.

---

## Golden rules / قواعد ذهبية
1. **Every new function must be re-exported from `functions/src/index.ts`** or it
   won't deploy. أي دالة جديدة لازم تتصدّر من `index.ts`.
2. **Any Firestore query with >1 `where` (or `where`+`orderBy` on different
   fields) needs a composite index** in `firestore.indexes.json`, then redeploy
   `firestore`. Missing index → the client sees a generic `internal` error.
   الاستعلام على أكثر من حقل محتاج فهرس، وإلا بيظهر خطأ internal.
3. **Indexes take minutes to build** after deploy. الفهارس بتاخد دقائق.
4. **Roles live in custom claims**: `{ role, tenantId, companyId?, branchId?,
   employeeId? }`. Set them via the `setUserRole` / `createEmployeeLogin`
   functions. Roles: `superAdmin, companyAdmin, secretary, hr, branchManager,
   employee`.
5. **Tenant isolation**: every doc has `tenantId`; never query across tenants
   from the client. عزل الشركات عن طريق `tenantId`.

---

## Common errors / أخطاء شائعة
| Error | Fix |
|-------|-----|
| `Failed to authenticate, have you run firebase login?` | Set `GOOGLE_APPLICATION_CREDENTIALS` to the service-account JSON. |
| `iam.serviceAccounts.ActAs ... denied` | Grant **Service Account User** on `somini-board@appspot.gserviceaccount.com`. |
| `Cloud Billing API has not been used` | Enable the Cloud Billing API for the project. |
| `secretmanager.versions.get denied` | Grant **Secret Manager Secret Accessor**. |
| Client sees `internal` on a report/list call | Missing Firestore composite index — add it and redeploy `firestore`. |

---

## Verify after deploy / التحقق
```bash
firebase functions:log --project somini-board   # runtime errors
```
Then open **https://somini-board.web.app**, sign in, and exercise the changed flow.
