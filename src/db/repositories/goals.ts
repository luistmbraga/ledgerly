import { asc, eq } from "drizzle-orm";
import { isValidIsoDate } from "./snapshots";
import { db } from "../client";
import { goals, type GoalRow } from "../schema";

export type GoalRecord = GoalRow;

export type GoalInput = {
  name: string;
  targetAmountCents: number;
  targetDate: string;
  setAsideCents: number;
  plannedMonthlyCents: number | null;
  expectedAnnualReturnBps: number | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertGoalInput(input: GoalInput): GoalInput {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 200) {
    invalid("Enter a name up to 200 characters.");
  }
  if (!Number.isSafeInteger(input.targetAmountCents) || input.targetAmountCents <= 0) {
    invalid("Enter a target amount greater than zero.");
  }
  if (!isValidIsoDate(input.targetDate)) {
    invalid("Enter a valid target date.");
  }
  if (!Number.isSafeInteger(input.setAsideCents) || input.setAsideCents < 0) {
    invalid("Enter a set-aside amount of zero or more.");
  }
  if (
    input.plannedMonthlyCents !== null &&
    (!Number.isSafeInteger(input.plannedMonthlyCents) || input.plannedMonthlyCents < 0)
  ) {
    invalid("Enter a planned monthly amount of zero or more.");
  }
  if (
    input.expectedAnnualReturnBps !== null &&
    (!Number.isSafeInteger(input.expectedAnnualReturnBps) ||
      input.expectedAnnualReturnBps < 0 ||
      input.expectedAnnualReturnBps > 10_000)
  ) {
    invalid("Enter an expected return from 0 to 100.");
  }
  return { ...input, name };
}

export function listGoals(): GoalRecord[] {
  return db
    .select()
    .from(goals)
    .orderBy(asc(goals.targetDate), asc(goals.name), asc(goals.id))
    .all();
}

export function getGoal(id: number): GoalRecord | undefined {
  return db.select().from(goals).where(eq(goals.id, id)).get();
}

export function createGoal(input: GoalInput): GoalRecord {
  const value = assertGoalInput(input);
  const now = new Date().toISOString();
  return db
    .insert(goals)
    .values({
      name: value.name,
      targetAmountCents: value.targetAmountCents,
      targetDate: value.targetDate,
      setAsideCents: value.setAsideCents,
      plannedMonthlyCents: value.plannedMonthlyCents,
      expectedAnnualReturnBps: value.expectedAnnualReturnBps,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateGoal(id: number, input: GoalInput): GoalRecord | undefined {
  if (!getGoal(id)) return undefined;
  const value = assertGoalInput(input);
  return db
    .update(goals)
    .set({
      name: value.name,
      targetAmountCents: value.targetAmountCents,
      targetDate: value.targetDate,
      setAsideCents: value.setAsideCents,
      plannedMonthlyCents: value.plannedMonthlyCents,
      expectedAnnualReturnBps: value.expectedAnnualReturnBps,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(goals.id, id))
    .returning()
    .get();
}

export function deleteGoal(id: number): boolean {
  const result = db.delete(goals).where(eq(goals.id, id)).run();
  return result.changes > 0;
}
