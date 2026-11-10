export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { importDatabase } from "@/db/repositories/backup";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const text = await file.text();
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "File is not valid JSON" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "Content-Type must be application/json or multipart/form-data" },
      { status: 415 },
    );
  }

  const result = importDatabase(raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
