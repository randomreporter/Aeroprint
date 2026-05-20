import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/dashboard/stats — Returns aggregated data for the dashboard
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";

    // Build kiosk query based on role
    const kioskWhere = isSuperAdmin ? {} : { ownerId: user.userId };

    const kiosks = await prisma.kiosk.findMany({
      where: kioskWhere,
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        printJobs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate aggregated stats
    const allJobs = kiosks.flatMap((k) => k.printJobs);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayJobs = allJobs.filter((j) => new Date(j.createdAt) >= today);

    const totalRevenue = allJobs
      .filter((j) => j.status === "COMPLETED")
      .reduce((sum, j) => sum + j.totalAmount, 0);

    const todayRevenue = todayJobs
      .filter((j) => j.status === "COMPLETED")
      .reduce((sum, j) => sum + j.totalAmount, 0);

    const totalPrints = allJobs.filter((j) => j.status === "COMPLETED").length;
    const todayPrints = todayJobs.filter((j) => j.status === "COMPLETED").length;
    const failedJobs = allJobs.filter((j) => j.status === "FAILED" || j.status === "REFUNDED").length;

    const totalPaperCount = kiosks.reduce((sum, k) => sum + k.paperCount, 0);

    const onlineKiosks = kiosks.filter((k) => k.status === "ONLINE" || k.status === "PRINTING").length;
    const errorKiosks = kiosks.filter((k) => k.status === "ERROR").length;
    const offlineKiosks = kiosks.filter((k) => k.status === "OFFLINE").length;

    // Revenue by day (last 7 days)
    const revenueByDay: { date: string; revenue: number; prints: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);

      const dayJobs = allJobs.filter((j) => {
        const c = new Date(j.createdAt);
        return c >= d && c < nextD && j.status === "COMPLETED";
      });

      revenueByDay.push({
        date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
        revenue: dayJobs.reduce((sum, j) => sum + j.totalAmount, 0),
        prints: dayJobs.length,
      });
    }

    // Recent print jobs (last 20)
    const recentJobs = allJobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map((j) => {
        const kiosk = kiosks.find((k) => k.id === j.kioskId);
        return {
          id: j.id,
          kioskName: kiosk?.name || "Unknown",
          pageCount: j.pageCount,
          colorMode: j.colorMode,
          totalAmount: j.totalAmount,
          paymentId: j.paymentId,
          status: j.status,
          failureReason: j.failureReason,
          createdAt: j.createdAt,
        };
      });

    // Calculate brand/franchise shares
    let brandFlatFeeExpected = 0;
    let brandRevShareCut = 0;
    let franchiseeNetEarnings = 0;
    let franchiseeOwedFlatFee = 0;

    kiosks.forEach((k) => {
      if (k.pricingModel === "FLAT_FEE") {
        brandFlatFeeExpected += k.flatFee;
        franchiseeOwedFlatFee += k.flatFee;
      }
      
      // Calculate earnings from print jobs for this kiosk
      k.printJobs.forEach((j) => {
        if (j.status === "COMPLETED") {
          if (k.pricingModel === "REVENUE_SHARE") {
            brandRevShareCut += j.totalAmount * (k.revenueShare / 100);
            franchiseeNetEarnings += j.totalAmount * ((100 - k.revenueShare) / 100);
          } else {
            franchiseeNetEarnings += j.totalAmount;
          }
        }
      });
    });

    // Fetch logged in user's profile details
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true, phone: true, bankAccountId: true, email: true },
    });

    return NextResponse.json({
      role: user.role,
      userProfile: dbUser,
      stats: {
        totalKiosks: kiosks.length,
        onlineKiosks,
        errorKiosks,
        offlineKiosks,
        totalPrints,
        todayPrints,
        totalRevenue,
        todayRevenue,
        failedJobs,
        totalPaperCount,
        brandFlatFeeExpected,
        brandRevShareCut,
        franchiseeNetEarnings,
        franchiseeOwedFlatFee,
      },
      kiosks: kiosks.map((k) => ({
        id: k.id,
        name: k.name,
        location: k.location,
        status: k.status,
        pricingModel: k.pricingModel,
        revenueShare: k.revenueShare,
        flatFee: k.flatFee,
        paperCount: k.paperCount,
        currentError: k.currentError,
        softwareVersion: k.softwareVersion,
        lastHeartbeat: k.lastHeartbeat,
        ownerName: k.owner.name,
        ownerEmail: k.owner.email,
      })),
      revenueByDay,
      recentJobs,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
