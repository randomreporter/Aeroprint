import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// POST /api/user/settings
// Updates user profile (name, phone, bankAccountId).
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, bankAccountId } = body;

    // Validate request
    if (name !== undefined && typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (phone !== undefined && typeof phone !== "string") {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    if (bankAccountId !== undefined && typeof bankAccountId !== "string") {
      return NextResponse.json({ error: "Invalid bankAccountId" }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    
    // Only Franchisees can update their Razorpay bankAccountId settings
    if (user.role === "FRANCHISEE" && bankAccountId !== undefined) {
      updateData.bankAccountId = bankAccountId.trim() || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.userId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phone: updatedUser.phone,
        role: updatedUser.role,
        bankAccountId: updatedUser.bankAccountId,
      },
    });
  } catch (error: any) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings: " + error.message },
      { status: 500 }
    );
  }
}
