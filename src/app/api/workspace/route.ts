import { NextResponse } from "next/server";
import {
  getWorkspaceResponse,
  holdInMind,
  suppress,
  release,
  decayAllSlots,
} from "@/services/j-lens";
import { seedWorkspaceSlots } from "@/lib/seed-workspace";

export async function GET() {
  try {
    await decayAllSlots();
    const workspace = await getWorkspaceResponse();
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get workspace" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, concept, durationHours } = body;

    switch (action) {
      case "hold": {
        const result = await holdInMind(concept);
        return NextResponse.json(result);
      }
      case "suppress": {
        const result = await suppress(concept, durationHours ?? 24);
        return NextResponse.json(result);
      }
      case "release": {
        const result = await release(concept);
        return NextResponse.json(result);
      }
      case "seed": {
        const created = await seedWorkspaceSlots();
        return NextResponse.json({ seeded: created });
      }
      case "tick": {
        const { runWorkspaceTick } = await import("@/lib/workspace-tick");
        const result = await runWorkspaceTick();
        return NextResponse.json(result);
      }
      case "init": {
        const { initializeWorkspace } = await import("@/lib/workspace-tick");
        const result = await initializeWorkspace();
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace action failed" },
      { status: 500 }
    );
  }
}
