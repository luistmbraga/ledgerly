import type { GoalStatus, HorizonBucket } from "@/domain/goals";

export const BUCKET_LABELS: Record<HorizonBucket, string> = {
  short: "Short",
  mid: "Mid",
  long: "Long",
};

export const STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "On track",
  tight: "Tight",
  shortfall: "Shortfall",
  overdue: "Overdue",
};

export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function bpsToPercentInput(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = Math.abs(bps % 100);
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function goalTemplateExplanation(input: {
  status: GoalStatus;
  remainingCents: number;
  hasPlannedMonthly: boolean;
  hasExpectedReturn: boolean;
}): string {
  if (input.remainingCents === 0) {
    return "Amount already set aside meets this target, so the goal is on track. No further monthly contribution is required.";
  }

  const verdict: Record<GoalStatus, string> = {
    on_track:
      "This goal is on track. The comparison amount covers the required monthly contribution through the target date.",
    tight:
      "This goal is tight. The comparison amount is at least 80% of the required monthly contribution and still below it.",
    shortfall:
      "This goal is short. The comparison amount is below 80% of the required monthly contribution, so the target date is out of reach at the current pace.",
    overdue:
      "This goal is overdue. The target date has passed. Update the target date or mark it as reached.",
  };

  const basis = input.hasPlannedMonthly
    ? "Feasibility uses your planned monthly contribution."
    : "No planned monthly contribution is set, so feasibility uses the trailing 3-month average surplus.";

  const returns = input.hasExpectedReturn
    ? " The required amount assumes the expected annual return compounds monthly. That return is a planning assumption, not a guaranteed result."
    : " The required amount is a flat monthly contribution with no investment return.";

  return `${verdict[input.status]} ${basis}${returns}`;
}
