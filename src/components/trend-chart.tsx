import type { NetWorthPoint } from "@/domain/net-worth";
import { formatMoney } from "@/lib/money";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  const year = isoDate.slice(2, 4);
  return `${MONTHS_SHORT[month - 1] ?? ""} '${year}`;
}

export function TrendChart({
  points,
  currency,
}: {
  points: NetWorthPoint[];
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <p className="mt-2 text-xs text-stone-500">
        Record two months of balance snapshots to see the trend.
      </p>
    );
  }

  const W = 1000;
  const H = 60;
  const PAD = 2;
  const plotW = W - 2 * PAD;
  const plotH = H - 2 * PAD;

  const values = points.map((p) => p.netWorthCents);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  const toX = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * plotW;
  const toY = (v: number) => PAD + plotH - ((v - minVal) / valRange) * plotH;

  const linePoints = points
    .map((p, i) => `${toX(i)},${toY(p.netWorthCents)}`)
    .join(" ");
  const areaPoints = [
    `${toX(0)},${H - PAD}`,
    ...points.map((p, i) => `${toX(i)},${toY(p.netWorthCents)}`),
    `${toX(points.length - 1)},${H - PAD}`,
  ].join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.netWorthCents - first.netWorthCents;
  const isPositive = delta >= 0;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-14"
        aria-hidden="true"
      >
        <polygon points={areaPoints} fill="#0f766e" fillOpacity="0.08" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="#0f766e"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.length <= 24 &&
          points.map((p, i) => (
            <circle
              key={p.date}
              cx={toX(i)}
              cy={toY(p.netWorthCents)}
              r="4"
              fill="#0f766e"
            />
          ))}
      </svg>
      <div className="flex items-center justify-between text-xs text-stone-500 mt-0.5">
        <span>{monthLabel(first.date)}</span>
        <span
          className={`font-medium tabular-nums ${isPositive ? "text-teal-700" : "text-red-700"}`}
        >
          {isPositive ? "+" : ""}
          {formatMoney(delta, currency)} since {monthLabel(first.date)}
        </span>
        <span>{monthLabel(last.date)}</span>
      </div>
    </div>
  );
}
