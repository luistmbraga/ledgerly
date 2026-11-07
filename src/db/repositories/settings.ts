import { eq } from "drizzle-orm";
import { db } from "../client";
import { settings, type Settings } from "../schema";

const SETTINGS_ID = 1;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function getSettings(tx?: Tx): Settings | undefined {
  return (tx ?? db)
    .select()
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .get();
}

export type SettingsUpdate = Partial<
  Pick<
    Settings,
    | "displayCurrency"
    | "emergencyFundTargetMonths"
    | "essentialMonthlySpendOverrideCents"
    | "personalityRevealedAt"
  >
>;

export function updateSettings(values: SettingsUpdate, tx?: Tx): void {
  (tx ?? db)
    .update(settings)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, SETTINGS_ID))
    .run();
}
