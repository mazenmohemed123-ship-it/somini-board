import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/lib/theme-context";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Somni Board",
  description: "منصة إدارة انتخابات وتصويتات مجالس الإدارة والجمعيات العمومية",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Somni Board" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="corporate">
      <body>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
