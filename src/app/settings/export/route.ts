export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { exportDatabase } from "@/db/repositories/backup";

export function GET(): NextResponse {
  const data = exportDatabase();
  const json = JSON.stringify(data, null, 2);
  const filename = `ledgerly-backup-${data.exportedAt.slice(0, 10)}.json`;
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
