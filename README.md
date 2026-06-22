# Somni Board

منصة متكاملة لإدارة انتخابات وتصويتات مجالس الإدارة والجمعيات العمومية، مبنية على
Firebase مع عزل كامل للشركات عبر Identity Platform Tenants.

> **حالة المشروع:** أساس متين قابل للتشغيل. الأجزاء الأمنية الأساسية (Security Rules،
> Cloud Functions، عزل الـ Tenants) مكتملة بكود حقيقي. بعض الخطوات تتطلب تفعيلًا يدويًا
> من Console أو مفاتيح حقيقية (Paymob، App Check) — انظر "ما يتطلب إعدادًا يدويًا".

---

## البنية

```
somini-board/
├── firebase.json            # Hosting (Next.js) + Functions + Firestore + RTDB + Storage + Emulators
├── .firebaserc              # المشروع الافتراضي: somini-board
├── firestore.rules          # قواعد أمان كاملة مع دوال مخصصة وعزل tenant
├── firestore.indexes.json   # الفهارس + TTL على voterTokens
├── database.rules.json      # قواعد Realtime Database (الشات + النتائج الحية)
├── storage.rules            # قواعد التخزين (صور المرشحين/الناخبين + تقارير PDF)
├── functions/               # Cloud Functions 2nd gen (TypeScript, Node 20)
│   └── src/
│       ├── elections/       # createElection, openCloseElections (Scheduler)
│       ├── voters/          # registerVoter (تفرّد الرقم القومي + توكن TTL)
│       ├── voting/          # castVote, changeVote (نافذة تغيير الصوت)
│       ├── results/         # generateReport (Puppeteer PDF عبر Cloud Tasks)
│       ├── payments/        # Paymob (intent + webhook موقّع) + تسعير إقليمي
│       ├── integrations/    # REST API للتطبيقات المتصلة + Webhooks صادرة
│       ├── admin/           # provisionCompany, setUserRole, createIntegration
│       └── lib/             # admin SDK, Secret Manager
└── web/                     # Next.js 15 (App Router, SSR) + i18n + PWA
    └── src/
        ├── app/             # الصفحات: dashboard, vote/[id], results/[id], integrations
        ├── components/      # JitsiMeeting, RegisterSW
        ├── i18n/            # ar (افتراضي RTL), en, fr, de, it, tr
        └── lib/firebase.ts  # تهيئة العميل + App Check + Emulators
```

## الأدوار
`superAdmin` · `companyAdmin` · `secretary` · `voter` — تُخزَّن كـ custom claims
وتُفرض في Security Rules و Cloud Functions.

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
