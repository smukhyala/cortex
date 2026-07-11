import { NextRequest, NextResponse } from "next/server";
import { computeWorkspace } from "@/services/workspace";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const question = searchParams.get("query") ?? undefined;
  const focusModeId = searchParams.get("focus") ?? undefined;

  const state = await computeWorkspace({ question, focusModeId });
  return NextResponse.json(state);
}
