import { motion } from "framer-motion";
import { useId } from "react";

export type OutdoorNavigationMapProps = {
  /** Display id for the reserved bay, e.g. B-14 */
  slotLabel: string;
  etaMinutes?: number;
  distanceKm?: number;
  /** Shown under the map, e.g. "Enter via Gate 2" */
  gateHint?: string;
  /** Label at route end (default: your bay) */
  destinationShort?: string;
};

/**
 * Decorative outdoor “map” for navigation aid — CSS/SVG only, no tile API.
 */
export function OutdoorNavigationMap({
  slotLabel,
  etaMinutes = 4,
  distanceKm = 1.2,
  gateHint = "Enter via Gate 2",
  destinationShort = "Your bay",
}: OutdoorNavigationMapProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `nav-grad-${uid}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950/60 shadow-[0_24px_64px_-20px_rgba(14,165,233,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset] dark:border-sky-400/25"
    >
      <div className="relative border-b border-white/10 bg-gradient-to-r from-sky-950/40 via-transparent to-emerald-950/30 px-5 py-4">
        <div className="pointer-events-none absolute right-6 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-[10px] font-bold leading-tight text-slate-400 shadow-inner">
          <span className="block text-[8px] text-sky-400">N</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-400/95">Start point</p>
        <p className="mt-1 text-lg font-bold tracking-tight text-white">
          You’ve accepted slot{" "}
          <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 font-mono text-sky-200">{slotLabel}</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">Outdoor map · dashed path to your bay</p>
      </div>

      <div className="relative mx-4 mb-3 mt-4 aspect-[16/9] max-h-[min(280px,44vh)] min-h-[210px] overflow-hidden rounded-2xl border border-sky-500/15 bg-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
        {/* Terrain */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 85%, rgba(34,197,94,0.14), transparent 55%),
              radial-gradient(ellipse 70% 50% at 85% 20%, rgba(56,189,248,0.08), transparent 50%),
              linear-gradient(165deg, #0b1220 0%, #111827 45%, #0f172a 100%)
            `,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            background: `
              repeating-linear-gradient(90deg, rgba(148,163,184,0.07) 0 1px, transparent 1px 56px),
              repeating-linear-gradient(0deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 52px)
            `,
          }}
        />
        {/* Roads */}
        <div className="pointer-events-none absolute bottom-[16%] left-[6%] h-[10%] w-[58%] rotate-[-7deg] rounded-full bg-gradient-to-r from-slate-600/30 to-slate-500/15 blur-[0.5px]" />
        <div className="pointer-events-none absolute right-[10%] top-[18%] h-[7%] w-[42%] rotate-[14deg] rounded-full bg-gradient-to-l from-slate-500/25 to-transparent blur-[0.5px]" />

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 400 220"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(56, 189, 248)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(14, 165, 233)" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <path
            d="M 52 178 C 110 150, 130 95, 175 88 S 260 55, 318 42"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.22"
          />
          <path
            d="M 52 178 C 110 150, 130 95, 175 88 S 260 55, 318 42"
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="11 9"
            className="nav-outdoor-route drop-shadow-[0_0_8px_rgba(59,130,246,0.65)]"
          />
        </svg>

        {/* You */}
        <div className="absolute bottom-[9%] left-[5%] flex flex-col items-center gap-1.5">
          <span className="rounded-full border border-sky-300/40 bg-gradient-to-br from-sky-500 to-sky-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-sky-950/60">
            You
          </span>
          <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-300 shadow-[0_0_0_5px_rgba(56,189,248,0.35)]" />
        </div>

        {/* Destination */}
        <div className="absolute right-[8%] top-[10%] flex flex-col items-center gap-1.5">
          <span className="nav-dest-pulse h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />
          <span className="max-w-[130px] rounded-2xl border border-emerald-400/45 bg-gradient-to-br from-emerald-600 to-emerald-800 px-3 py-1.5 text-center text-[10px] font-bold leading-tight text-white shadow-lg shadow-emerald-950/40">
            {destinationShort}
            <span className="mt-0.5 block font-mono text-[10px] text-emerald-100/95">{slotLabel}</span>
          </span>
        </div>

        <div className="pointer-events-none absolute right-[16%] top-[6%] rounded-lg border border-white/12 bg-slate-900/90 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 shadow-md backdrop-blur-sm">
          Facility
        </div>

        {/* ETA */}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-sky-400/25 bg-slate-950/85 px-3 py-2 text-xs font-semibold text-sky-50 shadow-lg backdrop-blur-md ring-1 ring-white/10">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/25 text-sm" aria-hidden>
            ⏱
          </span>
          <span>
            <span className="tabular-nums text-sky-100">{etaMinutes} min</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="tabular-nums text-sky-200/90">{distanceKm.toFixed(1)} km</span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-slate-950/50 px-5 py-3.5">
        <span className="text-base" aria-hidden>
          🚪
        </span>
        <p className="text-center text-sm font-medium text-slate-200">{gateHint}</p>
      </div>
    </motion.div>
  );
}
