import { motion } from "framer-motion";

/**
 * Decorative hero: car drives along a lane toward a glowing “P” bay (loops).
 */
export function ParkingHeroAnimation() {
  return (
    <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.12),_transparent_55%)]" />
      <div className="relative h-44 w-full md:h-52">
        {/* Road surface */}
        <div className="absolute inset-x-0 bottom-0 top-8 bg-gradient-to-b from-slate-700/40 to-slate-900/90" />
        {/* Moving lane dashes */}
        <div
          className="hero-road-lines absolute inset-x-0 bottom-0 top-[60%] opacity-60"
          aria-hidden
        />
        {/* Parking bay */}
        <motion.div
          className="absolute inset-y-10 right-[6%] flex w-[20%] min-w-[4.5rem] flex-col items-center justify-end rounded-xl border-2 border-amber-400/40 bg-amber-400/10 pb-2 pt-2 shadow-[0_0_30px_rgba(251,191,36,0.25)]"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Bay</span>
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-900 shadow-lg">
            P
          </span>
        </motion.div>

        {/* Car */}
        <motion.div
          className="hero-car absolute bottom-[18%] left-0 z-10 flex items-end"
          initial={{ x: "-18%" }}
          animate={{ x: ["-18%", "72%"] }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: [0.25, 0.1, 0.25, 1],
            repeatDelay: 1.2,
          }}
        >
          <motion.div
            animate={{ y: [0, -2, 0, 0] }}
            transition={{ duration: 9, repeat: Infinity, repeatDelay: 1.2 }}
            className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)]"
          >
            <svg width="120" height="56" viewBox="0 0 120 56" className="md:w-[140px]" aria-hidden>
              <defs>
                <linearGradient id="carBody" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              {/* body */}
              <rect x="8" y="18" width="88" height="24" rx="8" fill="url(#carBody)" />
              <rect x="22" y="8" width="48" height="18" rx="6" fill="#0ea5e9" opacity="0.95" />
              {/* windows */}
              <rect x="28" y="12" width="16" height="10" rx="2" fill="#0f172a" opacity="0.35" />
              <rect x="48" y="12" width="16" height="10" rx="2" fill="#0f172a" opacity="0.35" />
              {/* wheels */}
              <circle cx="28" cy="44" r="8" fill="#0f172a" />
              <circle cx="28" cy="44" r="4" fill="#94a3b8" />
              <circle cx="84" cy="44" r="8" fill="#0f172a" />
              <circle cx="84" cy="44" r="4" fill="#94a3b8" />
              {/* headlight */}
              <circle cx="96" cy="28" r="3" fill="#fef08a" opacity="0.9" />
            </svg>
          </motion.div>
        </motion.div>

        <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-slate-500">
          Animated preview · your bay is suggested in yellow on the next step
        </p>
      </div>
    </div>
  );
}
