# Somni Board API Reference

## Cloud Functions (Callables)

جميع callables تتطلب App Check token و Firebase Authentication (إلا voter endpoints).

### Elections

#### `createElection(data)`
إنشاء انتخاب جديد (مسودة). يتطلب `companyAdmin` أو `secretary`.

**Input:**
```typescript
{
  title: string;           // عنوان الانتخاب
  description?: string;    // وصف اختياري
  startDate: number;       // epoch ms
  endDate: number;         // epoch ms
  votingDuration?: number; // مدة التصويت بالدقائق (غير مستخدمة حاليًا)
  changeVoteWindow?: number; // عدد الدقائق التي يمكن تغيير الصوت فيها
  registrationMode: "open" | "roster"; // مفتوح أم قائمة مسجلة
}
```

**Output:**
```typescript
{ electionId: string }
```

### Voters

#### `registerVoter(data)`
تسجيل ناخب جديد. لا يتطلب authentication (الناخبون ينتجون custom token).

**Input:**
```typescript
{
  electionId: string;
  fullName: string;
  nationalId: string;    // يُجزّأ SHA-256 + salt
  address?: string;
  email?: string;
  photo?: string;        // Storage URL (مرفوع مسبقًا)
}
```

**Output:**
```typescript
{
  voterId: string;       // uid الناخب الجديد
  customToken: string;   // token للمصادقة (صلاحيته 30 دقيقة)
  tenantId: string;
  expiresInMs: number;
}
```

**Errors:**
- `already-exists`: الرقم القومي مستخدم بالفعل في هذا الانتخاب
- `failed-precondition`: الانتخاب لا يقبل التسجيل المفتوح

### Voting

#### `castVote(data)`
تسجيل صوت جديد. يتطلب `voter` مسجل الدخول.

**Input:**
```typescript
{
  electionId: string;
  candidateId: string;
}
```

**Output:**
```typescript
{ ok: true }
```

**Errors:**
- `already-exists`: الناخب صوّت بالفعل (استخدم `changeVote`)
- `failed-precondition`: الانتخاب ليس نشطًا

#### `changeVote(data)`
تغيير صوت مسجل سابقًا. يتطلب `voter` ومازال الوقت ضمن `changeVoteWindow`.

**Input:**
```typescript
{
  electionId: string;
  candidateId: string;
}
```

**Output:**
```typescript
{ ok: true }
```

**Errors:**
- `failed-precondition`: انتهت نافذة التغيير

### Payments

#### `createPaymentIntent(data)`
إنشاء نية دفع عبر Paymob. يتطلب `companyAdmin`.

**Input:**
```typescript
{
  purpose: "subscription_monthly" | "subscription_yearly" | "meeting_fee";
  electionId?: string; // مطلوب إذا كان purpose = "meeting_fee"
}
```

**Output:**
```typescript
{
  iframeUrl: string;     // رابط iframe Paymob
  orderId: number;
  amount: number;        // بالفلس/سنت
  currency: string;      // "EGP" / "USD"
  tier: "egypt" | "gulf" | "standard"; // التسعير الإقليمي
}
```

### Admin

#### `provisionCompany(data)`
إنشاء شركة جديدة مع Identity Platform Tenant. يتطلب `superAdmin`.

**Input:**
```typescript
{
  name: string;
  plan?: string;         // "free" / "starter" / "pro"
  adminEmail: string;
  adminPassword: string;
}
```

**Output:**
```typescript
{
  companyId: string;
  tenantId: string;      // Identity Platform Tenant ID
  adminUid: string;
}
```

#### `setUserRole(data)`
تعيين دور لمستخدم. يتطلب `companyAdmin` أو `superAdmin`.

**Input:**
```typescript
{
  uid: string;
  role: "companyAdmin" | "secretary" | "voter";
}
```

**Output:**
```typescript
{ ok: true }
```

#### `createIntegration(data)`
تسجيل تطبيق خارجي متصل. يتطلب `companyAdmin`.

**Input:**
```typescript
{
  appName: string;
  appLogo?: string;      // URL صورة
  callbackUrl?: string;  // webhook endpoint
}
```

**Output:**
```typescript
{
  integrationId: string;
  apiKey: string;        // مرة واحدة فقط! احفظه.
  signingSecret: string; // للتوقيع على webhooks
}
```

