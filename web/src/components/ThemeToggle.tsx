import { motion } from "framer-motion";
import { useTheme } from "../ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-full border border-slate-300/40 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
      title="Toggle light / dark mode"
    >
      <motion.span layout className="tabular-nums">
        {isDark ? "Dark" : "Light"}
      </motion.span>
      <span className="text-base leading-none">{isDark ? "🌙" : "☀️"}</span>
    </button>
  );
}
