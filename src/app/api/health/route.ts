import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
