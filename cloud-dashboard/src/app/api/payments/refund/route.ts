import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Razorpay from "razorpay";

// POST /api/payments/refund
// Handles full or partial refunds for a specific paymentId.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paymentId, amount } = body;

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    // Initialize Razorpay
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay keys are not configured on cloud" }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const refundOptions: any = {};
    if (amount) {
      refundOptions.amount = amount; // in paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    console.log(`[Cloud Razorpay] Refund successful: ${refund.id} for payment: ${paymentId}`);

    // Update the print job in DB if it exists
    const job = await prisma.printJob.findFirst({
      where: { paymentId },
    });

    if (job) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "REFUNDED",
          refundId: refund.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
    });
  } catch (error: any) {
    console.error("Cloud Refund Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process refund" }, { status: 500 });
  }
}
