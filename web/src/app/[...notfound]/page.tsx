import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="container">
      <h1 style={{ marginTop: 32, marginBottom: 24 }}>404 — الصفحة غير موجودة</h1>
      <Link href="/" className="btn">
        العودة للرئيسية
      </Link>
    </main>
  );
}
