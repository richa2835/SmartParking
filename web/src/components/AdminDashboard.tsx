import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminDashboardBundle, api } from "../api";

type DetailKey = "bays" | "occupancy" | "revenue" | "dwell";

type Props = {
  onBack: () => void;
};

const POLL_MS = 15_000;

function cellClass(state: string): string {
  switch (state) {
    case "free":
      return "bg-emerald-500/85 ring-emerald-900/30";
    case "partial":
      return "bg-amber-500/85 ring-amber-900/30";
    case "full":
      return "bg-red-500/88 ring-red-900/30";
    case "ev_disabled":
      return "bg-slate-500/70 ring-slate-700/40";
    default:
      return "bg-slate-600/50";
  }
}

function severityDot(sev: string): string {
  if (sev === "critical") return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]";
  if (sev === "warning") return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]";
  return "bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]";
}

export function AdminDashboard({ onBack }: Props) {
  const [data, setData] = useState<AdminDashboardBundle | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<AdminDashboardBundle>("/api/admin/dashboard");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const maxRev = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.revenue_by_hour.map((x) => x.amount));
  }, [data]);

  const detail = detailKey && data?.metric_details[detailKey];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 text-slate-100"
    >
      {/* Top bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-white md:text-xl">
            {data?.facility_name ?? "—"}
          </h2>
          {data?.live && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          )}
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
            Alerts · {data?.alert_count ?? 0}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <time className="font-mono text-sm tabular-nums text-slate-300 md:text-base">
            {clock.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            <span className="text-white">{clock.toLocaleTimeString(undefined, { hour12: false })}</span>
          </time>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Exit
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">{err}</div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 py-16 text-center text-slate-500">Loading…</div>
      )}

      {data && (
        <>
          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setDetailKey("bays")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-5 text-left transition hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total bays</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.metrics.total_bays}</p>
              <p className="mt-1 text-xs text-slate-500">Tap for inventory</p>
            </button>
            <button
              type="button"
              onClick={() => setDetailKey("occupancy")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-5 text-left transition hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Occupied now</p>
              <p className="mt-2 text-3xl font-bold text-emerald-300">{data.metrics.occupied_now}</p>
              <p className="mt-1 text-sm text-slate-400">{data.metrics.occupancy_pct}% occupancy</p>
            </button>
            <button
              type="button"
              onClick={() => setDetailKey("revenue")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-5 text-left transition hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today&apos;s revenue</p>
              <p className="mt-2 text-3xl font-bold text-amber-200">₹{data.metrics.revenue_today.toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-500">Tap for payments</p>
            </button>
            <button
              type="button"
              onClick={() => setDetailKey("dwell")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-5 text-left transition hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/10"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg dwell time</p>
              <p className="mt-2 text-3xl font-bold text-violet-200">{data.metrics.avg_dwell_minutes} min</p>
              <p className="mt-1 text-xs text-slate-500">Today · tap for stats</p>
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Heatmap */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-white">Occupancy heatmap</h3>
                <div className="flex flex-wrap gap-3 text-[10px] font-medium text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/85" /> Free
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/85" /> Partial
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-red-500/88" /> Full
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-500/70" /> EV / disabled
                  </span>
                </div>
              </div>
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${data.heatmap.cols}, minmax(0, 1fr))`,
                }}
              >
                {data.heatmap.cells.map((cell) => (
                  <div
                    key={cell.id}
                    title={`${cell.id} · ${cell.state.replace("_", " ")}`}
                    className={`min-h-[2rem] rounded-md ring-1 ${cellClass(cell.state)}`}
                  />
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <h3 className="mb-4 font-semibold text-white">Active alerts</h3>
              <ul className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {data.alerts.length === 0 && <li className="text-sm text-slate-500">No active alerts.</li>}
                {data.alerts.map((a, i) => (
                  <li
                    key={`${a.title}-${i}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(a.severity)}`} />
                      <div>
                        <p className="font-semibold text-white">{a.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.subtext}</p>
                        <p className="mt-2 font-mono text-[10px] text-slate-500">
                          {new Date(a.at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Revenue by hour */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="mb-4 font-semibold text-white">Revenue by hour (today)</h3>
            <div className="space-y-2">
              {data.revenue_by_hour.map(({ hour, amount }) => {
                const w = Math.max(amount > 0 ? 8 : 0, (amount / maxRev) * 100);
                return (
                  <div key={hour} className="flex items-center gap-3 text-xs">
                    <span className="w-8 shrink-0 font-mono text-slate-500">{hour.toString().padStart(2, "0")}</span>
                    <div className="h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-800/80">
                      <motion.div
                        initial={false}
                        animate={{ width: `${w}%` }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        className="flex h-full min-w-[2px] items-center justify-end bg-gradient-to-r from-emerald-600 to-teal-500 pr-2"
                      >
                        {amount > 0 && (
                          <span className="text-[10px] font-semibold text-white drop-shadow">₹{amount.toFixed(0)}</span>
                        )}
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Device health */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="mb-4 font-semibold text-white">Device health</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-white/10 text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Device type</th>
                    <th className="pb-3 pr-4 font-semibold">Total</th>
                    <th className="pb-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d) => {
                    const allOk = d.offline === 0;
                    return (
                      <tr key={d.device_type} className="border-t border-white/5">
                        <td className="py-3 pr-4 text-slate-200">{d.device_type}</td>
                        <td className="py-3 pr-4 tabular-nums text-slate-400">{d.total}</td>
                        <td className="py-3">
                          {allOk ? (
                            <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                              All online
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                              {d.offline} offline
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {detailKey && detail && (
          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/75 p-4 pb-10 backdrop-blur-sm sm:items-center sm:pb-4"
            onClick={() => setDetailKey(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl font-bold text-white">{detail.title}</h3>
                <button
                  type="button"
                  onClick={() => setDetailKey(null)}
                  className="rounded-lg border border-white/15 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-400">{detail.summary}</p>
              <ul className="mt-5 space-y-2">
                {detail.rows.map((row, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-300">{row.label}</span>
                    <span className="shrink-0 font-medium text-white">{row.value}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
