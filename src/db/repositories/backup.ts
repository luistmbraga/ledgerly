import { z } from "zod";
import { db } from "../client";
import {
  assets,
  liabilities,
  valueSnapshots,
  categories,
  expenses,
  incomes,
  goals,
  personalityAnswers,
  investorProfiles,
  settings,
} from "../schema";

// ---------------------------------------------------------------------------
// Zod schemas for each table row
// ---------------------------------------------------------------------------

const SettingsSchema = z.object({
  id: z.number().int(),
  displayCurrency: z.string(),
  emergencyFundTargetMonths: z.number().int(),
  essentialMonthlySpendOverrideCents: z.number().int().nullable(),
  personalityRevealedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AssetSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  name: z.string(),
  isLiquid: z.boolean(),
  includeInAllocation: z.boolean(),
  cashPct: z.number().int(),
  bondsPct: z.number().int(),
  equitiesPct: z.number().int(),
  otherPct: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const LiabilitySchema = z.object({
  id: z.number().int(),
  type: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ValueSnapshotSchema = z.object({
  id: z.number().int(),
  assetId: z.number().int().nullable(),
  liabilityId: z.number().int().nullable(),
  recordedOn: z.string(),
  amountCents: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

const CategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  kind: z.string(),
  isEssential: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});

const ExpenseSchema = z.object({
  id: z.number().int(),
  amountCents: z.number().int(),
  occurredOn: z.string(),
  categoryId: z.number().int().nullable(),
  assetId: z.number().int().nullable(),
  linkedSnapshotId: z.number().int().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const IncomeSchema = z.object({
  id: z.number().int(),
  amountCents: z.number().int(),
  occurredOn: z.string(),
  categoryId: z.number().int().nullable(),
  assetId: z.number().int().nullable(),
  linkedSnapshotId: z.number().int().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const GoalSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  targetAmountCents: z.number().int(),
  targetDate: z.string(),
  setAsideCents: z.number().int(),
  plannedMonthlyCents: z.number().int().nullable(),
  expectedAnnualReturnBps: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const PersonalityAnswerSchema = z.object({
  questionKey: z.string(),
  optionId: z.string(),
  updatedAt: z.string(),
});

const InvestorProfileSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  riskScore: z.number().int(),
  horizonScore: z.number().int(),
  experienceScore: z.number().int(),
  liquidityScore: z.number().int(),
  completedAt: z.string(),
  createdAt: z.string(),
});

export const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.array(SettingsSchema),
  assets: z.array(AssetSchema),
  liabilities: z.array(LiabilitySchema),
  value_snapshots: z.array(ValueSnapshotSchema),
  categories: z.array(CategorySchema),
  expenses: z.array(ExpenseSchema),
  incomes: z.array(IncomeSchema),
  goals: z.array(GoalSchema),
  personality_answers: z.array(PersonalityAnswerSchema),
  investor_profiles: z.array(InvestorProfileSchema),
});

export type BackupData = z.infer<typeof BackupSchema>;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportDatabase(): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: db.select().from(settings).all(),
    assets: db.select().from(assets).all(),
    liabilities: db.select().from(liabilities).all(),
    value_snapshots: db.select().from(valueSnapshots).all(),
    categories: db.select().from(categories).all(),
    expenses: db.select().from(expenses).all(),
    incomes: db.select().from(incomes).all(),
    goals: db.select().from(goals).all(),
    personality_answers: db.select().from(personalityAnswers).all(),
    investor_profiles: db.select().from(investorProfiles).all(),
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportResult =
  | { ok: true }
  | { ok: false; error: string };

export function importDatabase(raw: unknown): ImportResult {
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid backup format: ${issue?.message ?? "unknown error"} at ${issue?.path.join(".") ?? "root"}`,
    };
  }

  const data = parsed.data;

  try {
    db.transaction((tx) => {
      // Delete in dependency order (deepest references first)
      tx.delete(expenses).run();
      tx.delete(incomes).run();
      tx.delete(valueSnapshots).run();
      tx.delete(categories).run();
      tx.delete(goals).run();
      tx.delete(personalityAnswers).run();
      tx.delete(investorProfiles).run();
      tx.delete(assets).run();
      tx.delete(liabilities).run();

      // Insert in FK-safe order (parents before children)
      // settings: update or insert the singleton row
      for (const row of data.settings) {
        tx
          .insert(settings)
          .values(row)
          .onConflictDoUpdate({
            target: settings.id,
            set: {
              displayCurrency: row.displayCurrency,
              emergencyFundTargetMonths: row.emergencyFundTargetMonths,
              essentialMonthlySpendOverrideCents: row.essentialMonthlySpendOverrideCents,
              personalityRevealedAt: row.personalityRevealedAt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
          })
          .run();
      }

      if (data.assets.length > 0) tx.insert(assets).values(data.assets).run();
      if (data.liabilities.length > 0) tx.insert(liabilities).values(data.liabilities).run();
      if (data.categories.length > 0) tx.insert(categories).values(data.categories).run();
      if (data.value_snapshots.length > 0) tx.insert(valueSnapshots).values(data.value_snapshots).run();
      if (data.expenses.length > 0) tx.insert(expenses).values(data.expenses).run();
      if (data.incomes.length > 0) tx.insert(incomes).values(data.incomes).run();
      if (data.goals.length > 0) tx.insert(goals).values(data.goals).run();
      if (data.personality_answers.length > 0) tx.insert(personalityAnswers).values(data.personality_answers).run();
      if (data.investor_profiles.length > 0) tx.insert(investorProfiles).values(data.investor_profiles).run();
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Database error during import",
    };
  }

  return { ok: true };
}
