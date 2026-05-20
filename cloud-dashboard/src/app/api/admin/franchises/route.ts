import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";

// GET /api/admin/franchises
// Lists all franchisees (Super Admin only).
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const franchisees = await prisma.user.findMany({
      where: { role: "FRANCHISEE" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        bankAccountId: true,
        createdAt: true,
        _count: { select: { kiosks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, franchisees });
  } catch (error: any) {
    console.error("Fetch franchisees error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/franchises
// Creates a new franchisee user (Super Admin only).
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, password, name, phone } = await req.json();

    if (!email || !password || !name || !phone) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const newFranchisee = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        phone,
        role: "FRANCHISEE",
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, franchisee: newFranchisee });
  } catch (error: any) {
    console.error("Create franchisee error:", error);
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}

// DELETE /api/admin/franchises
// Deletes a franchisee user (Super Admin only).
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Delete associated kiosks or print jobs first to maintain database integrity?
    // In our schema, kiosk might reference user as owner (ownerId).
    // Let's delete the franchisee's kiosks first.
    const kiosks = await prisma.kiosk.findMany({ where: { ownerId: id } });
    const kioskIds = kiosks.map((k: any) => k.id);

    // Delete print jobs of these kiosks first
    if (kioskIds.length > 0) {
      await prisma.printJob.deleteMany({
        where: { kioskId: { in: kioskIds } },
      });
      await prisma.kiosk.deleteMany({
        where: { ownerId: id },
      });
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete franchisee error:", error);
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}
