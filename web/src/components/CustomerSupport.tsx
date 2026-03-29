import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/** Demo helpline — replace with your operations number. */
export const SUPPORT_PHONE_DISPLAY = "1800-123-4567";
export const SUPPORT_PHONE_TEL = "tel:+9118001234567";

type SubIssue = {
  id: string;
  label: string;
  reply: string;
};

type IssueCategory = {
  id: string;
  title: string;
  hint: string;
  icon: string;
  subIssues: SubIssue[];
};

const ISSUE_CATEGORIES: IssueCategory[] = [
  {
    id: "payments",
    title: "Payments & billing",
    hint: "UPI, wallet, pay-later",
    icon: "💳",
    subIssues: [
      {
        id: "qr",
        label: "UPI / QR not working",
        reply:
          "Ensure good lighting on the QR, update your UPI app, and try another app if needed. After a successful debit, tap “I’ve completed UPI payment” on this screen. If the amount was debited but status did not update, note your UTR and contact us with your session time.",
      },
      {
        id: "wallet",
        label: "Wallet balance & recharge",
        reply:
          "Refresh the page after recharge. Wallet pay needs balance ≥ session total. You can recharge from the member payment screen or use “Pay now (demo)” to settle without wallet. Loyalty credit applies to new accounts as per demo rules.",
      },
      {
        id: "paylater",
        label: "Pay-later limit & penalties",
        reply:
          "Pay-later is limited by your account cap. If you are over the cap, pay by wallet or instant pay, or clear existing pay-later from the wallet first. Month-end penalties apply to uncleared balances as shown in your notices.",
      },
      {
        id: "amount",
        label: "Wrong amount or double charge",
        reply:
          "Check the duration and rate shown before paying. If you see a duplicate debit, keep both UTRs and call us — we reconcile against session timestamps. Do not start a second session for the same visit without ending the first.",
      },
    ],
  },
  {
    id: "parking",
    title: "Parking & session",
    hint: "Bays, timer, navigation",
    icon: "🅿️",
    subIssues: [
      {
        id: "bay",
        label: "Wrong bay / occupancy looks off",
        reply:
          "The bay map updates from a live frame. Refresh the preview and confirm the yellow highlight before you park. If the lot looks full, wait or try again later — Traffic overview shows whether it is a busy or quieter time.",
      },
      {
        id: "session",
        label: "Session did not end",
        reply:
          "Use “I’ve left my bay — end session” once you have vacated. If the request fails, check your connection and try again. Do not start a second session on the same visit without ending the first.",
      },
      {
        id: "nav",
        label: "Finding the gate / bay (map)",
        reply:
          "Follow the outdoor map on your active session screen: dashed blue line from “You” to your bay, ETA at the top, and the gate note at the bottom (e.g. Gate 2). If anything looks wrong, refresh the page after confirming your slot.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & access",
    hint: "Login, history, roles",
    icon: "👤",
    subIssues: [
      {
        id: "login",
        label: "Login & history",
        reply:
          "Use the same username you registered with. History lists completed member sessions. Visitors paying by UPI do not get member history unless they register and use a member session.",
      },
      {
        id: "roles",
        label: "Member vs visitor vs admin",
        reply:
          "Members sign in and are billed to wallet or pay-later. Visitors get a UPI QR after exit. Administrators use the separate admin sign-in from the home page — regular member accounts cannot open the admin console.",
      },
    ],
  },
];

type ChatRole = "bot" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  variant?: "automated" | "plain";
};

type FlowStep = "categories" | "subissues" | "replying" | "satisfaction" | "resolved" | "escalate";

let msgId = 0;
function nextId() {
  msgId += 1;
  return `m-${msgId}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CustomerSupport({ open, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<FlowStep>("categories");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, []);

  const pushBot = useCallback(
    (text: string, variant?: ChatMessage["variant"]) => {
      setTyping(true);
      const delay = 380 + Math.min(400, text.length * 12);
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { id: nextId(), role: "bot", text, variant }]);
        setTyping(false);
        scrollToBottom();
      }, delay);
    },
    [scrollToBottom]
  );

  const pushUser = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text, variant: "plain" }]);
    scrollToBottom();
  }, [scrollToBottom]);

  const resetChat = useCallback(() => {
    msgId = 0;
    setCategoryId(null);
    setStep("categories");
    setTyping(false);
    setMessages([
      {
        id: nextId(),
        role: "bot",
        text: "Hi — I’m the automated assistant. Choose the type of issue below, then pick the closest match. I’ll reply instantly.",
        variant: "plain",
      },
    ]);
  }, []);

  useEffect(() => {
    if (open) resetChat();
  }, [open, resetChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing, scrollToBottom]);

  const category = categoryId ? ISSUE_CATEGORIES.find((c) => c.id === categoryId) : null;

  const pickCategory = (c: IssueCategory) => {
    if (step !== "categories") return;
    pushUser(c.title);
    setCategoryId(c.id);
    setStep("subissues");
    pushBot(`Got it — **${c.title}**. Which of these sounds like your situation?`);
  };

  const pickSubIssue = (sub: SubIssue) => {
    if (step !== "subissues" || !category) return;
    pushUser(sub.label);
    setStep("replying");
    setTyping(true);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: nextId(), role: "bot", text: sub.reply, variant: "automated" }]);
      setTyping(false);
      scrollToBottom();
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { id: nextId(), role: "bot", text: "Was this helpful?" }]);
        setStep("satisfaction");
        scrollToBottom();
      }, 520);
    }, 520);
  };

  const onSatisfied = (yes: boolean) => {
    if (step !== "satisfaction") return;
    pushUser(yes ? "Yes, thanks" : "No, not really");
    if (yes) {
      setStep("resolved");
      pushBot("Great — glad we could help. You can start a new topic anytime, or close this panel when you’re done.");
    } else {
      setStep("escalate");
      pushBot(
        "Sorry that didn’t fix it. Our team can help faster by phone — tap below to call, or try another topic."
      );
    }
  };

  const startOver = () => {
    pushUser("Start over");
    setCategoryId(null);
    setStep("categories");
    pushBot("No problem. What kind of issue are you having?");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="support-root"
          role="presentation"
          className="fixed inset-0 z-[90] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close support"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="relative z-[1] flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-950 shadow-[0_0_80px_rgba(0,0,0,0.45)]"
          >
            {/* Header */}
            <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-emerald-950/90 via-slate-900 to-cyan-950/50 px-5 py-5">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 left-1/4 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl shadow-lg backdrop-blur-sm">
                    🤖
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">Auto chat</p>
                    <h2 id="support-title" className="text-xl font-bold tracking-tight text-white">
                      Customer support
                    </h2>
                    <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-slate-400">
                      Guided help · instant answers · call us if you still need a human
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Chat */}
            <div
              ref={listRef}
              className="relative flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.08),transparent_50%),linear-gradient(180deg,#0c1222_0%,#0f172a_100%)] px-4 py-4"
            >
              <div className="mx-auto max-w-full space-y-3 pb-4">
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-md ${
                          m.role === "user"
                            ? "rounded-br-md border border-emerald-500/25 bg-gradient-to-br from-emerald-600/90 to-cyan-700/85 text-white"
                            : m.variant === "automated"
                              ? "rounded-bl-md border border-sky-500/20 bg-slate-800/90 text-slate-100"
                              : "rounded-bl-md border border-white/10 bg-slate-800/70 text-slate-200"
                        }`}
                      >
                        {m.role === "bot" && (
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {m.variant === "automated" ? "Automated reply" : "Assistant"}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap">
                          {m.text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
                            if (part.startsWith("**") && part.endsWith("**")) {
                              return (
                                <strong key={i} className="font-semibold text-white">
                                  {part.slice(2, -2)}
                                </strong>
                              );
                            }
                            return <span key={i}>{part}</span>;
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {typing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/10 bg-slate-800/60 px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                    </div>
                  </motion.div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Action rail */}
            <div className="border-t border-white/10 bg-slate-900/95 px-4 py-4 backdrop-blur-xl">
              {step === "replying" && (
                <p className="py-2 text-center text-xs text-slate-500">Drafting your answer…</p>
              )}

              {step === "categories" && !typing && (
                <div className="space-y-2">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Possible issues</p>
                  <div className="flex flex-col gap-2">
                    {ISSUE_CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCategory(c)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/60 px-4 py-3 text-left transition hover:border-emerald-500/35 hover:bg-slate-800"
                      >
                        <span className="text-xl" aria-hidden>
                          {c.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-white">{c.title}</span>
                          <span className="block text-xs text-slate-500">{c.hint}</span>
                        </span>
                        <span className="text-slate-500">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "subissues" && category && typing && (
                <p className="py-2 text-center text-xs text-slate-500">Preparing options…</p>
              )}

              {step === "subissues" && category && !typing && (
                <div className="space-y-2">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pick your issue</p>
                  <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
                    {category.subIssues.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickSubIssue(s)}
                        className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-sky-500/40 hover:bg-slate-800"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={startOver}
                    className="w-full rounded-xl border border-white/10 py-2 text-xs font-medium text-slate-400 hover:bg-white/5"
                  >
                    ← Different category
                  </button>
                </div>
              )}

              {step === "satisfaction" && !typing && (
                <div className="space-y-3">
                  <p className="text-center text-xs text-slate-500">Are you satisfied with this answer?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSatisfied(true)}
                      className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => onSatisfied(false)}
                      className="rounded-2xl border border-rose-500/35 bg-rose-500/10 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {step === "resolved" && !typing && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={startOver}
                    className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Ask something else
                  </button>
                  <a
                    href={SUPPORT_PHONE_TEL}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-200"
                  >
                    📞 Call {SUPPORT_PHONE_DISPLAY}
                  </a>
                </div>
              )}

              {step === "escalate" && !typing && (
                <div className="space-y-3">
                  <a
                    href={SUPPORT_PHONE_TEL}
                    className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-orange-600/15 px-4 py-4 text-center shadow-[0_0_24px_rgba(251,191,36,0.12)] transition hover:border-amber-400/70"
                  >
                    <span className="text-2xl" aria-hidden>
                      📞
                    </span>
                    <span className="text-sm font-bold text-amber-100">Talk to support</span>
                    <span className="font-mono text-lg font-bold tracking-wide text-white">{SUPPORT_PHONE_DISPLAY}</span>
                    <span className="text-xs text-amber-200/80">Tap to call · we’re here to help</span>
                  </a>
                  <button
                    type="button"
                    onClick={startOver}
                    className="w-full rounded-xl border border-white/10 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                  >
                    Try another topic instead
                  </button>
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
