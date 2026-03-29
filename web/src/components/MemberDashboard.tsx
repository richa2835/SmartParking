import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, MonthlyDashboard } from "../api";

type Props = {
  onBack: () => void;
  onOpenOverview?: () => void;
  onOpenHistory?: () => void;
};

export function MemberDashboard({ onBack, onOpenOverview, onOpenHistory }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<MonthlyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<MonthlyDashboard>(`/api/dashboard/monthly?year=${year}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxAmount = useMemo(() => {
    if (!data?.months.length) return 1;
    return Math.max(1, ...data.months.map((m) => m.total_amount));
  }, [data]);

  const hoursTotal = useMemo(() => {
    if (!data) return 0;
    return Math.round((data.totals.minutes / 60) * 10) / 10;
  }, [data]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Member dashboard</h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Your parking time and spend for each month (completed sessions only).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onOpenOverview && (
            <button
              type="button"
              onClick={onOpenOverview}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-900 dark:text-cyan-200"
            >
              Traffic overview
            </button>
          )}
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="rounded-xl border border-white/20 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-white"
            >
              Session history
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            ← Back
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">{err}</div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-6 py-12 text-center text-slate-400">
          Loading your usage…
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-400/20 to-cyan-500/10 p-6 shadow-glass backdrop-blur-xl"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sessions (year)</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.totals.sessions}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-400/20 to-fuchsia-500/10 p-6 shadow-glass backdrop-blur-xl"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Parking time</p>
              <p className="mt-2 text-3xl font-bold text-white">{hoursTotal} hrs</p>
              <p className="mt-1 text-xs text-slate-500">{data.totals.minutes} min total</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/20 to-orange-500/10 p-6 shadow-glass backdrop-blur-xl"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Billed (demo)</p>
              <p className="mt-2 text-3xl font-bold text-white">₹{data.totals.amount.toFixed(2)}</p>
            </motion.div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Spend by month</h3>
            <div className="flex h-48 items-end gap-1.5 md:gap-2">
              {data.months.map((m, i) => {
                const hPct = Math.max(6, (m.total_amount / maxAmount) * 100);
                return (
                  <div key={m.month} className="group relative flex h-48 flex-1 flex-col justify-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${hPct}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.02 }}
                      className="relative w-full rounded-t-lg bg-gradient-to-t from-emerald-600/80 to-cyan-400/90"
                    >
                      <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-400 opacity-0 transition group-hover:opacity-100">
                        ₹{m.total_amount.toFixed(0)}
                      </span>
                    </motion.div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between gap-1 text-[10px] text-slate-500 md:text-xs">
              {data.months.map((m) => (
                <span key={m.month} className="flex-1 text-center">
                  {m.month_label}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Sessions</th>
                  <th className="px-4 py-3">Minutes</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <motion.tr
                    key={row.month}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="border-t border-white/5 bg-slate-900/30"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {row.month_label} {data.year}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.sessions}</td>
                    <td className="px-4 py-3 text-slate-300">{row.total_minutes}</td>
                    <td className="px-4 py-3 text-emerald-200">₹{row.total_amount.toFixed(2)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </motion.section>
  );
}
