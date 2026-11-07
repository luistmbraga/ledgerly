import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  displayCurrency: text("display_currency").notNull().default("EUR"),
  emergencyFundTargetMonths: integer("emergency_fund_target_months")
    .notNull()
    .default(6),
  essentialMonthlySpendOverrideCents: integer(
    "essential_monthly_spend_override_cents",
  ),
  personalityRevealedAt: text("personality_revealed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Settings = typeof settings.$inferSelect;

export const assets = sqliteTable(
  "assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    isLiquid: integer("is_liquid", { mode: "boolean" }).notNull().default(false),
    includeInAllocation: integer("include_in_allocation", { mode: "boolean" })
      .notNull()
      .default(true),
    cashPct: integer("cash_pct").notNull().default(0),
    bondsPct: integer("bonds_pct").notNull().default(0),
    equitiesPct: integer("equities_pct").notNull().default(0),
    otherPct: integer("other_pct").notNull().default(100),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("assets_type_idx").on(table.type)],
);

export const liabilities = sqliteTable("liabilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const valueSnapshots = sqliteTable(
  "value_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id").references(() => assets.id, {
      onDelete: "cascade",
    }),
    liabilityId: integer("liability_id").references(() => liabilities.id, {
      onDelete: "cascade",
    }),
    recordedOn: text("recorded_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("value_snapshots_asset_id_recorded_on_idx").on(
      table.assetId,
      table.recordedOn,
    ),
    index("value_snapshots_liability_id_recorded_on_idx").on(
      table.liabilityId,
      table.recordedOn,
    ),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    isEssential: integer("is_essential", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("categories_kind_name_idx").on(table.kind, table.name),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amountCents: integer("amount_cents").notNull(),
    occurredOn: text("occurred_on").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    assetId: integer("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    linkedSnapshotId: integer("linked_snapshot_id").references(
      () => valueSnapshots.id,
      { onDelete: "set null" },
    ),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("expenses_occurred_on_idx").on(table.occurredOn),
    index("expenses_category_id_idx").on(table.categoryId),
    index("expenses_asset_id_idx").on(table.assetId),
  ],
);

export const incomes = sqliteTable(
  "incomes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amountCents: integer("amount_cents").notNull(),
    occurredOn: text("occurred_on").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    assetId: integer("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    linkedSnapshotId: integer("linked_snapshot_id").references(
      () => valueSnapshots.id,
      { onDelete: "set null" },
    ),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("incomes_occurred_on_idx").on(table.occurredOn),
    index("incomes_category_id_idx").on(table.categoryId),
    index("incomes_asset_id_idx").on(table.assetId),
  ],
);

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetAmountCents: integer("target_amount_cents").notNull(),
  targetDate: text("target_date").notNull(),
  setAsideCents: integer("set_aside_cents").notNull().default(0),
  plannedMonthlyCents: integer("planned_monthly_cents"),
  expectedAnnualReturnBps: integer("expected_annual_return_bps"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const personalityAnswers = sqliteTable("personality_answers", {
  questionKey: text("question_key").primaryKey(),
  optionId: text("option_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const investorProfiles = sqliteTable("investor_profiles", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
  riskScore: integer("risk_score").notNull(),
  horizonScore: integer("horizon_score").notNull(),
  experienceScore: integer("experience_score").notNull(),
  liquidityScore: integer("liquidity_score").notNull(),
  completedAt: text("completed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const aiResults = sqliteTable(
  "ai_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task: text("task").notNull(),
    entityId: text("entity_id"),
    inputHash: text("input_hash").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputJson: text("output_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ai_results_task_entity_hash_idx").on(
      table.task,
      table.entityId,
      table.inputHash,
    ),
  ],
);

export type AssetRow = typeof assets.$inferSelect;
export type LiabilityRow = typeof liabilities.$inferSelect;
export type ValueSnapshotRow = typeof valueSnapshots.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type IncomeRow = typeof incomes.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type PersonalityAnswerRow = typeof personalityAnswers.$inferSelect;
export type InvestorProfileRow = typeof investorProfiles.$inferSelect;
export type AiResultRow = typeof aiResults.$inferSelect;
