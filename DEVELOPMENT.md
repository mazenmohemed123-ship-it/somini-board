# التطوير المحلي

تشغيل Somni Board محليًا مع Firebase Emulators لكل الخدمات.

## التثبيت الأولي

```bash
# جذر المشروع
npm install -g firebase-tools

# Functions
cd functions
npm install
npm run build

# Web
cd ../web
npm install
cp .env.example .env.local
# ضع NEXT_PUBLIC_USE_EMULATORS=1 في .env.local
```

## بدء المحاكيات

```bash
# من جذر المشروع
firebase emulators:start --import=./emulator-data
```

تشغّل:
- **Auth (9099)** — Firebase Authentication
- **Firestore (8080)** — Firestore
- **Database (9000)** — Realtime Database
- **Functions (5001)** — Cloud Functions
- **Storage (9199)** — Cloud Storage
- **Hosting (5000)** — Static hosting
- **UI (4000)** — Emulator dashboard

## بدء التطبيق (في terminal منفصل)

```bash
cd web
npm run dev
```

متاح على:
- http://localhost:3000 — Next.js dev server
- http://localhost:4000 — Emulator UI (لرؤية البيانات)

## سير عمل التطوير

### تصحيح errors من Functions
```bash
firebase functions:shell
> createElection({title: "Test", ...})
```

### اختبار Security Rules
```bash
# في Emulator UI أو عبر Firestore emulator rules testing
```

### تنظيف البيانات
```bash
# حذف جميع البيانات المحلية
rm -rf ./emulator-data
```

### مراقبة Logs
```bash
firebase functions:log
# في نافذة أخرى أثناء التطوير
```

## الاختبار

### وحدات Unit (مثال على Cloud Functions)
```typescript
// functions/src/__tests__/voting.test.ts
import { castVote } from '../voting/cast';
// قريباً: اختبارات شاملة
```

### اختبار تدفق النصوص (E2E)
```bash
# مثال: تسجيل ناخب → تصويت → تغيير صوت
```

## ملاحظات على المحاكيات

### لا تحتاج VPN للـ Paymob
في بيئة الـ emulator، لا تُطلق دوال Paymob. يمكنك mock calls أو تخطيها.

### Auth Emulator مع Identity Platform
قد لا تدعم المحاكيات Identity Platform Tenants بالكامل. استخدمها للاختبار الأساسي فقط.

### حفظ واستعادة البيانات
```bash
firebase emulators:start --export-on-exit ./emulator-data
```

ستُحفظ جميع البيانات بعد الإغلاق وتُستعاد في المرات القادمة.

## حل المشاكل الشائعة

### "Permission denied" عند Firestore
- تأكد أن Rules تسمح بالوصول محليًا
- في الاختبار، استخدم `testing` auth context

### Functions timeout
زيادة timeout في `firebase.json`:
```json
{
  "functions": {
    "timeoutSeconds": 300
  }
}
```

### Storage bucket لم يُنشأ
```bash
firebase emulators:start --only storage
```

## الأدوات المفيدة

```bash
# عرض جميع emulators
firebase emulators:status

# إعادة بدء نظيفة
firebase emulators:start --clear-on-exit

# Debug specific service
firebase emulators:start --only firestore --debug-port 5555
```

## الخطوة التالية: الاختبار الشامل

عندما تكون مستعداً:
1. اكتب unit tests للـ Cloud Functions (`functions/__tests__/`)
2. اكتب E2E tests عبر Playwright أو Cypress
3. اختبر جميع تدفقات المستخدم (تسجيل → تصويت → نتائج)
4. تحقق من Security Rules عبر mock calls
