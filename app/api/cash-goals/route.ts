import { NextResponse } from "next/server";

import { normalizeCashGoalsInput, type CashGoals } from "@/lib/cash-goals";
import { readCashGoalsFromDb, writeCashGoalsToDb } from "@/lib/cash-goals-sqlite";

export const runtime = "nodejs";

function jsonGoals(g: CashGoals) {
  return NextResponse.json(g, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    return jsonGoals(readCashGoalsFromDb());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const goals = normalizeCashGoalsInput(body);
    writeCashGoalsToDb(goals);
    return jsonGoals(goals);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
