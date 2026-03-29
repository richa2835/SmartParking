import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, OverviewInsights as OI } from "../api";

type Props = {
  videoPath: string;
  onOpenHistory: () => void;
  onBack: () => void;
};

function DonutChart({ occupied, free, size = 160 }: { occupied: number; free: number; size?: number }) {
  const total = Math.max(1, occupied + free);
  const occPct = (occupied / total) * 100;
  const r = 36;
  const c = 2 * Math.PI * r;
  const occLen = (occPct / 100) * c;
  const freeLen = c - occLen;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="14" className="text-slate-200 dark:text-slate-700" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="url(#occGrad)"
        strokeWidth="14"
        strokeDasharray={`${occLen} ${freeLen}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        className="drop-shadow-sm"
      />
      <defs>
        <linearGradient id="occGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <text x="50" y="46" textAnchor="middle" className="fill-slate-900 text-[11px] font-bold dark:fill-white">
        {occPct.toFixed(0)}%
      </text>
      <text x="50" y="58" textAnchor="middle" className="fill-slate-500 text-[6px] dark:fill-slate-400">
        occupied
      </text>
    </svg>
  );
}

function OccupancyBar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>Empty bays</span>
        <span>Full bays</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-orange-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
      <p className="text-center text-xs text-slate-500">{pct.toFixed(1)}% of bays occupied</p>
    </div>
  );
}

export function OverviewInsights({ videoPath, onOpenHistory, onBack }: Props) {
  const [data, setData] = useState<OI | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = encodeURIComponent(videoPath);
      const res = await api<OI>(`/api/overview/insights?video_path=${q}`);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load insights");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [videoPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const peakVisual = useMemo(() => {
    if (!data) return null;
    return data.peak_traffic ? "peak" : "calm";
  }, [data]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Traffic overview</h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            See how full the car park looks from the latest frame, and whether it is a busy or quieter time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200"
          >
            View session history
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl bg-slate-200/80 px-4 py-2 text-sm font-medium text-slate-800 dark:bg-white/10 dark:text-white"
          >
            ← Back
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-100">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-6 py-12 text-center text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-400">
          Loading insights…
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/60 lg:col-span-1"
            >
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Bay mix</p>
              <DonutChart occupied={data.occupied_count} free={data.free_count} />
              <div className="mt-4 flex w-full justify-center gap-6 text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span className="h-3 w-3 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500" />
                  {data.occupied_count} occupied
                </span>
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                  {data.free_count} free
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/60 lg:col-span-2"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Occupancy strip</p>
              <div className="mt-4">
                <OccupancyBar ratio={data.occupancy_ratio} />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Total bays", value: data.total_slots, color: "from-slate-400 to-slate-600" },
                  { label: "Occupied", value: data.occupied_count, color: "from-emerald-500 to-cyan-500" },
                  { label: "Free", value: data.free_count, color: "from-violet-400 to-fuchsia-500" },
                ].map((cell) => (
                  <div
                    key={cell.label}
                    className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 dark:bg-slate-950/50"
                  >
                    <div className={`mx-auto mb-2 h-1 w-10 rounded-full bg-gradient-to-r ${cell.color}`} />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{cell.value}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{cell.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-3xl border p-6 shadow-sm ${
                data.peak_traffic
                  ? "border-orange-400/50 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/30"
                  : "border-emerald-400/40 bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/40 dark:to-cyan-950/30"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl shadow-inner ${
                    data.peak_traffic ? "bg-orange-500/20" : "bg-emerald-500/20"
                  }`}
                  aria-hidden
                >
                  {peakVisual === "peak" ? "🚗" : "🍃"}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Current traffic
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                    {data.peak_traffic ? "Busy period · more vehicles" : "Quieter period · easier parking"}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{data.insight}</p>
                  <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">{data.summary}</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/60"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bay breakdown</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-center justify-between rounded-xl bg-slate-100/80 px-3 py-2 dark:bg-slate-950/40">
                  <span className="font-semibold text-slate-900 dark:text-white">Total bays</span>
                  <span className="tabular-nums text-lg font-bold">{data.total_slots}</span>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2">
                  <span className="font-semibold text-emerald-900 dark:text-emerald-100">Occupied</span>
                  <span className="tabular-nums font-semibold">
                    {data.occupied_count}
                    {data.occupied_slot_ids.length ? ` (${data.occupied_slot_ids.join(", ")})` : ""}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-cyan-500/10 px-3 py-2">
                  <span className="font-semibold text-cyan-900 dark:text-cyan-100">Free</span>
                  <span className="tabular-nums font-semibold">{data.free_count}</span>
                </li>
                <li className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
                  <span className="font-semibold text-slate-900 dark:text-white">Occupancy</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {(data.occupancy_ratio * 100).toFixed(1)}%
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
                We treat it as busy when most bays look full (about 60% or more), or when several bays are taken in a
                row.
              </p>
            </motion.div>
          </div>
        </div>
      )}
    </motion.section>
  );
}
