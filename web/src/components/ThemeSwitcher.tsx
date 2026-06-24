"use client";

/**
 * Theme toggle. A pill with two segments (Corporate / Tech). Visible on every
 * page via the navs and the auth screens, so anyone can re-skin the whole site
 * in one click. The choice persists via ThemeProvider (localStorage).
 */
import { useTheme } from "@/lib/theme-context";
import { useI18n } from "@/i18n";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const labels = {
    corporate: ar ? "كلاسيكي" : "Corporate",
    tech: ar ? "تقني" : "Tech",
  };

  return (
    <div
      role="group"
      aria-label="Theme switcher"
      style={{
        display: "inline-flex",
        background: "rgba(148,163,184,0.18)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {(["corporate", "tech"] as const).map((opt) => {
        const active = theme === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => setTheme(opt)}
            aria-pressed={active}
            title={labels[opt]}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              padding: compact ? "4px 10px" : "6px 14px",
              fontSize: compact ? "0.75rem" : "0.85rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
              background: active
                ? opt === "tech"
                  ? "#10b981"
                  : "#4f46e5"
                : "transparent",
              color: active ? "#fff" : "inherit",
              boxShadow: active ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
            }}
          >
            <span aria-hidden style={{ fontSize: "0.9em" }}>
              {opt === "tech" ? "⬡" : "▣"}
            </span>
            {!compact && labels[opt]}
          </button>
        );
      })}
    </div>
  );
}
