"use client";

/**
 * DateTimePicker — an easy, dropdown-based date & time picker.
 *
 * Instead of a single confusing `datetime-local` input, the user picks each
 * part (day / month / year / hour / minute) from clean boxes. Fully bilingual
 * (Arabic / English) and theme-aware. The value is an epoch-ms number (or 0
 * when incomplete); onChange fires whenever a complete date is selected.
 */
import { useMemo } from "react";

interface DateTimePickerProps {
  value: number; // epoch ms, 0 = empty
  onChange: (epochMs: number) => void;
  ar: boolean;
  minYear?: number;
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number) {
  // month is 1-based here.
  return new Date(year, month, 0).getDate();
}

export function DateTimePicker({ value, onChange, ar, minYear }: DateTimePickerProps) {
  const d = value ? new Date(value) : null;
  const now = new Date();
  const baseYear = minYear ?? now.getFullYear();

  const day = d ? d.getDate() : 0;
  const month = d ? d.getMonth() + 1 : 0; // 1-based
  const year = d ? d.getFullYear() : 0;
  const hour = d ? d.getHours() : 0;
  const minute = d ? d.getMinutes() : 0;

  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => baseYear + i),
    [baseYear]
  );

  const maxDays = useMemo(
    () => (year && month ? daysInMonth(year, month) : 31),
    [year, month]
  );

  function emit(parts: { day?: number; month?: number; year?: number; hour?: number; minute?: number }) {
    const nd = parts.day ?? day ?? 1;
    const nm = parts.month ?? month ?? 1;
    const ny = parts.year ?? year ?? baseYear;
    const nh = parts.hour ?? hour ?? 0;
    const nmin = parts.minute ?? minute ?? 0;
    // Require day/month/year to be chosen before emitting a real timestamp.
    const finalDay = parts.day ?? day;
    const finalMonth = parts.month ?? month;
    const finalYear = parts.year ?? year;
    if (!finalDay || !finalMonth || !finalYear) {
      // Still update partial selection by building a provisional date.
      const provisional = new Date(ny, nm - 1, Math.min(nd, daysInMonth(ny, nm)), nh, nmin);
      onChange(provisional.getTime());
      return;
    }
    const clampedDay = Math.min(finalDay, daysInMonth(finalYear, finalMonth));
    onChange(new Date(finalYear, finalMonth - 1, clampedDay, nh, nmin).getTime());
  }

  const boxStyle: React.CSSProperties = { marginTop: 0 };

  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
      {/* Day */}
      <div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{ar ? "اليوم" : "Day"}</span>
        <select style={boxStyle} value={day || ""} onChange={(e) => emit({ day: Number(e.target.value) })}>
          <option value="">—</option>
          {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Month */}
      <div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{ar ? "الشهر" : "Month"}</span>
        <select style={boxStyle} value={month || ""} onChange={(e) => emit({ month: Number(e.target.value) })}>
          <option value="">—</option>
          {(ar ? MONTHS_AR : MONTHS_EN).map((name, i) => (
            <option key={i} value={i + 1}>{name}</option>
          ))}
        </select>
      </div>

      {/* Year */}
      <div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{ar ? "السنة" : "Year"}</span>
        <select style={boxStyle} value={year || ""} onChange={(e) => emit({ year: Number(e.target.value) })}>
          <option value="">—</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Hour */}
      <div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{ar ? "الساعة" : "Hour"}</span>
        <select style={boxStyle} value={d ? hour : ""} onChange={(e) => emit({ hour: Number(e.target.value) })}>
          <option value="">—</option>
          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
          ))}
        </select>
      </div>

      {/* Minute */}
      <div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{ar ? "الدقيقة" : "Minute"}</span>
        <select style={boxStyle} value={d ? minute : ""} onChange={(e) => emit({ minute: Number(e.target.value) })}>
          <option value="">—</option>
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
