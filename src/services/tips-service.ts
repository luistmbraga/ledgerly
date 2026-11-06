import { loadFinancialSnapshot } from "@/ai/load-snapshot";
import {
  renderTipTemplates,
  type FindingSeverity,
  type TipTemplate,
} from "@/domain/findings";

export type DashboardTip = TipTemplate & {
  severity: FindingSeverity;
};

export function getDashboardTips(asOfDate?: string): DashboardTip[] {
  const snapshot = loadFinancialSnapshot(asOfDate);
  const severityById = new Map(
    snapshot.findings.map((finding) => [finding.id, finding.severity]),
  );
  return renderTipTemplates(snapshot.findings).map((tip) => ({
    ...tip,
    severity: severityById.get(tip.findingId) ?? "info",
  }));
}
