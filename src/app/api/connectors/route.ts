import { NextRequest, NextResponse } from "next/server";
import {
  listConnectors,
  configureConnector,
  disconnectConnector,
  getConnectorConfig,
} from "@/integrations/connectors";

// GET /api/connectors — List all available connectors with status
export async function GET() {
  const connectors = listConnectors();

  // Return connectors with masked configs
  const response = connectors.map((c) => ({
    ...c,
    config: getConnectorConfig(c.id) ?? {},
  }));

  return NextResponse.json(response);
}

// POST /api/connectors — Configure or disconnect a connector
//
// Body:
//   { action: "configure", id: "gmail", config: { email: "...", ... } }
//   { action: "disconnect", id: "gmail" }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, id, config } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Connector id is required" }, { status: 400 });
  }

  if (action === "disconnect") {
    const success = disconnectConnector(id);
    if (!success) {
      return NextResponse.json({ error: `Unknown connector: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: `Disconnected ${id}` });
  }

  // Default action: configure
  if (!config || typeof config !== "object") {
    return NextResponse.json(
      { error: "config object is required for configure action" },
      { status: 400 }
    );
  }

  const result = await configureConnector(id, config);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 422 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Connector ${id} configured`,
    warning: result.error, // May contain a non-fatal warning (e.g., test failed)
  });
}