---

## REST API (Integrations)

يقع تحت `/api/...`. كل طلب يتطلب:
- `Authorization: Bearer <apiKey>` (من `createIntegration`)

### `POST /api/elections`
إنشاء انتخاب نيابة عن شركة (عبر تطبيق خارجي).

**Body:**
```typescript
{
  title: string;
  description?: string;
  startDate: number;     // epoch
  endDate: number;
  changeVoteWindow?: number;
  registrationMode: "open" | "roster";
}
```

**Response:**
```typescript
{ electionId: string }
```

### `POST /api/voters`
إضافة ناخبين إلى انتخاب (batch).

**Body:**
```typescript
{
  electionId: string;
  voters: Array<{
    fullName: string;
    email?: string;
    nationalId?: string;
  }>;
}
```

**Response:**
```typescript
{ added: number }
```

### `GET /api/results/{electionId}`
جلب النتائج الكاملة.

**Response:**
```typescript
{
  electionId: string;
  status: "draft" | "active" | "ended";
  totalVotes: number;
  results: Array<{
    candidateId: string;
    name: string;
    votes: number;
  }>;
}
```

---

## Webhooks (Outbound)

عند انتهاء انتخاب، يُرسل webhook لـ `callbackUrl` كل تطبيق فعّال.

**Headers:**
```
X-Somni-Event: election.ended
X-Somni-Signature: <HMAC-SHA256(body, signingSecret)>
```

**Body:**
```typescript
{
  event: "election.ended";
  data: {
    electionId: string;
    tenantId: string;
    totalVotes: number;
    results: Array<{
      candidateId: string;
      name: string;
      votes: number;
    }>;
  };
  sentAt: number; // epoch ms
}
```

---

## Firestore Structure

### collections/documents

```
companies/{companyId}
  ├─ companyId
  ├─ tenantId
  ├─ name
  ├─ plan
  └─ createdAt

elections/{electionId}
  ├─ electionId
  ├─ tenantId
  ├─ companyId
  ├─ title
  ├─ status: draft|active|ended
  ├─ startDate
  ├─ endDate
  ├─ changeVoteWindow
  ├─ registrationMode: open|roster
  ├─ createdBy
  ├─ candidates/{candidateId}
  │  ├─ fullName
  │  ├─ photo
  │  └─ description
  ├─ voters/{voterId}
  │  ├─ fullName
  │  ├─ nidHash
  │  ├─ hasVoted
  │  ├─ votedFor
  │  ├─ changeVoteUntil
  │  └─ registeredAt
  └─ votes/{voteId}
     ├─ voterId
     ├─ candidateId
     └─ timestamp

integrations/{integrationId}
  ├─ integrationId
  ├─ companyId
  ├─ tenantId
  ├─ appName
  ├─ appLogo
  ├─ callbackUrl
  ├─ apiKeyHash
  ├─ signingSecret
  ├─ status: active|disabled
  └─ createdAt

subscriptions/{companyId}
  ├─ plan
  ├─ status: active|inactive
  ├─ startDate
  ├─ endDate
  └─ paymentMethod

paymentIntents/{orderId}
  ├─ orderId
  ├─ companyId
  ├─ amount
  ├─ currency
  ├─ status: pending|paid|failed
  ├─ purpose
  └─ processedAt

voterTokens/{voterId}
  └─ expireAt (TTL: 30 دقيقة)
```

---

## Error Codes

| Code | Description |
|---|---|
| `unauthenticated` | لا يوجد Firebase Auth token |
| `permission-denied` | الدور غير كافٍ أو الـ tenant غير متطابق |
| `invalid-argument` | input validation failed |
| `not-found` | المستند غير موجود |
| `already-exists` | يوجد مستند مشابه بالفعل |
| `failed-precondition` | الحالة غير صحيحة (انتخاب ليس نشطًا، إلخ) |
| `internal` | خطأ خادمي (Paymob، إلخ) |

---

## Rate Limiting

- Cloud Functions: حد أقصى 20 مثيل متزامن (قابل للتعديل)
- Cloud Tasks: حد أقصى 20 webhook متزامن
- Firestore: معايير Blaze (pay-as-you-go)
