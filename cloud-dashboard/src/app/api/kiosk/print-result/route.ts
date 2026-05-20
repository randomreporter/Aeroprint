import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Razorpay from "razorpay";

// POST /api/kiosk/print-result — Called by the Electron kiosk after a print job completes or fails.
// If it fails, the cloud dashboard will handle the refund.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kioskKey, paymentId, status, failureReason, pageCount } = body;

    if (!kioskKey || !paymentId) {
      return NextResponse.json(
        { error: "kioskKey and paymentId are required" },
        { status: 400 }
      );
    }

    const kiosk = await prisma.kiosk.findUnique({ where: { kioskKey } });
    if (!kiosk) {
      return NextResponse.json({ error: "Unknown kiosk" }, { status: 401 });
    }

    // Find the print job by paymentId
    const printJob = await prisma.printJob.findFirst({
      where: { paymentId, kioskId: kiosk.id },
    });

    if (!printJob) {
      // Create the job record if it doesn't exist (kiosk reporting for first time)
      await prisma.printJob.create({
        data: {
          kioskId: kiosk.id,
          pageCount: pageCount || 1,
          colorMode: "MONOCHROME",
          totalAmount: 0,
          paymentId,
          status: status || "FAILED",
          failureReason: failureReason || null,
        },
      });
    } else {
      await prisma.printJob.update({
        where: { id: printJob.id },
        data: {
          status: status || "FAILED",
          failureReason: failureReason || null,
        },
      });
    }

    // If the print failed, trigger automatic refund and alert
    if (status === "FAILED" || status === "REFUNDED") {
      console.log(
        `[REFUND] Print job failed for kiosk "${kiosk.name}". PaymentID: ${paymentId}. Reason: ${failureReason}`
      );

      // --- Trigger Razorpay Refund Directly from Cloud ---
      try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
          throw new Error("Razorpay keys are not configured on cloud");
        }

        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const refund = await razorpay.payments.refund(paymentId, {});
        console.log(`[REFUND] Refund successful: ${refund.id}`);

        // Update the print job with the refund ID
        const jobToUpdate = printJob || await prisma.printJob.findFirst({ where: { paymentId, kioskId: kiosk.id } });
        if (jobToUpdate) {
          await prisma.printJob.update({
            where: { id: jobToUpdate.id },
            data: { status: "REFUNDED", refundId: refund.id },
          });
        }
      } catch (refundErr) {
        console.error(`[REFUND] Failed to process refund in-process:`, refundErr);
      }

      // --- WhatsApp Alert to Franchise Owner ---
      const owner = await prisma.user.findUnique({ where: { id: kiosk.ownerId } });
      if (owner?.phone) {
        // TODO: Replace with actual WhatsApp Business API call (Twilio/Meta)
        // For now, log the alert that would be sent
        const alertMessage = `🚨 AEROPRINT ALERT\n\nKiosk: ${kiosk.name}\nLocation: ${kiosk.location || "Unknown"}\nError: ${failureReason?.replace(/_/g, " ")}\n\nA customer's payment has been automatically refunded. Please check the printer and resolve the issue.`;
        
        console.log(`[WHATSAPP] Would send to ${owner.phone}:\n${alertMessage}`);

        // When you have the WhatsApp API configured, uncomment:
        // await sendWhatsAppMessage(owner.phone, alertMessage);
      }

      // Update kiosk error status
      if (failureReason) {
        await prisma.kiosk.update({
          where: { id: kiosk.id },
          data: {
            currentError: failureReason,
            status: "ERROR",
          },
        });
      }
    }

    // If print succeeded, increment paper count
    if (status === "COMPLETED" && pageCount) {
      await prisma.kiosk.update({
        where: { id: kiosk.id },
        data: {
          paperCount: { increment: pageCount },
          currentError: null,
          status: "ONLINE",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Print result error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
