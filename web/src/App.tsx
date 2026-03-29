import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACILITY_ADMIN_USERNAMES,
  api,
  EndSessionRes,
  LoginResponse,
  MeResponse,
  MemberPayResponse,
  PublicConfig,
  SlotPreview,
  UserType,
  fetchPublicConfig,
} from "./api";
import { estimateSessionCharge } from "./pricing";
import { AdminDashboard } from "./components/AdminDashboard";
import { CustomerSupport } from "./components/CustomerSupport";
import { MemberDashboard } from "./components/MemberDashboard";
import { OutdoorNavigationMap } from "./components/OutdoorNavigationMap";
import { OverviewInsights } from "./components/OverviewInsights";
import { ParkingHeroAnimation } from "./components/ParkingHeroAnimation";
import { PaymentClosure, PaymentClosureData } from "./components/PaymentClosure";
import { ThemeToggle } from "./components/ThemeToggle";

type Phase =
  | "landing"
  | "auth"
  | "admin_auth"
  | "admin_dashboard"
  | "slot"
  | "active"
  | "payment"
  | "member_payment"
  | "history"
  | "dashboard"
  | "overview";

function useElapsed(startIso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startIso]);
  return useMemo(() => {
    if (!startIso) return 0;
    const s = new Date(startIso).getTime();
    return Math.max(0, (now - s) / 60000);
  }, [startIso, now]);
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [userType, setUserType] = useState<UserType | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [videoPath, setVideoPath] = useState("easy.mp4");
  const [preview, setPreview] = useState<SlotPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [endResult, setEndResult] = useState<EndSessionRes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [regName, setRegName] = useState("");
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [historyRows, setHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [rechargeAmount, setRechargeAmount] = useState("500");
  const [paymentClosure, setPaymentClosure] = useState<PaymentClosureData | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  const elapsedMin = useElapsed(startedAt);
  const estCharge = useMemo(() => {
    if (!userType || !startedAt || !publicConfig) return 0;
    return estimateSessionCharge(
      startedAt,
      Date.now(),
      userType === "permanent",
      publicConfig.permanent_rate_per_hour,
      publicConfig.temporary_rate_per_hour,
      publicConfig.peak_multiplier ?? 1,
      publicConfig.peak_windows ?? [],
    );
  }, [elapsedMin, startedAt, userType, publicConfig]);

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const q = encodeURIComponent(videoPath);
      const data = await api<SlotPreview>(`/api/slot/preview?video_path=${q}`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [videoPath]);

  useEffect(() => {
    if (phase === "slot") loadPreview();
  }, [phase, loadPreview]);

  useEffect(() => {
    setError(null);
  }, [phase]);

  const refreshMe = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const me = await api<MeResponse>("/api/me");
      setUser(me);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [phase, token, refreshMe]);

  const reloadPublicConfig = useCallback(() => {
    void fetchPublicConfig()
      .then(setPublicConfig)
      .catch(() => setPublicConfig(null));
  }, []);

  useEffect(() => {
    reloadPublicConfig();
  }, [reloadPublicConfig]);

  const startMember = () => {
    setUserType("permanent");
    setPhase("auth");
  };

  const startVisitor = () => {
    setUserType("temporary");
    setPhase("slot");
  };

  const startAdmin = () => {
    setPhase("admin_auth");
  };

  const handleRegister = async () => {
    setError(null);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: regName,
          username: regUser,
          password: regPass,
        }),
      });
      setAuthTab("login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register failed");
    }
  };

  const handleLogin = async () => {
    setError(null);
    try {
      const res = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      localStorage.setItem("token", res.access_token);
      const me = await api<MeResponse>("/api/me");
      const role = me.role ?? res.user.role ?? "user";

      if (phase === "admin_auth") {
        if (role !== "admin" || !FACILITY_ADMIN_USERNAMES.has(me.username)) {
          localStorage.removeItem("token");
          setError("Sign in denied.");
          return;
        }
        setUser(me);
        reloadPublicConfig();
        setPhase("admin_dashboard");
        return;
      }

      if (role === "admin" && FACILITY_ADMIN_USERNAMES.has(me.username)) {
        localStorage.removeItem("token");
        setError("Use the Administrator option on the home page.");
        return;
      }

      setUser(me);
      reloadPublicConfig();
      setPhase("slot");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  };

  const handleConfirmSlot = async () => {
    if (!preview?.slot_id || !userType) return;
    setError(null);
    try {
      const res = await api<{ session_id: number; started_at: string; slot_id: string }>(
        "/api/sessions/start",
        {
          method: "POST",
          body: JSON.stringify({
            user_type: userType === "permanent" ? "permanent" : "temporary",
            slot_id: preview.slot_id,
          }),
        }
      );
      setSessionId(res.session_id);
      setStartedAt(res.started_at);
      setSlotId(res.slot_id);
      setPhase("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
    }
  };

  const handleEndSession = async () => {
    if (sessionId == null) return;
    setError(null);
    try {
      const res = await api<EndSessionRes>("/api/sessions/end", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      setEndResult(res);
      setSessionId(null);
      setStartedAt(null);
      setSlotId(null);
      if (res.requires_member_payment) {
        setPhase("member_payment");
        void refreshMe();
      } else if (res.requires_payment && res.qr_image) {
        setPhase("payment");
      } else {
        setPhase("slot");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "End session failed");
    }
  };

  const handlePayDone = async () => {
    if (!endResult) return;
    const snap = {
      amount: endResult.amount,
      duration_minutes: endResult.duration_minutes,
      session_id: endResult.session_id,
    };
    setError(null);
    try {
      await api(`/api/sessions/${snap.session_id}/pay`, { method: "POST" });
      setPaymentClosure({
        variant: "visitor",
        method: "upi",
        amount: snap.amount,
        durationMinutes: snap.duration_minutes,
      });
      setEndResult(null);
      setPhase("slot");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment update failed");
    }
  };

  const handleMemberPay = async (method: "pay_now" | "wallet" | "pay_later") => {
    if (!endResult?.session_id) return;
    const snap = {
      amount: endResult.amount,
      duration_minutes: endResult.duration_minutes,
      session_id: endResult.session_id,
    };
    setError(null);
    try {
      const res = await api<MemberPayResponse>(`/api/sessions/${snap.session_id}/member-pay`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      await refreshMe();
      setPaymentClosure({
        variant: "member",
        method,
        amount: snap.amount,
        durationMinutes: snap.duration_minutes,
        walletBalance: res.wallet_balance,
        payLaterDue: res.pay_later_due,
        payLaterCap: payCap,
      });
      setEndResult(null);
      setPhase("slot");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    }
  };

  const handleRecharge = async () => {
    const amt = parseFloat(rechargeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid recharge amount");
      return;
    }
    setError(null);
    try {
      await api("/api/wallet/recharge", {
        method: "POST",
        body: JSON.stringify({ amount: amt }),
      });
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recharge failed");
    }
  };

  const handleRepayPayLater = async () => {
    setError(null);
    try {
      await api("/api/wallet/repay-pay-later", { method: "POST" });
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply wallet to pay-later balance");
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    setError(null);
    try {
      const res = await api<{ sessions: Record<string, unknown>[] }>("/api/history");
      setHistoryRows(res.sessions);
      setPhase("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "History failed");
    }
  };

  const goHome = () => {
    setPhase("landing");
    setUserType(null);
    setEndResult(null);
    setPreview(null);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setPhase("landing");
    setUserType(null);
  };

  const isFacilityAdmin =
    !!user && user.role === "admin" && FACILITY_ADMIN_USERNAMES.has(user.username);

  const wallet = user?.wallet_balance ?? endResult?.wallet_balance ?? 0;
  const payLater = user?.pay_later_due ?? endResult?.pay_later_due ?? 0;
  const payCap = user?.pay_later_cap ?? endResult?.pay_later_cap ?? 2000;
  const sessionAmt = endResult?.amount ?? 0;
  const canWallet = wallet >= sessionAmt - 1e-6;
  const canPayLater = payLater + sessionAmt <= payCap + 1e-6;

  return (
    <div className="min-h-screen bg-slate-50 pb-16 font-sans text-slate-900 dark:bg-transparent dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={goHome}
            className="flex items-center gap-2 text-left font-semibold tracking-tight text-slate-900 transition hover:text-emerald-600 dark:text-white dark:hover:text-emerald-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-lg shadow-lg">
              P
            </span>
            <span>
              Smart Parking
              <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">Easier parking for everyone</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-800 dark:text-violet-200"
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => setPhase("overview")}
              className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-800 dark:text-cyan-200"
            >
              Insights
            </button>
            {user && isFacilityAdmin && (
              <button
                type="button"
                onClick={() => setPhase("admin_dashboard")}
                className="rounded-full border border-violet-500/40 bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-100"
              >
                Admin console
              </button>
            )}
            {user && !isFacilityAdmin && (
              <button
                type="button"
                onClick={() => setPhase("dashboard")}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-500/20 dark:text-emerald-200"
              >
                Dashboard
              </button>
            )}
            {user && !isFacilityAdmin && (
              <button
                type="button"
                onClick={loadHistory}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-emerald-400/50 dark:border-white/15 dark:text-slate-200 dark:hover:text-white"
              >
                My history
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={logout}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-10">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-2xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {phase === "landing" && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-8"
          >
            <ParkingHeroAnimation />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Smart parking</p>
            <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              Find a bay without the stress
            </h1>
            <p className="max-w-xl text-lg text-slate-400">
              A simple smart parking experience: see an available bay, park, and pay fairly. Members sign in for account
              billing; visitors pay when they leave. Pricing follows off-peak and peak hours so busy times cost a bit
              more.
            </p>
            <div className="grid gap-6 md:grid-cols-3">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startMember}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-800/60 p-8 text-left shadow-glass backdrop-blur-xl transition hover:border-emerald-400/30"
              >
                <span className="mb-3 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Member
                </span>
                <h2 className="mb-2 text-xl font-semibold text-white">Permanent member</h2>
                <p className="text-slate-400">
                  We suggest a free bay, you park, and your visit is charged to your account when you leave. Sign in
                  required.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 font-semibold text-emerald-400 group-hover:gap-3">
                  Start member session →
                </span>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startVisitor}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-800/60 p-8 text-left shadow-glass backdrop-blur-xl transition hover:border-orange-400/30"
              >
                <span className="mb-3 inline-block rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-orange-300">
                  Visitor
                </span>
                <h2 className="mb-2 text-xl font-semibold text-white">Temporary visitor</h2>
                <p className="text-slate-400">
                  Same quick bay suggestion. When you exit, pay with the QR code on screen and tap done when finished.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 font-semibold text-orange-400 group-hover:gap-3">
                  Start visitor session →
                </span>
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startAdmin}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-800/60 p-8 text-left shadow-glass backdrop-blur-xl transition hover:border-violet-400/30"
              >
                <span className="mb-3 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-300">
                  Admin
                </span>
                <h2 className="mb-2 text-xl font-semibold text-white">Administrator</h2>
                <p className="text-slate-400">
                  Manage pricing, peak hours, and view live facility stats — sign in only.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 font-semibold text-violet-400 group-hover:gap-3">
                  Admin sign-in →
                </span>
              </motion.button>
            </div>
          </motion.section>
        )}

        {phase === "admin_auth" && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-md rounded-3xl border border-violet-500/30 bg-slate-900/70 p-8 shadow-glass backdrop-blur-xl"
          >
            <h2 className="mb-8 text-2xl font-bold text-white">Sign in</h2>
            <div className="space-y-4">
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
              />
              <input
                type="password"
                className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void handleLogin()}
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 py-3 font-semibold text-white shadow-lg transition hover:brightness-110"
              >
                Sign in
              </button>
            </div>
            <button type="button" onClick={goHome} className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-300">
              ← Back
            </button>
          </motion.section>
        )}

        {phase === "auth" && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-glass backdrop-blur-xl"
          >
            <h2 className="mb-6 text-2xl font-bold text-white">Member access</h2>
            <div className="mb-6 flex rounded-full bg-slate-800/80 p-1">
              <button
                type="button"
                onClick={() => setAuthTab("login")}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                  authTab === "login" ? "bg-emerald-500 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("register")}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                  authTab === "register" ? "bg-emerald-500 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Sign up
              </button>
            </div>
            {authTab === "login" ? (
              <div className="space-y-4">
                <input
                  className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Username"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-semibold text-white shadow-lg transition hover:brightness-110"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Full name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Username"
                  value={regUser}
                  onChange={(e) => setRegUser(e.target.value)}
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Password"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleRegister}
                  className="w-full rounded-xl border border-white/20 bg-white/5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Create account
                </button>
              </div>
            )}
            <button type="button" onClick={goHome} className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-300">
              ← Back
            </button>
          </motion.section>
        )}

        {phase === "slot" && userType && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Bay suggestion</h2>
                <p className="mt-1 text-slate-400">
                  {publicConfig
                    ? (() => {
                        const isMem = userType === "permanent";
                        const base = isMem ? publicConfig.permanent_rate_per_hour : publicConfig.temporary_rate_per_hour;
                        const eff = isMem
                          ? (publicConfig.permanent_effective_rate_per_hour ?? publicConfig.permanent_rate_per_hour)
                          : (publicConfig.temporary_effective_rate_per_hour ?? publicConfig.temporary_rate_per_hour);
                        const label = isMem ? publicConfig.member_rate_label : publicConfig.visitor_rate_label;
                        const peak = publicConfig.pricing_in_peak_now ?? false;
                        const mult = publicConfig.peak_multiplier ?? 1;
                        return (
                          <>
                            {label} · from ₹{base}/hr
                            {mult > 1 && (
                              <>
                                {" "}
                                (now ₹{eff}/hr{peak ? " · peak hours" : ""})
                              </>
                            )}{" "}
                            · Yellow = your suggested bay
                          </>
                        );
                      })()
                    : "Loading rates…"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={videoPath}
                  onChange={(e) => setVideoPath(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-white"
                  placeholder="Video file for bay preview (e.g. easy.mp4)"
                />
                <button
                  type="button"
                  onClick={loadPreview}
                  disabled={previewLoading}
                  className="rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {previewLoading ? "Loading…" : "Refresh frame"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]" /> Occupied
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.5)]" /> Free
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.6)]" /> Suggested
              </span>
            </div>

            {preview?.image && (
              <motion.div
                layout
                className="overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl"
              >
                <img src={preview.image} alt="Parking preview" className="w-full object-cover" />
              </motion.div>
            )}
            {preview?.message && (
              <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {preview.message}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!preview?.slot_id}
                onClick={handleConfirmSlot}
                className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm bay & start timer
              </button>
              <button
                type="button"
                onClick={goHome}
                className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Home
              </button>
            </div>
          </motion.section>
        )}

        {phase === "active" && startedAt && userType && (
          <motion.section
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {slotId && (
              <OutdoorNavigationMap
                slotLabel={slotId}
                etaMinutes={4}
                distanceKm={1.2}
                gateHint="Enter via Gate 2"
                destinationShort="Your bay"
              />
            )}
            <div className="grid gap-6 md:grid-cols-3">
            {[
              { label: "Bay", value: slotId ?? "—" },
              { label: "Elapsed", value: `${elapsedMin.toFixed(1)} min` },
              {
                label: "Est. charge",
                value: `₹${estCharge.toFixed(2)}`,
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-glass backdrop-blur-xl"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{m.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{m.value}</p>
              </div>
            ))}
            <div className="md:col-span-3 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-8">
              <p className="text-slate-400">
                Session started <span className="text-white">{new Date(startedAt).toLocaleString()}</span>
              </p>
              <button
                type="button"
                onClick={handleEndSession}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 py-4 text-lg font-semibold text-white shadow-lg transition hover:brightness-110 md:max-w-md"
              >
                I’ve left my bay — end session
              </button>
            </div>
            </div>
          </motion.section>
        )}

        {phase === "payment" && endResult?.qr_image && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg text-center"
          >
            <h2 className="text-2xl font-bold text-white">Pay for your visit</h2>
            <p className="mt-2 text-slate-400">
              Session closed · {endResult.duration_minutes.toFixed(1)} min ·{" "}
              <span className="text-white">₹{endResult.amount.toFixed(2)}</span>
            </p>
            <motion.div
              animate={{ boxShadow: ["0 0 0 0 rgba(251,146,60,0)", "0 0 40px 0 rgba(251,146,60,0.35)", "0 0 0 0 rgba(251,146,60,0)"] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="mx-auto mt-8 inline-block rounded-3xl bg-white p-6"
            >
              <img src={endResult.qr_image} alt="UPI QR" className="h-56 w-56 object-contain" />
            </motion.div>
            <p className="mt-4 text-sm text-slate-500">Scan with any UPI app. This screen stays until you confirm.</p>
            <button
              type="button"
              onClick={handlePayDone}
              className="mt-8 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-4 font-semibold text-white shadow-lg"
            >
              I’ve completed UPI payment
            </button>
            <button type="button" onClick={() => setPhase("slot")} className="mt-4 text-sm text-slate-500 hover:text-slate-300">
              Back to bay view
            </button>
          </motion.section>
        )}

        {phase === "member_payment" && endResult?.requires_member_payment && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
          >
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pay for your session (member)</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Session total: <span className="font-semibold text-slate-900 dark:text-white">₹{endResult.amount.toFixed(2)}</span> ·
              Duration: {endResult.duration_minutes.toFixed(1)} min
            </p>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-slate-700 dark:text-slate-300">
                Wallet balance: <strong>₹{wallet.toFixed(2)}</strong> (includes ₹100 loyalty on signup for new accounts)
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Pay-later balance: <strong>₹{payLater.toFixed(2)}</strong> / cap <strong>₹{payCap}</strong> · Unpaid balances
                may incur a monthly penalty (min ₹25 or 5%) if not cleared by month-end.
              </p>
              {user?.account_notices && user.account_notices.length > 0 && (
                <div className="border-t border-slate-200 pt-3 dark:border-white/10">
                  <p className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Account updates</p>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    {user.account_notices.map((n, i) => (
                      <li key={`${n.at}-${i}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                        {n.message}
                        <span className="mt-1 block text-[10px] text-slate-500">{new Date(n.at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {user?.penalty_notice && (
              <div className="rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {(user.penalty_notice as { message?: string }).message}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => void handleMemberPay("pay_now")}
                className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-semibold text-white shadow-lg"
              >
                Pay now (demo)
              </button>
              <button
                type="button"
                disabled={!canWallet}
                onClick={() => void handleMemberPay("wallet")}
                className="rounded-2xl border border-emerald-500/50 py-3 font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-200"
              >
                Pay through wallet {!canWallet ? "(insufficient)" : ""}
              </button>
              <button
                type="button"
                disabled={!canPayLater}
                onClick={() => void handleMemberPay("pay_later")}
                className="rounded-2xl border border-orange-500/50 py-3 font-semibold text-orange-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-orange-200"
              >
                Pay later {!canPayLater ? "(over cap)" : ""}
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
              <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Recharge wallet</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  className="min-w-[120px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleRecharge()}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-white/15"
                >
                  Add money
                </button>
              </div>
            </div>
            {payLater > 0 && (
              <button
                type="button"
                onClick={() => void handleRepayPayLater()}
                className="w-full rounded-xl border border-violet-400/50 py-2 text-sm font-medium text-violet-800 dark:text-violet-200"
              >
                Use wallet to reduce pay-later balance (auto)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEndResult(null);
                setPhase("slot");
              }}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </motion.section>
        )}

        {phase === "admin_dashboard" && user && isFacilityAdmin && (
          <AdminDashboard onBack={() => setPhase("landing")} onSettingsSaved={reloadPublicConfig} />
        )}

        {phase === "dashboard" && user && !isFacilityAdmin && (
          <MemberDashboard
            onBack={() => {
              if (userType === "permanent") setPhase("slot");
              else setPhase("landing");
            }}
            onOpenOverview={() => setPhase("overview")}
            onOpenHistory={() => void loadHistory()}
          />
        )}

        {phase === "overview" && (
          <OverviewInsights
            videoPath={videoPath}
            onOpenHistory={() => {
              if (!user) {
                setError("Log in as a member to see session history.");
                return;
              }
              void loadHistory();
            }}
            onBack={() => setPhase("landing")}
          />
        )}

        {phase === "history" && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Your parking history</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Slot</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={String(row.id)} className="border-t border-white/5 bg-slate-900/40">
                      <td className="px-4 py-3 text-white">{String(row.slot_id)}</td>
                      <td className="px-4 py-3 text-slate-400">{String(row.started_at)}</td>
                      <td className="px-4 py-3">₹{row.amount != null ? Number(row.amount).toFixed(2) : "—"}</td>
                      <td className="px-4 py-3 text-emerald-300">{String(row.payment_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setPhase("slot")}
              className="rounded-xl border border-white/15 px-6 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              ← Back
            </button>
          </motion.section>
        )}
      </main>

      <footer className="mx-auto mt-20 max-w-5xl px-4 pb-8 text-center text-xs text-slate-600">
        React · Vite · Tailwind · FastAPI
      </footer>

      <CustomerSupport open={supportOpen} onClose={() => setSupportOpen(false)} />

      <AnimatePresence>
        {paymentClosure && (
          <PaymentClosure
            key="payment-closure"
            data={paymentClosure}
            isLoggedIn={!!user}
            onDismiss={() => setPaymentClosure(null)}
            onGoBack={() => setPhase("slot")}
            onCheckHistory={() => void loadHistory()}
            onOpenDashboard={() => setPhase("dashboard")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
