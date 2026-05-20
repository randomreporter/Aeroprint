"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Printer,
  Activity,
  DollarSign,
  AlertTriangle,
  FileText,
  LogOut,
  MonitorSmartphone,
  Wifi,
  WifiOff,
  CircleDot,
  Layers,
  Sun,
  Moon,
  Settings,
  Users,
  Plus,
  Trash2,
  Key,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface Stats {
  totalKiosks: number;
  onlineKiosks: number;
  errorKiosks: number;
  offlineKiosks: number;
  totalPrints: number;
  todayPrints: number;
  totalRevenue: number;
  todayRevenue: number;
  failedJobs: number;
  totalPaperCount: number;
}

interface KioskData {
  id: string;
  name: string;
  location: string | null;
  status: string;
  pricingModel: string;
  revenueShare: number;
  flatFee: number;
  paperCount: number;
  currentError: string | null;
  softwareVersion: string | null;
  lastHeartbeat: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface PrintJobData {
  id: string;
  kioskName: string;
  pageCount: number;
  colorMode: string;
  totalAmount: number;
  paymentId: string | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

interface ChartData {
  date: string;
  revenue: number;
  prints: number;
}

interface UserProfile {
  name: string | null;
  phone: string | null;
  bankAccountId: string | null;
  email: string;
}

interface DashboardData {
  role: string;
  userProfile: UserProfile;
  stats: Stats;
  kiosks: KioskData[];
  revenueByDay: ChartData[];
  recentJobs: PrintJobData[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const router = useRouter();

  // Settings form states
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileBankId, setProfileBankId] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Franchise administration states (Super Admin)
  const [franchisees, setFranchisees] = useState<any[]>([]);
  const [franchiseEmail, setFranchiseEmail] = useState("");
  const [franchisePassword, setFranchisePassword] = useState("");
  const [franchiseName, setFranchiseName] = useState("");
  const [franchisePhone, setFranchisePhone] = useState("");
  const [franchiseError, setFranchiseError] = useState("");
  const [franchiseSuccess, setFranchiseSuccess] = useState("");
  const [creatingFranchise, setCreatingFranchise] = useState(false);

  // Kiosk pricing edit states (Super Admin)
  const [selectedPricingKiosk, setSelectedPricingKiosk] = useState<KioskData | null>(null);
  const [editPricingModel, setEditPricingModel] = useState("REVENUE_SHARE");
  const [editRevenueShare, setEditRevenueShare] = useState(30);
  const [editFlatFee, setEditFlatFee] = useState(0);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingStatus, setPricingStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Kiosk registration states (Franchisee)
  const [showAddKiosk, setShowAddKiosk] = useState(false);
  const [newKioskName, setNewKioskName] = useState("");
  const [newKioskLocation, setNewKioskLocation] = useState("");
  const [generatedKioskKey, setGeneratedKioskKey] = useState("");
  const [registeringKiosk, setRegisteringKiosk] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const fetchFranchisees = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/franchises");
      const json = await res.json();
      if (res.ok && json.success) {
        setFranchisees(json.franchisees);
      }
    } catch (err) {
      console.error("Failed to fetch franchisees:", err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "franchises" && data?.role === "SUPER_ADMIN") {
      fetchFranchisees();
    }
  }, [activeTab, data, fetchFranchisees]);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("aeroprint_theme") as "dark" | "light" | null;
    const initial = saved || "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aeroprint_theme", next);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const json = await res.json();
      setData(json);

      // Pre-fill profile states only once on initial load
      if (json.userProfile && !profileLoaded) {
        setProfileName(json.userProfile.name || "");
        setProfilePhone(json.userProfile.phone || "");
        setProfileBankId(json.userProfile.bankAccountId || "");
        setProfileLoaded(true);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [router, profileLoaded]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          phone: profilePhone,
          bankAccountId: profileBankId,
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setSaveStatus({ success: true });
        // Update user profile in local data state
        if (data) {
          setData({
            ...data,
            userProfile: {
              ...data.userProfile,
              name: profileName,
              phone: profilePhone,
              bankAccountId: profileBankId,
            }
          });
        }
      } else {
        setSaveStatus({ error: result.error || "Failed to save settings." });
      }
    } catch (err: any) {
      setSaveStatus({ error: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFranchise(true);
    setFranchiseError("");
    setFranchiseSuccess("");
    try {
      const res = await fetch("/api/admin/franchises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: franchiseEmail,
          password: franchisePassword,
          name: franchiseName,
          phone: franchisePhone,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setFranchiseSuccess("Franchisee account created successfully.");
        setFranchiseEmail("");
        setFranchisePassword("");
        setFranchiseName("");
        setFranchisePhone("");
        fetchFranchisees();
      } else {
        setFranchiseError(result.error || "Failed to create franchisee.");
      }
    } catch (err: any) {
      setFranchiseError(err.message || "Failed to create franchisee.");
    } finally {
      setCreatingFranchise(false);
    }
  };

  const handleDeleteFranchise = async (id: string) => {
    if (!confirm("Are you sure you want to delete this franchisee? This will also delete all their kiosks and print jobs!")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/franchises?id=${id}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (res.ok && result.success) {
        fetchFranchisees();
        fetchData(); // Refresh main kiosk stats
      } else {
        alert(result.error || "Failed to delete franchisee.");
      }
    } catch (err: any) {
      alert("Error deleting franchisee: " + err.message);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPricingKiosk) return;
    setSavingPricing(true);
    setPricingStatus(null);
    try {
      const res = await fetch("/api/admin/kiosk/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kioskId: selectedPricingKiosk.id,
          pricingModel: editPricingModel,
          revenueShare: editPricingModel === "REVENUE_SHARE" ? Number(editRevenueShare) : 0,
          flatFee: editPricingModel === "FLAT_FEE" ? Number(editFlatFee) : 0,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setPricingStatus({ success: true });
        setSelectedPricingKiosk(null);
        fetchData(); // Refresh dashboard data to display new pricing model
      } else {
        setPricingStatus({ error: result.error || "Failed to save pricing." });
      }
    } catch (err: any) {
      setPricingStatus({ error: err.message || "Failed to save pricing." });
    } finally {
      setSavingPricing(false);
    }
  };

  const handleRegisterKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisteringKiosk(true);
    setRegisterError("");
    setGeneratedKioskKey("");
    try {
      const res = await fetch("/api/kiosk/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKioskName,
          location: newKioskLocation,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setGeneratedKioskKey(result.kiosk.kioskKey);
        setNewKioskName("");
        setNewKioskLocation("");
        fetchData(); // Refresh the list of kiosks
      } else {
        setRegisterError(result.error || "Failed to register kiosk.");
      }
    } catch (err: any) {
      setRegisterError(err.message || "Failed to register kiosk.");
    } finally {
      setRegisteringKiosk(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-container">
        <p style={{ color: "var(--text-secondary)" }}>Failed to load dashboard data.</p>
      </div>
    );
  }

  const { stats, kiosks, revenueByDay, recentJobs, role } = data;
  const isSuperAdmin = role === "SUPER_ADMIN";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>Aeroprint</h2>
          <span className={`role-badge ${isSuperAdmin ? "super-admin" : "franchisee"}`}>
            {isSuperAdmin ? "Super Admin" : "Franchise Owner"}
          </span>
        </div>

        <nav className="sidebar-nav">
          <div
            className={`sidebar-nav-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <BarChart3 size={18} />
            Overview
          </div>
          <div
            className={`sidebar-nav-item ${activeTab === "kiosks" ? "active" : ""}`}
            onClick={() => setActiveTab("kiosks")}
          >
            <MonitorSmartphone size={18} />
            Kiosks
          </div>
          <div
            className={`sidebar-nav-item ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
          >
            <FileText size={18} />
            Print Jobs
          </div>
          <div
            className={`sidebar-nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={18} />
            Settings
          </div>
          {isSuperAdmin && (
            <div
              className={`sidebar-nav-item ${activeTab === "franchises" ? "active" : ""}`}
              onClick={() => setActiveTab("franchises")}
            >
              <Users size={18} />
              Franchises
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            <span className="theme-icon">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "overview" && (
          <>
            <div className="page-header">
              <h1>Dashboard Overview</h1>
              <p>
                {isSuperAdmin
                  ? "Monitoring all Aeroprint kiosks globally"
                  : "Your franchise performance at a glance"}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card blue">
                <div className="stat-card-icon">
                  <MonitorSmartphone size={22} />
                </div>
                <div className="stat-card-value">{stats.totalKiosks}</div>
                <div className="stat-card-label">Total Kiosks</div>
                <div className="stat-card-sub">
                  <span style={{ color: "var(--status-online)" }}>{stats.onlineKiosks} online</span>
                  {stats.errorKiosks > 0 && (
                    <span style={{ color: "var(--status-error)", marginLeft: 8 }}>
                      {stats.errorKiosks} error
                    </span>
                  )}
                </div>
              </div>

              <div className="stat-card green">
                <div className="stat-card-icon">
                  <Printer size={22} />
                </div>
                <div className="stat-card-value">{stats.todayPrints}</div>
                <div className="stat-card-label">Prints Today</div>
                <div className="stat-card-sub">{stats.totalPrints} total lifetime</div>
              </div>

              <div className="stat-card purple">
                <div className="stat-card-icon">
                  <DollarSign size={22} />
                </div>
                <div className="stat-card-value">{formatCurrency(stats.todayRevenue)}</div>
                <div className="stat-card-label">Revenue Today</div>
                <div className="stat-card-sub">{formatCurrency(stats.totalRevenue)} total</div>
              </div>

              <div className="stat-card cyan">
                <div className="stat-card-icon">
                  <Layers size={22} />
                </div>
                <div className="stat-card-value">{stats.totalPaperCount.toLocaleString()}</div>
                <div className="stat-card-label">Pages Printed</div>
                <div className="stat-card-sub">Lifetime paper count</div>
              </div>

              <div className="stat-card amber">
                <div className="stat-card-icon">
                  <Activity size={22} />
                </div>
                <div className="stat-card-value">{stats.onlineKiosks}</div>
                <div className="stat-card-label">Online Now</div>
                <div className="stat-card-sub">{stats.offlineKiosks} offline</div>
              </div>

              <div className="stat-card red">
                <div className="stat-card-icon">
                  <AlertTriangle size={22} />
                </div>
                <div className="stat-card-value">{stats.failedJobs}</div>
                <div className="stat-card-label">Failed / Refunded</div>
                <div className="stat-card-sub">Auto-refund triggered</div>
              </div>
            </div>

            {/* Financial Splits Row */}
            <div className="content-grid" style={{ gridTemplateColumns: isSuperAdmin ? "1fr 1fr" : "1.5fr 1fr", gap: 20, marginBottom: 20 }}>
              {isSuperAdmin ? (
                <>
                  <div className="panel" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(236,72,153,0.05))", border: "1px solid rgba(139,92,246,0.2)" }}>
                    <div className="panel-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 24 }}>
                      <div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Brand Rev-Share Volume (30%)</span>
                        <h2 style={{ fontSize: "2rem", marginTop: 8, color: "#a78bfa" }}>{formatCurrency(stats.brandRevShareCut)}</h2>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 4 }}>Earned from completed revenue share prints</span>
                      </div>
                      <DollarSign size={40} style={{ color: "rgba(139,92,246,0.3)" }} />
                    </div>
                  </div>

                  <div className="panel" style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.1), rgba(236,72,153,0.05))", border: "1px solid rgba(14,165,233,0.2)" }}>
                    <div className="panel-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 24 }}>
                      <div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Monthly Flat-Fee Billings</span>
                        <h2 style={{ fontSize: "2rem", marginTop: 8, color: "#38bdf8" }}>{formatCurrency(stats.brandFlatFeeExpected)} / mo</h2>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 4 }}>Total expected subscription collection across active flat fee kiosks</span>
                      </div>
                      <Layers size={40} style={{ color: "rgba(14,165,233,0.3)" }} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="panel" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(56,189,248,0.05))", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <div className="panel-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 24 }}>
                      <div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Your Net Print Earnings</span>
                        <h2 style={{ fontSize: "2rem", marginTop: 8, color: "#4ade80" }}>{formatCurrency(stats.franchiseeNetEarnings)}</h2>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 4 }}>100% flat fee prints + 70% revenue share prints (Razorpay routed)</span>
                      </div>
                      <DollarSign size={40} style={{ color: "rgba(34,197,94,0.3)" }} />
                    </div>
                  </div>

                  <div className="panel" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.05))", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <div className="panel-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 24 }}>
                      <div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Monthly Flat-Fees Owed</span>
                        <h2 style={{ fontSize: "2rem", marginTop: 8, color: "#f87171" }}>{formatCurrency(stats.franchiseeOwedFlatFee)} / mo</h2>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 4 }}>Owed to brand for active flat fee kiosks</span>
                      </div>
                      <AlertTriangle size={40} style={{ color: "rgba(239,68,68,0.3)" }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Charts Row */}
            <div className="content-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Revenue (Last 7 Days)</h3>
                </div>
                <div className="panel-body">
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "rgba(148,163,184,0.1)" : "rgba(15,23,42,0.06)"} />
                        <XAxis dataKey="date" stroke={theme === "dark" ? "#64748b" : "#94a3b8"} fontSize={12} />
                        <YAxis stroke={theme === "dark" ? "#64748b" : "#94a3b8"} fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            background: theme === "dark" ? "#1e293b" : "#ffffff",
                            border: `1px solid ${theme === "dark" ? "rgba(148,163,184,0.15)" : "rgba(15,23,42,0.1)"}`,
                            borderRadius: 10,
                            color: theme === "dark" ? "#f1f5f9" : "#0f172a",
                            fontSize: "0.85rem",
                          }}
                          formatter={(value: number) => [
                            `₹${value}`,
                            "Revenue",
                          ]}
                        />
                        <Bar
                          dataKey="revenue"
                          fill="url(#barGradient)"
                          radius={[6, 6, 0, 0]}
                        />
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0ea5e9" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Prints (Last 7 Days)</h3>
                </div>
                <div className="panel-body">
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "rgba(148,163,184,0.1)" : "rgba(15,23,42,0.06)"} />
                        <XAxis dataKey="date" stroke={theme === "dark" ? "#64748b" : "#94a3b8"} fontSize={12} />
                        <YAxis stroke={theme === "dark" ? "#64748b" : "#94a3b8"} fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            background: theme === "dark" ? "#1e293b" : "#ffffff",
                            border: `1px solid ${theme === "dark" ? "rgba(148,163,184,0.15)" : "rgba(15,23,42,0.1)"}`,
                            borderRadius: 10,
                            color: theme === "dark" ? "#f1f5f9" : "#0f172a",
                            fontSize: "0.85rem",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="prints"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#22c55e" }}
                          activeDot={{ r: 6, fill: "#4ade80" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Kiosks Quick View */}
            <div className="content-grid full">
              <div className="panel">
                <div className="panel-header">
                  <h3>Kiosk Fleet Status</h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Auto-refreshes every 30s
                  </span>
                </div>
                <div className="panel-body">
                  <div className="kiosk-list">
                    {kiosks.map((kiosk) => (
                      <div key={kiosk.id} className="kiosk-item">
                        <div className={`kiosk-status-dot ${kiosk.status}`} />
                        <div className="kiosk-info">
                          <div className="kiosk-name">{kiosk.name}</div>
                          <div className="kiosk-location">
                            {kiosk.location || "No location set"}
                            {isSuperAdmin && kiosk.ownerName && (
                              <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
                                • {kiosk.ownerName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="kiosk-meta">
                          <div className="kiosk-meta-item">
                            <div className="meta-value">{kiosk.paperCount}</div>
                            <div className="meta-label">Pages</div>
                          </div>
                          <div className="kiosk-meta-item">
                            <div className="meta-value">{timeAgo(kiosk.lastHeartbeat)}</div>
                            <div className="meta-label">Last Ping</div>
                          </div>
                          <span
                            className={`pricing-badge ${
                              kiosk.pricingModel === "REVENUE_SHARE" ? "revenue-share" : "flat-fee"
                            }`}
                          >
                            {kiosk.pricingModel === "REVENUE_SHARE"
                              ? `${100 - kiosk.revenueShare}/${kiosk.revenueShare}`
                              : `₹${kiosk.flatFee}/mo`}
                          </span>
                          {kiosk.softwareVersion && (
                            <span className="kiosk-version-badge">v{kiosk.softwareVersion}</span>
                          )}
                          {kiosk.currentError && (
                            <span className="kiosk-error-badge">{kiosk.currentError.replace("_", " ")}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {kiosks.length === 0 && (
                      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
                        No kiosks registered yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "kiosks" && (
          <>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <h1>Kiosk Management</h1>
                <p>{isSuperAdmin ? "All registered kiosks across all franchisees" : "Your kiosks"}</p>
              </div>
              {!isSuperAdmin && (
                <button
                  onClick={() => {
                    setShowAddKiosk(true);
                    setGeneratedKioskKey("");
                    setRegisterError("");
                  }}
                  className="btn"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
                    border: "none",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={16} /> Register Kiosk
                </button>
              )}
            </div>

            {/* Register Kiosk Modal (Franchisee) */}
            {showAddKiosk && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                padding: 16,
              }}>
                <div className="panel" style={{ width: "100%", maxWidth: 500, margin: 0 }}>
                  <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3>Register New Kiosk</h3>
                    <button onClick={() => setShowAddKiosk(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.2rem", cursor: "pointer" }}>×</button>
                  </div>
                  <div className="panel-body">
                    {generatedKioskKey ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ padding: 12, borderRadius: 8, background: "rgba(34,197,94,0.1)", color: "#4ade80", fontSize: "0.85rem", border: "1px solid rgba(34,197,94,0.2)" }}>
                          ✓ Kiosk registered successfully!
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Kiosk API Key
                          </label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              type="text"
                              readOnly
                              value={generatedKioskKey}
                              style={{
                                flex: 1,
                                padding: "12px 16px",
                                borderRadius: 10,
                                background: "var(--panel-bg-dark)",
                                border: "1px solid var(--border-color)",
                                color: "var(--text-primary)",
                                outline: "none",
                                fontSize: "0.85rem",
                              }}
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(generatedKioskKey);
                                alert("Copied to clipboard!");
                              }}
                              className="btn"
                              style={{ padding: "12px 16px", borderRadius: 10, fontSize: "0.85rem" }}
                            >
                              Copy
                            </button>
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--status-error)" }}>
                            ⚠️ Copy this key now. It will not be shown again for security.
                          </span>
                        </div>
                        <button
                          onClick={() => setShowAddKiosk(false)}
                          className="btn"
                          style={{ padding: 12, borderRadius: 10, marginTop: 10 }}
                        >
                          Close
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleRegisterKiosk} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Kiosk Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Central Library Ground Floor"
                            value={newKioskName}
                            onChange={(e) => setNewKioskName(e.target.value)}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                              outline: "none",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Location
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Block A, Section 2"
                            value={newKioskLocation}
                            onChange={(e) => setNewKioskLocation(e.target.value)}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                              outline: "none",
                            }}
                          />
                        </div>

                        {registerError && (
                          <div style={{ padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: "0.85rem", border: "1px solid rgba(239,68,68,0.2)" }}>
                            ❌ {registerError}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => setShowAddKiosk(false)}
                            style={{ flex: 1, padding: 12, borderRadius: 10, background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-secondary)", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={registeringKiosk}
                            className="btn"
                            style={{ flex: 1, padding: 12, borderRadius: 10, background: "linear-gradient(135deg, #0ea5e9, #8b5cf6)", border: "none", color: "white", cursor: "pointer", fontWeight: 600 }}
                          >
                            {registeringKiosk ? "Registering..." : "Register Kiosk"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Edit Pricing Modal (Super Admin) */}
            {selectedPricingKiosk && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                padding: 16,
              }}>
                <div className="panel" style={{ width: "100%", maxWidth: 500, margin: 0 }}>
                  <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3>Edit Billing Pricing: {selectedPricingKiosk.name}</h3>
                    <button onClick={() => setSelectedPricingKiosk(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.2rem", cursor: "pointer" }}>×</button>
                  </div>
                  <div className="panel-body">
                    <form onSubmit={handleSavePricing} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          Pricing Model
                        </label>
                        <select
                          value={editPricingModel}
                          onChange={(e) => setEditPricingModel(e.target.value)}
                          style={{
                            padding: "12px 16px",
                            borderRadius: 10,
                            background: "var(--panel-bg-dark)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                            outline: "none",
                          }}
                        >
                          <option value="REVENUE_SHARE">Revenue Share Split</option>
                          <option value="FLAT_FEE">Monthly Flat Fee</option>
                        </select>
                      </div>

                      {editPricingModel === "REVENUE_SHARE" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Brand Share Percentage (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            required
                            value={editRevenueShare}
                            onChange={(e) => setEditRevenueShare(Number(e.target.value))}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                              outline: "none",
                            }}
                          />
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Franchisee keeps {100 - editRevenueShare}%, brand gets {editRevenueShare}%.
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Monthly Subscription Fee (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            required
                            value={editFlatFee}
                            onChange={(e) => setEditFlatFee(Number(e.target.value))}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                              outline: "none",
                            }}
                          />
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Franchisee pays flat rate and keeps 100% of printing revenue.
                          </span>
                        </div>
                      )}

                      {pricingStatus?.error && (
                        <div style={{ padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: "0.85rem", border: "1px solid rgba(239,68,68,0.2)" }}>
                          ❌ {pricingStatus.error}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedPricingKiosk(null)}
                          style={{ flex: 1, padding: 12, borderRadius: 10, background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-secondary)", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingPricing}
                          className="btn"
                          style={{ flex: 1, padding: 12, borderRadius: 10, background: "linear-gradient(135deg, #0ea5e9, #8b5cf6)", border: "none", color: "white", cursor: "pointer", fontWeight: 600 }}
                        >
                          {savingPricing ? "Saving..." : "Save Pricing"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            <div className="content-grid full">
              <div className="panel">
                <div className="panel-body">
                  <div className="kiosk-list">
                    {kiosks.map((kiosk) => (
                      <div key={kiosk.id} className="kiosk-item">
                        <div className={`kiosk-status-dot ${kiosk.status}`} />
                        <div className="kiosk-info">
                          <div className="kiosk-name">
                            {kiosk.status === "ONLINE" && <Wifi size={14} style={{ marginRight: 6, color: "var(--status-online)" }} />}
                            {kiosk.status === "OFFLINE" && <WifiOff size={14} style={{ marginRight: 6, color: "var(--status-offline)" }} />}
                            {kiosk.status === "PRINTING" && <CircleDot size={14} style={{ marginRight: 6, color: "var(--status-printing)" }} />}
                            {kiosk.status === "ERROR" && <AlertTriangle size={14} style={{ marginRight: 6, color: "var(--status-error)" }} />}
                            {kiosk.name}
                          </div>
                          <div className="kiosk-location">
                            {kiosk.location || "No location"} • Last seen: {timeAgo(kiosk.lastHeartbeat)}
                            {isSuperAdmin && (
                              <span style={{ marginLeft: 8, color: "var(--brand-primary-light)" }}>
                                Owner: {kiosk.ownerName} ({kiosk.ownerEmail})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="kiosk-meta" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div className="kiosk-meta-item">
                            <div className="meta-value">{kiosk.paperCount.toLocaleString()}</div>
                            <div className="meta-label">Total Pages</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <span
                              className={`pricing-badge ${
                                kiosk.pricingModel === "REVENUE_SHARE" ? "revenue-share" : "flat-fee"
                              }`}
                            >
                              {kiosk.pricingModel === "REVENUE_SHARE"
                                ? `Revenue ${100 - kiosk.revenueShare}/${kiosk.revenueShare}`
                                : `Flat ₹${kiosk.flatFee}/mo`}
                            </span>
                            {isSuperAdmin && (
                              <button
                                onClick={() => {
                                  setSelectedPricingKiosk(kiosk);
                                  setEditPricingModel(kiosk.pricingModel);
                                  setEditRevenueShare(kiosk.revenueShare);
                                  setEditFlatFee(kiosk.flatFee);
                                  setPricingStatus(null);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--brand-primary)",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                  padding: 0,
                                  fontWeight: 600,
                                  textDecoration: "underline",
                                }}
                              >
                                Edit Pricing
                              </button>
                            )}
                          </div>
                          {kiosk.softwareVersion && (
                            <span className="kiosk-version-badge">v{kiosk.softwareVersion}</span>
                          )}
                          {kiosk.currentError && (
                            <span className="kiosk-error-badge">
                              ⚠ {kiosk.currentError.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {kiosks.length === 0 && (
                      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
                        No kiosks registered.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "jobs" && (
          <>
            <div className="page-header">
              <h1>Print Jobs</h1>
              <p>Recent print transactions and payment details</p>
            </div>
            <div className="content-grid full">
              <div className="panel">
                <div className="panel-body" style={{ overflowX: "auto" }}>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Kiosk</th>
                        <th>Pages</th>
                        <th>Mode</th>
                        <th>Amount</th>
                        <th>Payment ID</th>
                        <th>Status</th>
                        <th>Failure Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentJobs.map((job) => (
                        <tr key={job.id}>
                          <td>
                            {new Date(job.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            {new Date(job.createdAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            {job.kioskName}
                          </td>
                          <td>{job.pageCount}</td>
                          <td>{job.colorMode === "COLOR" ? "🟡 Color" : "⚫ B&W"}</td>
                          <td className="amount-text">{formatCurrency(job.totalAmount)}</td>
                          <td className="payment-id-text">{job.paymentId || "—"}</td>
                          <td>
                            <span className={`job-status-badge ${job.status}`}>{job.status}</span>
                          </td>
                          <td>
                            {job.failureReason ? (
                              <span className="kiosk-error-badge">
                                {job.failureReason.replace(/_/g, " ")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                      {recentJobs.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                            No print jobs recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "franchises" && isSuperAdmin && (
          <>
            <div className="page-header">
              <h1>Franchise Management</h1>
              <p>Add, edit, and remove franchisee accounts</p>
            </div>

            <div className="content-grid" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "flex-start" }}>
              {/* Franchisees List */}
              <div className="panel">
                <div className="panel-header">
                  <h3>Active Franchisees</h3>
                </div>
                <div className="panel-body" style={{ overflowX: "auto" }}>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Kiosks</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {franchisees.map((fran) => (
                        <tr key={fran.id}>
                          <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fran.name || "—"}</td>
                          <td>{fran.email}</td>
                          <td>{fran.phone || "—"}</td>
                          <td>
                            <span className="pricing-badge flat-fee">
                              {fran._count?.kiosks || 0}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {new Date(fran.createdAt).toLocaleDateString("en-IN")}
                          </td>
                          <td>
                            <button
                              onClick={() => handleDeleteFranchise(fran.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#f87171",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: 0,
                                fontSize: "0.8rem",
                              }}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {franchisees.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                            No franchisees registered yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Create Franchisee Form */}
              <div className="panel">
                <div className="panel-header">
                  <h3>Create Franchisee</h3>
                </div>
                <div className="panel-body">
                  <form onSubmit={handleCreateFranchise} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={franchiseName}
                        onChange={(e) => setFranchiseName(e.target.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="john@franchise.com"
                        value={franchiseEmail}
                        onChange={(e) => setFranchiseEmail(e.target.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="Min 6 characters"
                        value={franchisePassword}
                        onChange={(e) => setFranchisePassword(e.target.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Phone Number
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="+919999999999"
                        value={franchisePhone}
                        onChange={(e) => setFranchisePhone(e.target.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    {franchiseSuccess && (
                      <div style={{ padding: 10, borderRadius: 6, background: "rgba(34,197,94,0.1)", color: "#4ade80", fontSize: "0.8rem", border: "1px solid rgba(34,197,94,0.2)" }}>
                        ✓ {franchiseSuccess}
                      </div>
                    )}

                    {franchiseError && (
                      <div style={{ padding: 10, borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: "0.8rem", border: "1px solid rgba(239,68,68,0.2)" }}>
                        ❌ {franchiseError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={creatingFranchise}
                      className="btn"
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
                        border: "none",
                        color: "white",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {creatingFranchise ? "Creating Account..." : "Create Franchisee"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "settings" && (
          <>
            <div className="page-header">
              <h1>Account Settings</h1>
              <p>Manage your profile and payment credentials</p>
            </div>
            
            <div className="content-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="panel" style={{ maxWidth: 600 }}>
                <div className="panel-header">
                  <h3>Profile & Settings</h3>
                </div>
                <div className="panel-body">
                  <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Email Address
                      </label>
                      <input
                        type="text"
                        value={data.userProfile.email}
                        disabled
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: "var(--panel-bg-dark)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-muted)",
                          cursor: "not-allowed",
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Your email address cannot be changed.
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="John Doe"
                        required
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="+919999999999"
                        required
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Used for sending automated printer failure alerts.
                      </span>
                    </div>

                    {!isSuperAdmin && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          Razorpay Linked Account ID
                        </label>
                        <input
                          type="text"
                          value={profileBankId}
                          onChange={(e) => setProfileBankId(e.target.value)}
                          placeholder="e.g. acc_G34nK82nFjs9"
                          style={{
                            padding: "12px 16px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                            outline: "none",
                          }}
                        />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Funds from prints on your kiosks are routed to this account.
                        </span>
                      </div>
                    )}

                    {saveStatus?.success && (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: "rgba(34,197,94,0.1)",
                          color: "#4ade80",
                          fontSize: "0.85rem",
                          border: "1px solid rgba(34,197,94,0.2)",
                        }}
                      >
                        ✓ Settings saved successfully.
                      </div>
                    )}

                    {saveStatus?.error && (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: "rgba(239,68,68,0.1)",
                          color: "#f87171",
                          fontSize: "0.85rem",
                          border: "1px solid rgba(239,68,68,0.2)",
                        }}
                      >
                        ❌ Error: {saveStatus.error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={saving}
                      className="btn"
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
                        border: "none",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        marginTop: 10,
                      }}
                    >
                      {saving ? "Saving Changes..." : "Save Settings"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
