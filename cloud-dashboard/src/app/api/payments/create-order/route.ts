import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Razorpay from "razorpay";

// POST /api/payments/create-order
// Authenticates the kiosk using kioskKey, calculates the print cost, 
// and creates the Razorpay order with Route splitting if REVENUE_SHARE.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { files, kioskKey } = body;

    if (!kioskKey) {
      return NextResponse.json({ error: "kioskKey is required" }, { status: 400 });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Authenticate the kiosk
    const kiosk = await prisma.kiosk.findUnique({
      where: { kioskKey },
      include: { owner: true }
    });

    if (!kiosk) {
      return NextResponse.json({ error: "Unauthorized kiosk" }, { status: 401 });
    }

    // Calculate total amount
    let totalAmountInPaise = 0;
    let totalPages = 0;
    let primaryColorMode = "bw";

    for (const f of files) {
      const pricePerSheet = f.colorMode === "color" ? 15 : 5;
      const numSheets = f.numPages || 1;
      const copies = f.copies || 1;
      totalAmountInPaise += (pricePerSheet * numSheets * copies) * 100;
      totalPages += numSheets * copies;
      if (f.colorMode === "color") primaryColorMode = "color";
    }

    // Initialize Razorpay on the cloud side
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay keys are not configured on cloud" }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const orderOptions: any = {
      amount: totalAmountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        kioskKey,
        totalPages: totalPages.toString(),
        colorMode: primaryColorMode,
      }
    };

    // Apply Razorpay Route split if REVENUE_SHARE & bankAccountId exists
    if (kiosk.pricingModel === "REVENUE_SHARE" && kiosk.owner.bankAccountId) {
      const franchiseePercent = 100 - kiosk.revenueShare;
      const franchiseeShare = Math.round(totalAmountInPaise * (franchiseePercent / 100));

      orderOptions.transfers = [
        {
          account: kiosk.owner.bankAccountId,
          amount: franchiseeShare,
          currency: "INR",
          notes: {
            kioskKey,
            splitType: "REVENUE_SHARE",
            franchiseePercent: franchiseePercent.toString(),
          },
          on_hold: 0,
        }
      ];
      console.log(`[Cloud Razorpay] Route Split configured: ${franchiseePercent}% to Franchisee (${kiosk.owner.name})`);
    }

    const order = await razorpay.orders.create(orderOptions);

    // Track print job as PENDING in database
    await prisma.printJob.create({
      data: {
        kioskId: kiosk.id,
        pageCount: totalPages,
        colorMode: primaryColorMode === "color" ? "COLOR" : "MONOCHROME",
        totalAmount: totalAmountInPaise / 100,
        paymentId: order.id, // temp use order.id until payment succeeds
        orderId: order.id,
        status: "PENDING",
      }
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: totalAmountInPaise,
      key: keyId,
      totalPages,
    });
  } catch (error: any) {
    console.error("Cloud Create Order Error:", error);
    return NextResponse.json({ error: error.message || "Failed to create order" }, { status: 500 });
  }
}
