import type { ReactNode } from "react";

/**
 * The only component allowed to render a hypothetical value.
 * Every what-if figure goes through here so it always carries the marker.
 */
export function ScenarioFigure({
  children,
  delta,
}: {
  children: ReactNode;
  /** Signed difference from the current figure, already formatted. */
  delta?: string | null;
}) {
  return (
    <span
      data-scenario-figure
      className="inline-flex flex-wrap items-baseline gap-x-1.5 rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 text-amber-950"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        What-if
      </span>
      <span className="font-semibold tabular-nums">{children}</span>
      {delta ? (
        <span className="text-xs tabular-nums text-amber-800">({delta})</span>
      ) : null}
    </span>
  );
}
