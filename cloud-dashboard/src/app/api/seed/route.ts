import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// POST /api/seed — Creates a Super Admin and demo franchisee with kiosks + print jobs.
// This should only be run once during initial setup.
export async function POST() {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Super Admin already exists. Seed aborted." },
        { status: 400 }
      );
    }

    const adminHash = await hashPassword("admin123");
    const franchiseeHash = await hashPassword("franchise123");

    const admin = await prisma.user.create({
      data: {
        email: "admin@aeroprint.in",
        passwordHash: adminHash,
        role: "SUPER_ADMIN",
        name: "Srinivas (Super Admin)",
        phone: "+919999999999",
      },
    });

    const franchisee = await prisma.user.create({
      data: {
        email: "owner@franchise.com",
        passwordHash: franchiseeHash,
        role: "FRANCHISEE",
        name: "Demo Franchise Owner",
        phone: "+918888888888",
        bankAccountId: "acc_demo_razorpay",
      },
    });

    // Create demo kiosks
    const kiosk1 = await prisma.kiosk.create({
      data: {
        kioskKey: "KIOSK-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        name: "Kiosk - MG Road",
        location: "MG Road, Bangalore",
        pricingModel: "REVENUE_SHARE",
        status: "ONLINE",
        paperCount: 342,
        softwareVersion: "2.0.0",
        lastHeartbeat: new Date(),
        ownerId: franchisee.id,
      },
    });

    const kiosk2 = await prisma.kiosk.create({
      data: {
        kioskKey: "KIOSK-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        name: "Kiosk - Indiranagar",
        location: "Indiranagar, Bangalore",
        pricingModel: "FLAT_FEE",
        status: "ERROR",
        paperCount: 128,
        currentError: "PAPER_JAM",
        softwareVersion: "2.0.0",
        lastHeartbeat: new Date(Date.now() - 1000 * 60 * 15), // 15 min ago
        ownerId: franchisee.id,
      },
    });

    const kiosk3 = await prisma.kiosk.create({
      data: {
        kioskKey: "KIOSK-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        name: "Kiosk - HSR Layout",
        location: "HSR Layout, Bangalore",
        pricingModel: "REVENUE_SHARE",
        status: "OFFLINE",
        paperCount: 0,
        softwareVersion: "1.9.0",
        lastHeartbeat: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
        ownerId: franchisee.id,
      },
    });

    // Create demo print jobs
    const now = new Date();
    const jobs = [];
    for (let i = 0; i < 25; i++) {
      const isColor = Math.random() > 0.5;
      const pages = Math.floor(Math.random() * 10) + 1;
      const amount = pages * (isColor ? 15 : 5);
      const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "FAILED", "REFUNDED"];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const kioskIds = [kiosk1.id, kiosk2.id, kiosk3.id];

      jobs.push(
        prisma.printJob.create({
          data: {
            kioskId: kioskIds[Math.floor(Math.random() * kioskIds.length)],
            pageCount: pages,
            colorMode: isColor ? "COLOR" : "MONOCHROME",
            totalAmount: amount,
            paymentId: "pay_demo_" + crypto.randomUUID().slice(0, 8),
            orderId: "order_demo_" + crypto.randomUUID().slice(0, 8),
            status,
            refundId: status === "REFUNDED" ? "rfnd_demo_" + crypto.randomUUID().slice(0, 8) : null,
            failureReason: status === "FAILED" ? "PAPER_JAM" : status === "REFUNDED" ? "OUT_OF_PAPER" : null,
            createdAt: new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 7), // within last 7 days
          },
        })
      );
    }
    await Promise.all(jobs);

    return NextResponse.json({
      success: true,
      message: "Seed complete!",
      accounts: {
        superAdmin: { email: admin.email, password: "admin123" },
        franchisee: { email: franchisee.email, password: "franchise123" },
      },
      kiosks: [kiosk1.name, kiosk2.name, kiosk3.name],
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "Seed failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
