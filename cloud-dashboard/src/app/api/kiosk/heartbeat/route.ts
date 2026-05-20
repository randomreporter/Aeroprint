import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/kiosk/heartbeat — Called by the Electron kiosk app every 30 seconds
// Authenticates via the kioskKey and updates status, paper count, version, and errors.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kioskKey, status, paperCount, softwareVersion, currentError } = body;

    if (!kioskKey) {
      return NextResponse.json({ error: "kioskKey required" }, { status: 400 });
    }

    const kiosk = await prisma.kiosk.findUnique({ where: { kioskKey } });
    if (!kiosk) {
      return NextResponse.json({ error: "Unknown kiosk" }, { status: 401 });
    }

    // Update kiosk telemetry
    const updated = await prisma.kiosk.update({
      where: { kioskKey },
      data: {
        status: status || kiosk.status,
        paperCount: paperCount !== undefined ? paperCount : kiosk.paperCount,
        softwareVersion: softwareVersion || kiosk.softwareVersion,
        currentError: currentError ?? null,
        lastHeartbeat: new Date(),
      },
    });

    // If there is an error, flag it for alert processing
    if (currentError && currentError !== kiosk.currentError) {
      // TODO: Phase 4 — trigger WhatsApp alert to owner here
      console.log(
        `[ALERT] Kiosk "${updated.name}" reported error: ${currentError}. Owner: ${kiosk.ownerId}`
      );
    }

    return NextResponse.json({ success: true, kioskId: updated.id });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
