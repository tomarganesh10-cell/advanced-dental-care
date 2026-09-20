"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Charts for the reports screen.
 *
 * Two constraints shape these:
 *
 *  - Series are distinguishable without colour. The appointment chart stacks
 *    completed and not-completed, which reads as a proportion even in
 *    greyscale, and every value is also available in the table beneath.
 *  - No gridlines beyond the horizontal ones, no 3D, no gradients. A clinic
 *    manager is reading this to decide whether Tuesdays are quiet, not to
 *    admire it.
 */

const AXIS_STYLE = { fontSize: 11, fill: "#6b7a8d" };

export interface TrendPoint {
  date: string;
  total: number;
  completed: number;
}

export function AppointmentTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-(--color-ink-subtle)">
        No appointments in this period.
      </p>
    );
  }

  const chartData = data.map((point) => ({
    label: point.date.slice(8, 10) + "/" + point.date.slice(5, 7),
    completed: point.completed,
    other: Math.max(0, point.total - point.completed),
    total: point.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ee" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(19,34,56,0.04)" }}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e3e8ee",
            fontSize: 12,
            boxShadow: "0 8px 24px -6px rgb(19 34 56 / 0.12)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="completed"
          stackId="a"
          name="Completed"
          fill="#14846c"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="other"
          stackId="a"
          name="Other outcomes"
          fill="#9db6ce"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface SourcePoint {
  source: string;
  total: number;
  booked: number;
  bookingRate: number;
}

export function SourceChart({ data }: { data: SourcePoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-(--color-ink-subtle)">
        No enquiries in this period.
      </p>
    );
  }

  const chartData = [...data]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((point) => ({
      label: point.source.charAt(0) + point.source.slice(1).toLowerCase().replace(/_/g, " "),
      enquiries: point.total,
      booked: point.booked,
      rate: point.bookingRate,
    }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 38)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ee" horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={92}
        />
        <Tooltip
          cursor={{ fill: "rgba(19,34,56,0.04)" }}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e3e8ee",
            fontSize: 12,
            boxShadow: "0 8px 24px -6px rgb(19 34 56 / 0.12)",
          }}
          formatter={(value, name) => [
            String(value ?? 0),
            name === "booked" ? "Booked" : "Enquiries",
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="enquiries" name="Enquiries" fill="#c7d5e4" radius={[0, 3, 3, 0]} />
        <Bar dataKey="booked" name="Booked" radius={[0, 3, 3, 0]}>
          {chartData.map((entry, index) => (
            /* Booking rate shades the bar, so a high-volume low-conversion
               source is visible without reading the table. */
            <Cell
              key={index}
              fill={entry.rate >= 40 ? "#14846c" : entry.rate >= 20 ? "#44c09e" : "#8a5a00"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
