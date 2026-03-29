const API_BASE = "";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const d = data as { detail?: unknown };
    if (typeof d.detail === "string") return d.detail;
    if (Array.isArray(d.detail)) return d.detail.map((x) => JSON.stringify(x)).join(", ");
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type PeakWindow = { start: number; end: number };

export interface PublicConfig {
  permanent_rate_per_hour: number;
  temporary_rate_per_hour: number;
  pay_later_cap: number;
  member_rate_label: string;
  visitor_rate_label: string;
  overstay_hours: number;
  /** Peak-based dynamic pricing (optional for older API responses). */
  peak_multiplier?: number;
  peak_windows?: PeakWindow[];
  pricing_in_peak_now?: boolean;
  permanent_effective_rate_per_hour?: number;
  temporary_effective_rate_per_hour?: number;
}

export type AdminSettingsPatch = Partial<
  Pick<
    PublicConfig,
    | "permanent_rate_per_hour"
    | "temporary_rate_per_hour"
    | "pay_later_cap"
    | "member_rate_label"
    | "visitor_rate_label"
    | "overstay_hours"
    | "peak_multiplier"
    | "peak_windows"
  >
>;

export async function fetchPublicConfig(): Promise<PublicConfig> {
  return api<PublicConfig>("/api/config/public");
}

export type UserType = "permanent" | "temporary";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: { id: number; full_name: string; username: string; role?: string };
}

export interface SlotPreview {
  slot_id: string | null;
  image: string | null;
  message: string;
  video_path: string;
}

export interface StartSessionRes {
  session_id: number;
  started_at: string;
  slot_id: string;
}

export interface EndSessionRes {
  session_id: number;
  duration_minutes: number;
  amount: number;
  user_type: UserType;
  requires_payment: boolean;
  qr_image?: string;
  requires_member_payment?: boolean;
  wallet_balance?: number;
  pay_later_due?: number;
  pay_later_cap?: number;
}

export interface MemberPayResponse {
  payment_status: "paid" | "deferred";
  payment_method: "pay_now" | "wallet" | "pay_later";
  wallet_balance: number;
  pay_later_due: number;
}

export interface AccountNotice {
  action: string;
  message: string;
  at: string;
  admin_username?: string | null;
}

export interface MeResponse {
  id: number;
  full_name: string;
  username: string;
  role?: string;
  facility_name?: string;
  wallet_balance: number;
  pay_later_due: number;
  pay_later_cap: number;
  account_notices?: AccountNotice[];
  penalty_notice?: { penalty_applied: number; new_pay_later_due: number; message: string };
}

export const FACILITY_ADMIN_USERNAMES = new Set(["Hospital_admin", "Mall_admin"]);

export interface AdminDashboardMetrics {
  total_bays: number;
  occupied_now: number;
  occupancy_pct: number;
  revenue_today: number;
  avg_dwell_minutes: number;
}

export type HeatmapCellState = "free" | "partial" | "full" | "ev_disabled";

export interface AdminHeatmapCell {
  id: string;
  row: number;
  col: number;
  state: HeatmapCellState;
}

export interface AdminDashboardDetailSection {
  title: string;
  summary: string;
  rows: { label: string; value: string }[];
}

export interface AdminDashboardBundle {
  facility_name: string;
  live: boolean;
  alert_count: number;
  metrics: AdminDashboardMetrics;
  metric_details: Record<
    "bays" | "occupancy" | "revenue" | "dwell",
    AdminDashboardDetailSection
  >;
  heatmap: { cols: number; rows: number; cells: AdminHeatmapCell[] };
  alerts: { severity: "critical" | "warning" | "info"; title: string; subtext: string; at: string }[];
  revenue_by_hour: { hour: number; amount: number }[];
  devices: { device_type: string; total: number; offline: number }[];
}

export interface OverviewInsights {
  video_path: string;
  total_slots: number;
  occupied_count: number;
  free_count: number;
  occupancy_ratio: number;
  occupied_slot_ids: string[];
  peak_traffic: boolean;
  traffic_label: "peak" | "free";
  summary: string;
  insight: string;
}

export interface MonthlyRow {
  month: number;
  month_label: string;
  sessions: number;
  total_minutes: number;
  total_amount: number;
}

export interface MonthlyDashboard {
  year: number;
  months: MonthlyRow[];
  totals: { sessions: number; minutes: number; amount: number };
}
