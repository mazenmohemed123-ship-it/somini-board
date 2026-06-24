"use client";

/**
 * Simple bar chart (Chart.js via react-chartjs-2) showing monthly company
 * growth on the platform-owner overview. Kept in its own client component so
 * the Chart.js registration happens once, away from server rendering.
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function GrowthChart({
  labels,
  data,
  label,
}: {
  labels: string[];
  data: number[];
  label: string;
}) {
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: "#4f46e5",
            borderRadius: 6,
            maxBarThickness: 48,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      }}
      height={90}
    />
  );
}
