import { desc, eq } from "drizzle-orm";
import {
  nextCashCents,
  type CashDirection,
} from "@/domain/cash-movement";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { db } from "../client";
import {
  assets,
  expenses,
  incomes,
  valueSnapshots,
  type ValueSnapshotRow,
} from "../schema";
import { isValidIsoDate } from "./snapshots";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function listAssetSnapshots(
  tx: Tx,
  assetId: number,
): ValueSnapshotRow[] {
  return tx
    .select()
    .from(valueSnapshots)
    .where(eq(valueSnapshots.assetId, assetId))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
}

function assertCashAsset(tx: Tx, assetId: number) {
  const asset = tx.select().from(assets).where(eq(assets.id, assetId)).get();
  if (!asset) invalid("Cash account not found.");
  if (asset.type !== "cash") {
    invalid("Only cash accounts can be linked to expenses or income.");
  }
  return asset;
}

function assertNotBeforeLatest(
  occurredOn: string,
  latest: ValueSnapshotRow | null,
): void {
  if (latest !== null && occurredOn < latest.recordedOn) {
    invalid(
      `This date is before the latest balance on ${latest.recordedOn}. Choose that date or later, or leave the cash account empty.`,
    );
  }
}

function freezeMessage(latest: ValueSnapshotRow): string {
  return `This entry's cash change was followed by a newer balance on ${latest.recordedOn}. Amount, date, and account cannot change.`;
}

