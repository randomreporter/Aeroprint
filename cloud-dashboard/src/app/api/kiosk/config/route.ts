import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kiosk/config?kioskKey=KIOSK-XXXXX
// Called by the local Backend Server to determine the pricing model and split config.
// Returns the kiosk's pricing model, revenue share %, and franchisee's Razorpay bank account ID.
export async function GET(req: NextRequest) {
  try {
    const kioskKey = req.nextUrl.searchParams.get("kioskKey");
    if (!kioskKey) {
      return NextResponse.json({ error: "kioskKey required" }, { status: 400 });
    }

    const kiosk = await prisma.kiosk.findUnique({
      where: { kioskKey },
      include: {
        owner: {
          select: { bankAccountId: true, name: true },
        },
      },
    });

    if (!kiosk) {
      return NextResponse.json({ error: "Unknown kiosk" }, { status: 404 });
    }

    return NextResponse.json({
      kioskId: kiosk.id,
      pricingModel: kiosk.pricingModel,
      revenueShare: kiosk.revenueShare, // Brand's % (e.g. 30)
      flatFee: kiosk.flatFee,
      bankAccountId: kiosk.owner.bankAccountId, // Razorpay linked account
      ownerName: kiosk.owner.name,
    });
  } catch (error) {
    console.error("Kiosk config error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
