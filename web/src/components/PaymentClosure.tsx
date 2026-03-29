import { motion } from "framer-motion";

export type PaymentClosureData = {
  variant: "visitor" | "member";
  method: "upi" | "pay_now" | "wallet" | "pay_later";
  amount: number;
  durationMinutes?: number;
  walletBalance?: number;
  payLaterDue?: number;
  payLaterCap?: number;
};

type Props = {
  data: PaymentClosureData;
  isLoggedIn: boolean;
  onDismiss: () => void;
  onGoBack: () => void;
  onCheckHistory: () => void;
  onOpenDashboard: () => void;
};

function rupee(n: number) {
  return `₹${n.toFixed(2)}`;
}

export function PaymentClosure({
  data,
  isLoggedIn,
  onDismiss,
  onGoBack,
  onCheckHistory,
  onOpenDashboard,
}: Props) {
  const { variant, method, amount, durationMinutes, walletBalance, payLaterDue, payLaterCap } = data;

  let title = "Payment recorded";
  let subtitle = "";
  let statusTone: "success" | "wallet" | "defer" = "success";

  if (variant === "visitor") {
    title = "Payment done";
    subtitle = `Your UPI payment of ${rupee(amount)} was recorded. Session duration${durationMinutes != null ? ` · ${durationMinutes.toFixed(1)} min` : ""}.`;
    statusTone = "success";
  } else if (method === "pay_now") {
    title = "Payment complete";
    subtitle = `Instant payment (demo) of ${rupee(amount)} settled. Wallet unchanged; pay-later balance unchanged.`;
    statusTone = "success";
  } else if (method === "wallet") {
    title = "Paid through wallet";
    subtitle = `${rupee(amount)} deducted from your wallet.`;
    statusTone = "wallet";
  } else if (method === "pay_later") {
    title = "Payment passed to pay-later";
    subtitle = `This session (${rupee(amount)}) is added to your due balance. Clear it from wallet or pay before month-end to avoid penalties.`;
    statusTone = "defer";
  }

  const ringClass =
    statusTone === "wallet"
      ? "from-emerald-400 to-cyan-500"
      : statusTone === "defer"
        ? "from-amber-400 to-orange-500"
        : "from-emerald-400 to-cyan-500";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-closure-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-4"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-slate-900 shadow-2xl"
      >
        <div className={`bg-gradient-to-r px-6 py-5 ${ringClass}`}>
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl shadow-inner backdrop-blur">
              {statusTone === "defer" ? "⏳" : "✓"}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/90">Status</p>
              <h2 id="payment-closure-title" className="text-xl font-bold text-white">
                {title}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-300">
          <p className="leading-relaxed">{subtitle}</p>

          <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-left">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Amount</span>
              <span className="font-semibold text-white">{rupee(amount)}</span>
            </div>
            {durationMinutes != null && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Duration</span>
                <span className="text-slate-200">{durationMinutes.toFixed(1)} min</span>
              </div>
            )}
            {variant === "member" && walletBalance !== undefined && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Wallet balance</span>
                <span className="font-medium text-emerald-300">{rupee(walletBalance)}</span>
              </div>
            )}
            {variant === "member" && payLaterDue !== undefined && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Pay-later due</span>
                <span className="font-medium text-amber-200">{rupee(payLaterDue)}</span>
              </div>
            )}
            {variant === "member" && payLaterCap !== undefined && payLaterDue !== undefined && method === "pay_later" && (
              <div className="flex justify-between gap-4 border-t border-white/5 pt-2">
                <span className="text-slate-500">Headroom before cap</span>
                <span className="text-slate-200">{rupee(Math.max(0, payLaterCap - payLaterDue))}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => {
                onGoBack();
                onDismiss();
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
            >
              Go back
            </button>
            {isLoggedIn && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCheckHistory();
                    onDismiss();
                  }}
                  className="flex-1 rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-medium text-white hover:bg-white/10"
                >
                  Check history
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenDashboard();
                    onDismiss();
                  }}
                  className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
                >
                  Dashboard
                </button>
              </>
            )}
          </div>
          {!isLoggedIn && variant === "visitor" && (
            <p className="text-center text-xs text-slate-500">Log in as a member to see history and dashboard.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