function insertLinkedSnapshot(
  tx: Tx,
  input: {
    assetId: number;
    occurredOn: string;
    amountCents: number;
    direction: CashDirection;
  },
): ValueSnapshotRow {
  if (!isValidIsoDate(input.occurredOn)) {
    invalid("Enter a valid date.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    invalid("Snapshot amount must be zero or greater.");
  }
  return tx
    .insert(valueSnapshots)
    .values({
      assetId: input.assetId,
      liabilityId: null,
      recordedOn: input.occurredOn,
      amountCents: input.amountCents,
      note: input.direction === "expense" ? "Expense" : "Income",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

function computeNextBalance(
  baseCents: number,
  direction: CashDirection,
  amountCents: number,
): number {
  const result = nextCashCents(baseCents, direction, amountCents);
  if (!result.ok) {
    invalid("This amount would make the cash balance negative.");
  }
  return result.amountCents;
}

/** Create a cash snapshot for a new journal row. Returns snapshot id or null. */
export function createCashLink(
  tx: Tx,
  input: {
    assetId: number | null;
    occurredOn: string;
    amountCents: number;
    direction: CashDirection;
  },
): { assetId: number | null; linkedSnapshotId: number | null } {
  if (input.assetId === null) {
    return { assetId: null, linkedSnapshotId: null };
  }
  assertCashAsset(tx, input.assetId);
  const snapshots = listAssetSnapshots(tx, input.assetId);
  const latest = selectLatestSnapshot(snapshots);
  assertNotBeforeLatest(input.occurredOn, latest);
  const nextAmount = computeNextBalance(
    latest?.amountCents ?? 0,
    input.direction,
    input.amountCents,
  );
  const snapshot = insertLinkedSnapshot(tx, {
    assetId: input.assetId,
    occurredOn: input.occurredOn,
    amountCents: nextAmount,
    direction: input.direction,
  });
  return { assetId: input.assetId, linkedSnapshotId: snapshot.id };
}

export type ExistingCashLink = {
  assetId: number | null;
  linkedSnapshotId: number | null;
  amountCents: number;
  occurredOn: string;
};

/**
 * Apply cash-link changes on journal update.
 * When the linked snapshot is no longer latest, amount/date/account must stay put.
 */
export function updateCashLink(
  tx: Tx,
  existing: ExistingCashLink,
  input: {
    assetId: number | null;
    occurredOn: string;
    amountCents: number;
    direction: CashDirection;
  },
): { assetId: number | null; linkedSnapshotId: number | null } {
  const cashFieldsChanged =
    existing.assetId !== input.assetId ||
    existing.amountCents !== input.amountCents ||
    existing.occurredOn !== input.occurredOn;

  if (existing.linkedSnapshotId !== null && existing.assetId !== null) {
    const snapshots = listAssetSnapshots(tx, existing.assetId);
    const latest = selectLatestSnapshot(snapshots);
    const linkedIsLatest =
      latest !== null && latest.id === existing.linkedSnapshotId;

    if (!linkedIsLatest) {
      if (cashFieldsChanged) {
        invalid(
          latest
            ? freezeMessage(latest)
            : "This entry's cash change can no longer be edited.",
        );
      }
      return {
        assetId: existing.assetId,
        linkedSnapshotId: existing.linkedSnapshotId,
      };
    }

    // Linked snapshot is still latest — may update or remove it.
    if (input.assetId === null) {
      tx.delete(valueSnapshots)
        .where(eq(valueSnapshots.id, existing.linkedSnapshotId))
        .run();
      return { assetId: null, linkedSnapshotId: null };
    }

    assertCashAsset(tx, input.assetId);

    if (input.assetId !== existing.assetId) {
      // Move link to another cash account: drop old snapshot, create on new.
      tx.delete(valueSnapshots)
        .where(eq(valueSnapshots.id, existing.linkedSnapshotId))
        .run();
      const targetSnapshots = listAssetSnapshots(tx, input.assetId);
      const targetLatest = selectLatestSnapshot(targetSnapshots);
      assertNotBeforeLatest(input.occurredOn, targetLatest);
      const nextAmount = computeNextBalance(
        targetLatest?.amountCents ?? 0,
        input.direction,
        input.amountCents,
      );
      const snapshot = insertLinkedSnapshot(tx, {
        assetId: input.assetId,
        occurredOn: input.occurredOn,
        amountCents: nextAmount,
        direction: input.direction,
      });
      return { assetId: input.assetId, linkedSnapshotId: snapshot.id };
    }

    // Same account: recompute from prior balance (exclude linked snapshot).
    const prior = selectLatestSnapshot(
      snapshots.filter((row) => row.id !== existing.linkedSnapshotId),
    );
    assertNotBeforeLatest(input.occurredOn, prior);
    const nextAmount = computeNextBalance(
      prior?.amountCents ?? 0,
      input.direction,
      input.amountCents,
    );
    tx.update(valueSnapshots)
      .set({
        recordedOn: input.occurredOn,
        amountCents: nextAmount,
        note: input.direction === "expense" ? "Expense" : "Income",
      })
      .where(eq(valueSnapshots.id, existing.linkedSnapshotId))
      .run();
    return {
      assetId: input.assetId,
      linkedSnapshotId: existing.linkedSnapshotId,
    };
  }

  // No existing link — optionally create one.
  return createCashLink(tx, input);
}

/**
 * On delete: if linked snapshot is still latest, remove it to reverse the balance.
 * If a newer snapshot exists, leave all snapshots in place.
 */
export function deleteCashLink(
  tx: Tx,
  existing: ExistingCashLink,
): void {
  if (existing.linkedSnapshotId === null || existing.assetId === null) {
    return;
  }
  const snapshots = listAssetSnapshots(tx, existing.assetId);
  const latest = selectLatestSnapshot(snapshots);
  if (latest !== null && latest.id === existing.linkedSnapshotId) {
    tx.delete(valueSnapshots)
      .where(eq(valueSnapshots.id, existing.linkedSnapshotId))
      .run();
  }
}

/** Clear journal cash links before deleting an asset and its snapshots. */
export function clearCashLinksForAsset(tx: Tx, assetId: number): void {
  tx.update(expenses)
    .set({ assetId: null, linkedSnapshotId: null })
    .where(eq(expenses.assetId, assetId))
    .run();
  tx.update(incomes)
    .set({ assetId: null, linkedSnapshotId: null })
    .where(eq(incomes.assetId, assetId))
    .run();
}
