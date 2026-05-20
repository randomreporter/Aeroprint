import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import crypto from "crypto";

// POST /api/kiosk/register
// Allows Franchise Owner to register a new kiosk under their account.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "FRANCHISEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, location } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Kiosk name is required" }, { status: 400 });
    }

    const kioskKey = `kiosk_${crypto.randomUUID().replace(/-/g, "")}`;

    const newKiosk = await prisma.kiosk.create({
      data: {
        name,
        location: location || null,
        kioskKey,
        ownerId: user.userId,
        status: "OFFLINE", // Default to offline until first heartbeat
        pricingModel: "REVENUE_SHARE",
        revenueShare: 30, // Default 30% brand share, 70% franchisee share
        flatFee: 0,
        paperCount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      kiosk: {
        id: newKiosk.id,
        name: newKiosk.name,
        location: newKiosk.location,
        kioskKey: newKiosk.kioskKey,
        pricingModel: newKiosk.pricingModel,
        revenueShare: newKiosk.revenueShare,
      },
    });
  } catch (error: any) {
    console.error("Register kiosk error:", error);
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}
