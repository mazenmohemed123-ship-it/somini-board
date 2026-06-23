# Somni Board

**منصة حوكمة مؤسسية (Corporate Governance Platform)** للشركات والجمعيات العمومية،
مبنية على Firebase مع عزل كامل للشركات عبر Identity Platform Tenants. تجمع بين:
إدارة الموظفين (HR)، الهيكل التنظيمي (الأفرع والأقسام واللجان)، انتخابات مجالس
الإدارة، التصويت على القرارات (Motions)، الاجتماعات والبث المباشر، والمحاضر.

> **حالة المشروع:** أساس متين قابل للتشغيل. الأجزاء الأمنية الأساسية (Security Rules،
> Cloud Functions، عزل الـ Tenants) مكتملة بكود حقيقي. بعض الخطوات تتطلب تفعيلًا يدويًا
> من Console أو مفاتيح حقيقية (Paymob، App Check) — انظر "ما يتطلب إعدادًا يدويًا".

---

## البنية

```
somini-board/
├── firebase.json            # Hosting (Next.js) + Functions + Firestore + RTDB + Storage + Emulators
├── .firebaserc              # المشروع الافتراضي: somini-board
├── firestore.rules          # قواعد أمان كاملة: عزل tenant + أدوار + الفروع/اللجان
├── firestore.indexes.json   # فهارس كل المجموعات + TTL على voterTokens
├── database.rules.json      # Realtime Database (الشات + نتائج الانتخابات والقرارات الحية)
├── storage.rules            # التخزين (صور، تقارير PDF، محاضر، استيراد CSV)
├── functions/               # Cloud Functions 2nd gen (TypeScript, Node 20)
│   └── src/
│       ├── hr/              # employees: create/update/delete + bulkImport (CSV)
│       ├── org/             # branches, departments, committees + تعيين مدير فرع
│       ├── elections/       # createElection, schedule, pullVotersFromEmployees
│       ├── voters/          # registerVoter (تفرّد الرقم القومي + توكن TTL)
│       ├── voting/          # castVote, changeVote (نافذة تغيير الصوت)
│       ├── motions/         # createMotion, publishMotion, castMotionVote + cron
│       ├── meetings/        # createMeeting (Jitsi + تذكيرات), recordMinutes (PDF)
│       ├── results/         # generateReport (Puppeteer PDF عبر Cloud Tasks)
│       ├── payments/        # Paymob (intent + webhook موقّع) + تسعير إقليمي
│       ├── integrations/    # REST API + Webhooks صادرة
│       ├── admin/           # provisionCompany, setUserRole, createIntegration
│       └── lib/             # admin SDK, Secret Manager, context (أدوار + tenant)
└── web/                     # Next.js 15 (App Router, SSR) + i18n + PWA
    └── src/
        ├── app/dashboard/   # overview, employees, branches, committees,
        │                    #   elections, motions, meetings, payment, staff, integrations
        ├── app/vote/[id]/   # صفحة الناخب · app/results/[id] نتائج حية
        ├── components/      # DashboardNav, JitsiMeeting, RegisterSW
        ├── i18n/            # ar (افتراضي RTL), en, fr, de, it, tr (fallback → en)
        └── lib/             # firebase.ts (App Check) · api.ts (callables)
```

## الأدوار
`superAdmin` · `companyAdmin` · `branchManager` · `secretary` · `employee`
(+ `voter` للناخبين الخارجيين) — تُخزَّن كـ custom claims (مع `branchId` لمديري
الفروع) وتُفرض في Security Rules و Cloud Functions.

## الربط الأساسي (قلب النظام)
- **الموظفون ↔ الانتخابات:** `pullVotersFromEmployees` تملأ قائمة الناخبين من
  الموظفين حسب النطاق (كل الشركة / فرع / قسم / لجنة) — voterId = employeeId.
- **الموظفون ↔ القرارات:** أهلية التصويت على كل قرار تُفحص من سجل الموظف
  (الفرع/القسم) أو عضوية اللجنة.
- **الفروع ↔ الصلاحيات:** مدير الفرع (`branchManager` مع `branchId`) يرى ويدير
  فقط نطاق فرعه في القواعد والدوال.

## تدفّق التصويت (مضمون الأمان)
1. الناخب يفتح `/vote/{electionId}` ويسجّل (الاسم، الرقم القومي…).
2. `registerVoter` يتحقق من تفرّد الرقم القومي (مُجزّأ SHA-256 + salt) داخل transaction،
   ينشئ مستخدمًا داخل tenant الشركة، ويعيد custom token + يخزّن `voterTokens` بـ TTL 30 دقيقة.
3. الناخب يصوّت → `castVote` يتحقق (الانتخاب نشط، لم يصوّت سابقًا) ويكتب الصوت.
4. خلال `changeVoteWindow` يمكن `changeVote`؛ بعدها تُقفل القواعد التعديل نهائيًا.
5. عند انتهاء الوقت يحوّل Scheduler الحالة إلى `ended`، يولّد تقرير PDF، ويُطلق Webhooks.

الأصوات لا تُكتب أبدًا من العميل — `match /votes` في القواعد = `write: if false`.

---

## التشغيل محليًا

```bash
# Functions
cd functions && npm install && npm run build

# Web
cd ../web && npm install
cp .env.example .env.local   # املأ القيم من Firebase console
npm run dev

# المحاكيات (من الجذر)
firebase emulators:start
```

## النشر

```bash
# 1) فعّل الخدمات (مرة واحدة)
bash scripts/enable-services.sh somini-board

# 2) أنشئ أسرار Paymob (مرة واحدة)
bash scripts/create-secrets.sh somini-board

# 3) انشر
firebase deploy --only firestore:rules,database,storage,functions
firebase deploy --only hosting          # Next.js عبر Firebase Hosting frameworks
```

---

## ما يتطلب إعدادًا يدويًا (لا يمكن أتمتته بالكامل من CLI)
- **الترقية إلى Blaze** (مطلوبة لـ Functions 2nd gen و Cloud Tasks و Secret Manager).
- **Identity Platform + Multi-tenancy**: فعّلها من Authentication → Settings، وفعّل MFA
  الإجباري لـ companyAdmin وسياسة الحظر بعد 5 محاولات.
- **App Check**: سجّل تطبيق الويب بـ reCAPTCHA v3 وضع المفتاح في `.env.local`.
- **مفاتيح Paymob**: ضعها في Secret Manager عبر `scripts/create-secrets.sh`.
- **Firestore / RTDB / Storage**: أنشئها من Console (أو CLI) قبل أول نشر.
- **somni chat**: مكتبة الشات الخاصة بك — مدمجة عبر RTDB في `database.rules.json`؛
  استبدل الواجهة بمكوّن المكتبة عند توفّره.

## ملاحظات أمنية مطبّقة
- عزل tenant على كل قراءة/كتابة عبر `callerTenant()`.
- الرقم القومي يُخزَّن مُجزّأً (لا يُحفظ خامًا).
- مفاتيح الـ API للتكاملات تُخزَّن مُجزّأة؛ المفتاح الخام يظهر مرة واحدة فقط.
- Webhooks موقّعة بـ HMAC-SHA256، و webhook الدفع يُتحقق منه بـ HMAC-SHA512.
- Cloud Tasks تضمن إعادة المحاولة للـ Webhooks وتوليد التقارير.
