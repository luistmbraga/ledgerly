import { eq } from "drizzle-orm";
import { isLiabilityType, type LiabilityType } from "@/domain/net-worth";
import { db } from "../client";
import { liabilities, valueSnapshots, type LiabilityRow } from "../schema";

export type LiabilityRecord = LiabilityRow & { type: LiabilityType };

export type LiabilityInput = {
  name: string;
  type: LiabilityType;
  notes: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertLiabilityInput(input: LiabilityInput): LiabilityInput {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 200) {
    invalid("Enter a name up to 200 characters.");
  }
  if (!isLiabilityType(input.type)) {
    invalid("Choose a valid liability type.");
  }
  if (input.notes !== null && input.notes.length > 2000) {
    invalid("Notes must be 2000 characters or fewer.");
  }
  return { ...input, name };
}

function asLiability(row: LiabilityRow): LiabilityRecord {
  if (!isLiabilityType(row.type)) {
    throw new Error(`Unknown liability type: ${row.type}`);
  }
  return { ...row, type: row.type };
}

export function listLiabilities(): LiabilityRecord[] {
  return db.select().from(liabilities).all().map(asLiability);
}

export function getLiability(id: number): LiabilityRecord | undefined {
  const row = db.select().from(liabilities).where(eq(liabilities.id, id)).get();
  return row ? asLiability(row) : undefined;
}

export function createLiability(input: LiabilityInput): LiabilityRecord {
  const value = assertLiabilityInput(input);
  const now = new Date().toISOString();
  const row = db
    .insert(liabilities)
    .values({
      name: value.name,
      type: value.type,
      notes: value.notes,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return asLiability(row);
}

export function updateLiability(
  id: number,
  input: LiabilityInput,
): LiabilityRecord | undefined {
  if (!getLiability(id)) return undefined;
  const value = assertLiabilityInput(input);
  const row = db
    .update(liabilities)
    .set({
      name: value.name,
      type: value.type,
      notes: value.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(liabilities.id, id))
    .returning()
    .get();
  return asLiability(row);
}

export function deleteLiability(id: number): boolean {
  if (!getLiability(id)) return false;
  db.transaction((tx) => {
    tx.delete(valueSnapshots)
      .where(eq(valueSnapshots.liabilityId, id))
      .run();
    tx.delete(liabilities).where(eq(liabilities.id, id)).run();
  });
  return true;
}
