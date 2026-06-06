import { NextResponse } from "next/server";
import { collectValidatorStatus } from "@/lib/validator-doctor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await collectValidatorStatus();
  return NextResponse.json(payload, { status: 200 });
}
