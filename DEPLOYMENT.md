# نشر Somni Board

خطوات نشر المنصة على Firebase (مع Blaze subscription نشط).

## 1️⃣ المتطلبات الأولية
```bash
# تثبيت الأدوات
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# تعيين المشروع الحالي
firebase use somini-board
```

## 2️⃣ تفعيل الخدمات (المرة الأولى فقط)
```bash
bash scripts/enable-services.sh somini-board
```

يفعّل:
- Cloud Functions 2nd gen
- Cloud Scheduler
- Cloud Tasks
- Secret Manager
- Firestore, Realtime Database, Cloud Storage
- Identity Platform
- App Check

## 3️⃣ إعداد Identity Platform و Tenants
**من Firebase Console** (لا يمكن أتمتته من CLI):

### Firebase Authentication
1. → Authentication → Settings
2. "Multi-tenancy" → Enable → Create project-level tenant
3. قيّد access إلى Blaze فقط (للـ Tenants)

### MFA و حماية الحساب
1. → Sign-in method → Email/Password
   - ✓ Enable email enumeration protection
2. → Secure token → Block account after 5 failed login attempts

### App Check
1. → Project settings → App Check
2. "Register app" → Select Web app
3. Register reCAPTCHA v3 token:
   - https://console.cloud.google.com/security/recaptcha
   - Create new site, copy site key
4. ضع site key في `web/.env.local`:
   ```
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-site-key
   ```

### Firestore
1. → Firestore Database → Create database
   - Mode: **Native**
   - Region: `europe-west1`
   - Security rules: سيتم نشرها من CLI

### Realtime Database
1. → Realtime Database → Create database
   - Region: `europe-west1`
   - Rules: سيتم نشرها من CLI

### Cloud Storage
1. → Storage → Get started
   - Location: `europe-west1`

## 4️⃣ إضافة أسرار Paymob
```bash
bash scripts/create-secrets.sh somini-board
```

سيُطلب منك:
- PAYMOB_API_KEY (من dashboard Paymob)
- PAYMOB_INTEGRATION_ID (رقمي من Paymob)
- PAYMOB_IFRAME_ID (معرّف iframe من Paymob)
- PAYMOB_HMAC (secret key للتوقيع)

## 5️⃣ إعداد Firebase Config المحلي
```bash
cd web
cp .env.example .env.local
```

ملأ القيم من Firebase Console (Project settings → Your apps → Web app):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=somini-board.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=somini-board
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=somini-board.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://somini-board-default-rtdb.firebaseio.com
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
```

## 6️⃣ النشر

```bash
# من الجذر
firebase deploy --only firestore:rules,database,storage,functions
firebase deploy --only hosting
```

### ما يُنشر:
- **firestore:rules** — Security Rules (Firestore)
- **database** — Realtime Database rules
- **storage** — Cloud Storage rules
- **functions** — جميع Cloud Functions (عبر `firebase.json`)
- **hosting** — Next.js app على Firebase Hosting

## 7️⃣ التحقق من النشر

```bash
firebase functions:list
firebase database:instances
firebase firestore:indexes
```

قم بزيارة:
- https://somini-board.web.app — التطبيق الرئيسي
- https://console.firebase.google.com/project/somini-board — Firebase Console

## أول مستخدم SuperAdmin

بعد النشر، قم بإنشاء حساب superAdmin يدويًا عبر Firebase Console:

1. Authentication → Users
2. "Add user" مع بريد وكلمة مرور
3. في Firestore، أضفْ custom claim يدويًا (أو عبر Admin SDK):
   ```javascript
   // Cloud Shell أو SDK
   const admin = require('firebase-admin');
   await admin.auth().setCustomUserClaims('user-uid', { role: 'superAdmin' });
   ```

أو عبر صفحة الإعدادات بعد تثبيت التوابع اللازمة.

## استكشاف الأخطاء

### Functions لا تُنتشر
```bash
firebase deploy --only functions --debug
```

### Firestore rules خطأ
```bash
firebase emulators:start
# اختبر Rules محليًا قبل النشر
```

### Storage مرفوض
تأكد أن `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` صحيح في `.env.local`.

## الصيانة المستمرة

### مراقبة Logs
```bash
firebase functions:log
```

### تحديث Secret (Paymob key rotation)
```bash
gcloud secrets versions add PAYMOB_API_KEY --data-file=-
```

### Scale المشروع
- Cloud Functions المزيد من الـ maxInstances في `firebase.json`
- Firestore تصعيد الـ write throughput إذا لزم
- Realtime Database نقل القراءة الثقيلة إلى Firestore
