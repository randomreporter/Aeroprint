import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// POST /api/admin/kiosk/pricing
// Updates the pricing model and parameters of a kiosk (Super Admin only).
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { kioskId, pricingModel, revenueShare, flatFee } = await req.json();

    if (!kioskId || !pricingModel) {
      return NextResponse.json({ error: "Kiosk ID and pricing model are required" }, { status: 400 });
    }

    if (pricingModel !== "REVENUE_SHARE" && pricingModel !== "FLAT_FEE") {
      return NextResponse.json({ error: "Invalid pricing model" }, { status: 400 });
    }

    const updateData: any = {
      pricingModel,
    };

    if (pricingModel === "REVENUE_SHARE") {
      if (typeof revenueShare !== "number" || revenueShare < 0 || revenueShare > 100) {
        return NextResponse.json({ error: "Revenue share must be a percentage between 0 and 100" }, { status: 400 });
      }
      updateData.revenueShare = revenueShare;
      updateData.flatFee = 0;
    } else {
      if (typeof flatFee !== "number" || flatFee < 0) {
        return NextResponse.json({ error: "Flat fee must be a positive number" }, { status: 400 });
      }
      updateData.flatFee = flatFee;
      updateData.revenueShare = 0;
    }

    const updatedKiosk = await prisma.kiosk.update({
      where: { id: kioskId },
      data: updateData,
    });

    return NextResponse.json({ success: true, kiosk: updatedKiosk });
  } catch (error: any) {
    console.error("Update pricing error:", error);
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}
