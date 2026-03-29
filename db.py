import hashlib
import json
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


DB_PATH = "parking_app.db"

LOYALTY_SIGNUP_BONUS = 100.0
PAY_LATER_CAP = 2000.0
PENALTY_MIN = 25.0
PENALTY_RATE = 0.05


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _table_columns(conn, table: str) -> List[str]:
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def _migrate(conn):
    cur = conn.cursor()
    cols = _table_columns(conn, "users")
    if "wallet_balance" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN wallet_balance REAL DEFAULT 0")
    if "pay_later_due" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN pay_later_due REAL DEFAULT 0")
    if "last_penalty_check_month" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN last_penalty_check_month TEXT")
    if "loyalty_applied" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN loyalty_applied INTEGER DEFAULT 0")


def _migrate_admin_and_settings(conn):
    cur = conn.cursor()
    ucols = _table_columns(conn, "users")
    if "role" not in ucols:
        cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    if "is_blocked" not in ucols:
        cur.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")

    scols = _table_columns(conn, "parking_sessions")
    if "refund_amount" not in scols:
        cur.execute("ALTER TABLE parking_sessions ADD COLUMN refund_amount REAL DEFAULT 0")
    if "refund_reason" not in scols:
        cur.execute("ALTER TABLE parking_sessions ADD COLUMN refund_reason TEXT")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (admin_user_id) REFERENCES users(id)
        )
        """
    )
    defaults = [
        ("permanent_rate_per_hour", str(30.0)),
        ("temporary_rate_per_hour", str(50.0)),
        ("pay_later_cap", str(PAY_LATER_CAP)),
        ("member_rate_label", "Member"),
        ("visitor_rate_label", "Visitor"),
        ("overstay_hours", "2"),
    ]
    for k, v in defaults:
        cur.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", (k, v))


def _grant_legacy_loyalty_once(conn):
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE users
        SET wallet_balance = COALESCE(wallet_balance, 0) + ?,
            loyalty_applied = 1
        WHERE IFNULL(loyalty_applied, 0) = 0
        """,
        (LOYALTY_SIGNUP_BONUS,),
    )


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS parking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_type TEXT NOT NULL,
            slot_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_minutes REAL,
            amount REAL,
            payment_status TEXT NOT NULL DEFAULT 'pending',
            payment_method TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )

    _migrate(conn)
    _migrate_admin_and_settings(conn)
    _grant_legacy_loyalty_once(conn)
    conn.commit()
    conn.close()
    ensure_facility_admins()


FACILITY_ADMINS = (
    ("Hospital Administrator", "Hospital_admin", "kaaram"),
    ("Mall Administrator", "Mall_admin", "dosa"),
)

FACILITY_ADMIN_USERNAMES = frozenset({"Hospital_admin", "Mall_admin"})


def facility_display_name(username: str) -> str:
    if username == "Hospital_admin":
        return "City Hospital — North wing garage"
    if username == "Mall_admin":
        return "Mall Central — Retail podium"
    return "Parking facility"


def ensure_facility_admins() -> None:
    for full_name, uname, pwd in FACILITY_ADMINS:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = ?", (uname,))
        if cur.fetchone():
            conn.close()
            continue
        conn.close()
        create_user(full_name, uname, pwd, role="admin")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE users SET role = 'user'
        WHERE role = 'admin' AND username NOT IN ('Hospital_admin', 'Mall_admin')
        """
    )
    conn.commit()
    conn.close()


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def create_user(full_name: str, username: str, password: str, role: str = "user"):
    salt = os.urandom(16).hex()
    password_hash = _hash_password(password, salt)
    created_at = datetime.utcnow().isoformat()
    is_admin = role == "admin"
    wallet = 0.0 if is_admin else LOYALTY_SIGNUP_BONUS
    loyalty_flag = 1

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO users (full_name, username, salt, password_hash, created_at, wallet_balance, pay_later_due, loyalty_applied, role, is_blocked)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
            """,
            (full_name, username, salt, password_hash, created_at, wallet, loyalty_flag, role),
        )
        conn.commit()
        return True, None
    except sqlite3.IntegrityError:
        return False, "Username already exists."
    finally:
        conn.close()


def authenticate_user(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()

    if row is None:
        return None

    expected_hash = _hash_password(password, row["salt"])
    if expected_hash == row["password_hash"]:
        return dict(row)
    return None


def create_session(user_id, user_type: str, slot_id: str, started_at: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO parking_sessions (user_id, user_type, slot_id, started_at)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, user_type, slot_id, started_at),
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return session_id


def close_session(session_id: int, ended_at: str, duration_minutes: float, amount: float, payment_status: str, payment_method: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE parking_sessions
        SET ended_at = ?, duration_minutes = ?, amount = ?, payment_status = ?, payment_method = ?
        WHERE id = ?
        """,
        (ended_at, duration_minutes, amount, payment_status, payment_method, session_id),
    )
    conn.commit()
    conn.close()


def get_session(session_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM parking_sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_member_history(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, slot_id, started_at, ended_at, duration_minutes, amount, payment_status, payment_method
        FROM parking_sessions
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_monthly_usage(user_id: int, year: int):
    """Aggregate permanent-member sessions by calendar month for a given year."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT strftime('%m', COALESCE(ended_at, started_at)) AS m,
               COUNT(*) AS sessions,
               SUM(COALESCE(duration_minutes, 0)) AS total_minutes,
               SUM(COALESCE(amount, 0)) AS total_amount
        FROM parking_sessions
        WHERE user_id = ? AND user_type = 'permanent'
          AND strftime('%Y', COALESCE(ended_at, started_at)) = ?
        GROUP BY m
        ORDER BY m
        """,
        (user_id, str(year)),
    )
    by_month = {}
    for r in cur.fetchall():
        mo = int(r["m"])
        by_month[mo] = {
            "sessions": int(r["sessions"] or 0),
            "total_minutes": float(r["total_minutes"] or 0),
            "total_amount": float(r["total_amount"] or 0),
        }
    conn.close()

    months = []
    total_sessions = 0
    total_minutes = 0.0
    total_amount = 0.0
    for m in range(1, 13):
        row = by_month.get(m, {"sessions": 0, "total_minutes": 0.0, "total_amount": 0.0})
        label = datetime(year, m, 1).strftime("%b")
        months.append(
            {
                "month": m,
                "month_label": label,
                "sessions": row["sessions"],
                "total_minutes": round(row["total_minutes"], 2),
                "total_amount": round(row["total_amount"], 2),
            }
        )
        total_sessions += row["sessions"]
        total_minutes += row["total_minutes"]
        total_amount += row["total_amount"]

    return {
        "year": year,
        "months": months,
        "totals": {
            "sessions": total_sessions,
            "minutes": round(total_minutes, 2),
            "amount": round(total_amount, 2),
        },
    }


def get_user_financials(user_id: int) -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT wallet_balance, pay_later_due, last_penalty_check_month
        FROM users WHERE id = ?
        """,
        (user_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return {}
    return {
        "wallet_balance": float(row["wallet_balance"] or 0),
        "pay_later_due": float(row["pay_later_due"] or 0),
        "last_penalty_check_month": row["last_penalty_check_month"],
    }


def maybe_apply_monthly_penalty(user_id: int) -> Optional[Dict[str, Any]]:
    """If pay_later_due > 0 and we haven't applied penalty this month, add penalty."""
    now_month = datetime.now().strftime("%Y-%m")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT pay_later_due, last_penalty_check_month FROM users WHERE id = ?",
        (user_id,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    due = float(row["pay_later_due"] or 0)
    last = row["last_penalty_check_month"]
    if due <= 0:
        conn.close()
        return None
    if last == now_month:
        conn.close()
        return None

    penalty = max(PENALTY_MIN, round(due * PENALTY_RATE, 2))
    new_due = round(due + penalty, 2)
    cur.execute(
        "UPDATE users SET pay_later_due = ?, last_penalty_check_month = ? WHERE id = ?",
        (new_due, now_month, user_id),
    )
    conn.commit()
    conn.close()
    return {
        "penalty_applied": penalty,
        "new_pay_later_due": new_due,
        "month": now_month,
        "message": f"Monthly penalty of ₹{penalty:.2f} added to pay-later balance (unpaid balance from prior month).",
    }


def recharge_wallet(user_id: int, amount: float) -> float:
    if amount <= 0:
        raise ValueError("Amount must be positive")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT wallet_balance FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("User not found")
    bal = float(row["wallet_balance"] or 0)
    new_bal = round(bal + amount, 2)
    cur.execute("UPDATE users SET wallet_balance = ? WHERE id = ?", (new_bal, user_id))
    conn.commit()
    conn.close()
    return new_bal


def pay_pay_later_from_wallet(user_id: int, max_amount: Optional[float] = None) -> Tuple[float, float]:
    """Pay down pay_later_due from wallet. Returns (wallet_after, pay_later_after)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT wallet_balance, pay_later_due FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("User not found")
    wallet = float(row["wallet_balance"] or 0)
    due = float(row["pay_later_due"] or 0)
    if due <= 0:
        conn.close()
        return wallet, due
    pay = min(wallet, due) if max_amount is None else min(wallet, due, max_amount)
    pay = max(0.0, pay)
    new_wallet = round(wallet - pay, 2)
    new_due = round(due - pay, 2)
    cur.execute(
        "UPDATE users SET wallet_balance = ?, pay_later_due = ? WHERE id = ?",
        (new_wallet, new_due, user_id),
    )
    conn.commit()
    conn.close()
    return new_wallet, new_due


def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return default
    return str(row["value"])


def set_setting(key: str, value: str) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()


def get_pay_later_cap_dynamic() -> float:
    try:
        v = get_setting("pay_later_cap")
        if v is not None:
            return float(v)
    except (TypeError, ValueError):
        pass
    return float(PAY_LATER_CAP)


def get_rate_permanent() -> float:
    try:
        v = get_setting("permanent_rate_per_hour")
        if v is not None:
            return float(v)
    except (TypeError, ValueError):
        pass
    return 30.0


def get_rate_temporary() -> float:
    try:
        v = get_setting("temporary_rate_per_hour")
        if v is not None:
            return float(v)
    except (TypeError, ValueError):
        pass
    return 50.0


def get_public_config() -> Dict[str, Any]:
    return {
        "permanent_rate_per_hour": get_rate_permanent(),
        "temporary_rate_per_hour": get_rate_temporary(),
        "pay_later_cap": get_pay_later_cap_dynamic(),
        "member_rate_label": get_setting("member_rate_label", "Member") or "Member",
        "visitor_rate_label": get_setting("visitor_rate_label", "Visitor") or "Visitor",
        "overstay_hours": float(get_setting("overstay_hours", "2") or "2"),
    }


def append_audit_log(
    admin_user_id: int,
    action: str,
    entity_type: Optional[str],
    entity_id: Optional[int],
    details: Optional[Dict[str, Any]],
) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO admin_audit_log (admin_user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            admin_user_id,
            action,
            entity_type,
            entity_id,
            json.dumps(details) if details is not None else None,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def list_users_admin() -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, full_name, username, COALESCE(role, 'user') AS role,
               COALESCE(is_blocked, 0) AS is_blocked, wallet_balance, pay_later_due, created_at
        FROM users
        ORDER BY id ASC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def set_user_blocked(user_id: int, blocked: bool) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET is_blocked = ? WHERE id = ?", (1 if blocked else 0, user_id))
    conn.commit()
    conn.close()


def list_sessions_admin(limit: int = 300) -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT s.id, s.user_id, s.user_type, s.slot_id, s.started_at, s.ended_at, s.duration_minutes,
               s.amount, s.payment_status, s.payment_method, s.refund_amount, s.refund_reason,
               u.username AS member_username
        FROM parking_sessions s
        LEFT JOIN users u ON s.user_id = u.id
        ORDER BY s.id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def list_active_sessions() -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT s.id, s.user_id, s.user_type, s.slot_id, s.started_at, u.username AS member_username
        FROM parking_sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.ended_at IS NULL
        ORDER BY s.id ASC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_admin_dashboard_bundle(admin_username: str) -> Dict[str, Any]:
    """Facility operations snapshot: mixes live DB stats with deterministic layout for heatmap/UI."""
    total_bays = 32
    grid_cols = 8
    grid_rows = 4
    facility = facility_display_name(admin_username)
    prefix = "H" if admin_username == "Hospital_admin" else "M"

    active = list_active_sessions()
    occupied_now = len(active)
    occupancy_pct = round(min(100.0, 100.0 * occupied_now / total_bays), 1) if total_bays else 0.0

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS rev
        FROM parking_sessions
        WHERE ended_at IS NOT NULL AND date(ended_at) = date('now') AND payment_status = 'paid'
        """
    )
    revenue_today = round(float(cur.fetchone()["rev"] or 0), 2)

    cur.execute(
        """
        SELECT AVG(duration_minutes) AS avgd,
               MIN(duration_minutes) AS mn,
               MAX(duration_minutes) AS mx
        FROM parking_sessions
        WHERE ended_at IS NOT NULL AND date(ended_at) = date('now') AND duration_minutes IS NOT NULL
        """
    )
    ag = cur.fetchone()
    avg_dwell = round(float(ag["avgd"] or 0), 1) if ag and ag["avgd"] else 0.0
    dwell_min = round(float(ag["mn"] or 0), 1)
    dwell_max = round(float(ag["mx"] or 0), 1)

    cur.execute(
        """
        SELECT CAST(strftime('%H', ended_at) AS INTEGER) AS hr, COALESCE(SUM(amount), 0) AS amt
        FROM parking_sessions
        WHERE date(ended_at) = date('now') AND payment_status = 'paid'
        GROUP BY hr
        ORDER BY hr
        """
    )
    hourly_map: Dict[int, float] = {int(r["hr"]): round(float(r["amt"] or 0), 2) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT id, slot_id, amount, payment_method, ended_at
        FROM parking_sessions
        WHERE date(ended_at) = date('now') AND payment_status = 'paid'
        ORDER BY id DESC
        LIMIT 20
        """
    )
    today_payments = [dict(r) for r in cur.fetchall()]
    conn.close()

    revenue_by_hour = [{"hour": h, "amount": hourly_map.get(h, 0.0)} for h in range(24)]

    ev_positions = {6, 13, 20, 27}
    non_ev = [i for i in range(total_bays) if i not in ev_positions]
    to_mark = min(occupied_now, len(non_ev))
    full_count = max(0, (to_mark * 2) // 3) if to_mark else 0
    partial_count = to_mark - full_count
    non_ev_sorted = sorted(non_ev, key=lambda i: (i // grid_cols, i % grid_cols))
    full_set = set(non_ev_sorted[:full_count])
    partial_set = set(non_ev_sorted[full_count : full_count + partial_count])

    cells = []
    for i in range(total_bays):
        r, c = divmod(i, grid_cols)
        bay_id = f"{prefix}{r + 1}-{c + 1}"
        if i in ev_positions:
            state = "ev_disabled"
        elif i in full_set:
            state = "full"
        elif i in partial_set:
            state = "partial"
        else:
            state = "free"
        cells.append({"id": bay_id, "row": r, "col": c, "state": state})

    now_local = datetime.now()
    now_iso = now_local.isoformat()
    alerts: List[Dict[str, Any]] = []
    if occupancy_pct >= 80:
        alerts.append(
            {
                "severity": "critical",
                "title": "Lot approaching capacity",
                "subtext": f"{occupancy_pct}% occupancy — consider overflow routing.",
                "at": now_iso,
            }
        )
    elif occupancy_pct >= 55:
        alerts.append(
            {
                "severity": "warning",
                "title": "Elevated occupancy",
                "subtext": f"{occupied_now} of {total_bays} bays in use.",
                "at": now_iso,
            }
        )
    if avg_dwell > 90:
        alerts.append(
            {
                "severity": "warning",
                "title": "Long average dwell",
                "subtext": f"Today's average stay is {avg_dwell} minutes.",
                "at": now_iso,
            }
        )
    seed = abs(hash(admin_username)) % 10
    if seed == 0:
        alerts.append(
            {
                "severity": "info",
                "title": "Maintenance notice",
                "subtext": "Payment terminals will briefly restart during low traffic.",
                "at": now_iso,
            }
        )
    for s in active:
        try:
            st = _parse_dt_local(str(s["started_at"]))
            hours_open = (now_local - st).total_seconds() / 3600.0
            if hours_open > 3:
                alerts.append(
                    {
                        "severity": "critical",
                        "title": "Possible overstayed vehicle",
                        "subtext": f"Session #{s['id']} · bay {s['slot_id']} · {hours_open:.1f} h open",
                        "at": now_iso,
                    }
                )
                break
        except (ValueError, TypeError):
            continue

    dseed = abs(hash(admin_username + str(occupied_now)))
    cctv_off = 1 if dseed % 11 == 0 else 0
    sensor_off = 1 if dseed % 9 == 0 else 0
    pay_off = 1 if dseed % 15 == 0 else 0
    devices = [
        {"device_type": "CCTV / ANPR", "total": 14, "offline": cctv_off},
        {"device_type": "Bay occupancy sensors", "total": total_bays, "offline": sensor_off},
        {"device_type": "Payment & exit terminals", "total": 6, "offline": pay_off},
        {"device_type": "Digital signage", "total": 8, "offline": 0},
    ]

    standard_bays = total_bays - len(ev_positions)
    metric_details = {
        "bays": {
            "title": "Bay inventory",
            "summary": f"{standard_bays} standard plus {len(ev_positions)} EV or accessible bays ({total_bays} total).",
            "rows": [
                {"label": "Standard bays", "value": str(standard_bays)},
                {"label": "EV / accessible", "value": str(len(ev_positions))},
                {"label": "Total", "value": str(total_bays)},
            ],
        },
        "occupancy": {
            "title": "Live occupancy",
            "summary": f"{occupied_now} vehicles currently parked.",
            "rows": [
                {
                    "label": f"Session #{s['id']} · {s['slot_id']}",
                    "value": str(s.get("member_username") or s["user_type"]),
                }
                for s in active[:15]
            ]
            + (
                []
                if len(active) <= 15
                else [{"label": "Additional sessions", "value": f"+{len(active) - 15} more"}]
            ),
        },
        "revenue": {
            "title": "Today's paid sessions",
            "summary": f"₹{revenue_today:.2f} from completed payments today (latest 20).",
            "rows": [
                {"label": f"#{p['id']} {p['slot_id']}", "value": f"₹{float(p['amount'] or 0):.2f}"}
                for p in today_payments
            ],
        },
        "dwell": {
            "title": "Dwell today",
            "summary": "Minutes parked for sessions closed today.",
            "rows": [
                {"label": "Average", "value": f"{avg_dwell} min"},
                {"label": "Shortest", "value": f"{dwell_min} min"},
                {"label": "Longest", "value": f"{dwell_max} min"},
            ],
        },
    }

    return {
        "facility_name": facility,
        "live": True,
        "alert_count": len(alerts),
        "metrics": {
            "total_bays": total_bays,
            "occupied_now": occupied_now,
            "occupancy_pct": occupancy_pct,
            "revenue_today": revenue_today,
            "avg_dwell_minutes": avg_dwell,
        },
        "metric_details": metric_details,
        "heatmap": {"cols": grid_cols, "rows": grid_rows, "cells": cells},
        "alerts": alerts,
        "revenue_by_hour": revenue_by_hour,
        "devices": devices,
    }


def mark_session_refunded(session_id: int, reason: str) -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM parking_sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("Session not found")
    sess = dict(row)
    if sess.get("payment_status") not in ("paid", "deferred"):
        conn.close()
        raise ValueError("Only paid or deferred sessions can be refunded in this demo")
    amt = float(sess.get("amount") or 0)
    cur.execute(
        """
        UPDATE parking_sessions
        SET payment_status = 'refunded', refund_amount = ?, refund_reason = ?, payment_method = COALESCE(payment_method, 'refund')
        WHERE id = ?
        """,
        (amt, reason or "Admin refund", session_id),
    )
    conn.commit()
    conn.close()
    return {"session_id": session_id, "refund_amount": amt, "payment_status": "refunded"}


def get_audit_entries(limit: int = 150) -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT a.id, a.admin_user_id, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at,
               u.username AS admin_username
        FROM admin_audit_log a
        LEFT JOIN users u ON a.admin_user_id = u.id
        ORDER BY a.id DESC
        LIMIT ?
        """,
        (limit,),
    )
    out = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get("details_json"):
            try:
                d["details"] = json.loads(d["details_json"])
            except json.JSONDecodeError:
                d["details"] = None
        else:
            d["details"] = None
        del d["details_json"]
        out.append(d)
    conn.close()
    return out


def get_notices_for_user(user_id: int, limit: int = 8) -> List[Dict[str, Any]]:
    """Audit rows relevant to this member (their user id or global rate/label changes)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT a.action, a.entity_type, a.entity_id, a.details_json, a.created_at, u.username AS admin_username
        FROM admin_audit_log a
        LEFT JOIN users u ON a.admin_user_id = u.id
        WHERE a.entity_type = 'global'
           OR (a.entity_type = 'user' AND a.entity_id = ?)
        ORDER BY a.id DESC
        LIMIT ?
        """,
        (user_id, limit),
    )
    out = []
    for r in cur.fetchall():
        d = dict(r)
        details = None
        if d.get("details_json"):
            try:
                details = json.loads(d["details_json"])
            except json.JSONDecodeError:
                details = None
        msg = _format_notice(d["action"], details)
        out.append(
            {
                "action": d["action"],
                "message": msg,
                "at": d["created_at"],
                "admin_username": d.get("admin_username"),
            }
        )
    conn.close()
    return out


def _format_notice(action: str, details: Optional[Dict[str, Any]]) -> str:
    if action == "update_settings" and details:
        parts = []
        if "permanent_rate_per_hour" in details:
            parts.append(f"Member hourly rate set to ₹{details['permanent_rate_per_hour']}/hr")
        if "temporary_rate_per_hour" in details:
            parts.append(f"Visitor hourly rate set to ₹{details['temporary_rate_per_hour']}/hr")
        if "pay_later_cap" in details:
            parts.append(f"Pay-later cap is now ₹{details['pay_later_cap']}")
        if "member_rate_label" in details:
            parts.append(f"Member label: {details['member_rate_label']}")
        if "visitor_rate_label" in details:
            parts.append(f"Visitor label: {details['visitor_rate_label']}")
        return "; ".join(parts) if parts else "Settings were updated."
    if action == "user_block" and details:
        st = "blocked" if details.get("blocked") else "unblocked"
        return f"Your account was {st} by an administrator."
    return f"Account notice: {action}"


def _parse_dt_local(s: str) -> datetime:
    s = (s or "").strip()
    if " " in s and "T" not in s:
        s = s.replace(" ", "T", 1)
    return datetime.fromisoformat(s)


def admin_analytics_summary() -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(*) AS n,
               SUM(CASE WHEN payment_status = 'paid' THEN COALESCE(amount,0) ELSE 0 END) AS rev_paid,
               SUM(CASE WHEN payment_status = 'deferred' THEN COALESCE(amount,0) ELSE 0 END) AS deferred_amt
        FROM parking_sessions
        WHERE ended_at IS NOT NULL
        """
    )
    row = cur.fetchone()
    total_sessions = int(row["n"] or 0)
    revenue = float(row["rev_paid"] or 0)
    deferred = float(row["deferred_amt"] or 0)

    cur.execute(
        """
        SELECT strftime('%H', started_at) AS hr, COUNT(*) AS c
        FROM parking_sessions
        WHERE ended_at IS NOT NULL
        GROUP BY hr
        ORDER BY c DESC
        LIMIT 5
        """
    )
    peak_hours = [{"hour": int(r["hr"]), "sessions": int(r["c"])} for r in cur.fetchall()]
    conn.close()

    occ = list_active_sessions()
    thr = float(get_setting("overstay_hours", "2") or "2")
    overstays = []
    now = datetime.now()
    for s in occ:
        try:
            st = _parse_dt_local(str(s["started_at"]))
            hours = (now - st).total_seconds() / 3600.0
            if hours > thr:
                overstays.append({**dict(s), "hours_open": round(hours, 2), "threshold_hours": thr})
        except (ValueError, TypeError):
            continue

    return {
        "total_completed_sessions": total_sessions,
        "revenue_paid_net": round(revenue, 2),
        "deferred_total": round(deferred, 2),
        "peak_hours": peak_hours,
        "active_sessions": len(occ),
        "overstays": overstays,
    }


def finalize_member_session_payment(
    session_id: int,
    user_id: int,
    method: str,
    amount: float,
) -> Dict[str, Any]:
    """
    method: pay_now | wallet | pay_later
    Updates session payment fields and user wallet / pay_later_due as needed.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM parking_sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("Session not found")
    sess = dict(row)
    if sess.get("user_id") != user_id:
        conn.close()
        raise ValueError("Forbidden")
    if sess.get("payment_status") != "pending_member_payment":
        conn.close()
        raise ValueError("Session not awaiting member payment")

    cur.execute("SELECT wallet_balance, pay_later_due FROM users WHERE id = ?", (user_id,))
    urow = cur.fetchone()
    wallet = float(urow["wallet_balance"] or 0)
    pay_later = float(urow["pay_later_due"] or 0)

    if method == "pay_now":
        cur.execute(
            """
            UPDATE parking_sessions
            SET payment_status = 'paid', payment_method = 'pay_now'
            WHERE id = ?
            """,
            (session_id,),
        )
        conn.commit()
        conn.close()
        return {"payment_status": "paid", "payment_method": "pay_now", "wallet_balance": wallet, "pay_later_due": pay_later}

    if method == "wallet":
        if wallet < amount:
            conn.close()
            raise ValueError("Insufficient wallet balance")
        new_wallet = round(wallet - amount, 2)
        cur.execute(
            """
            UPDATE users SET wallet_balance = ? WHERE id = ?
            """,
            (new_wallet, user_id),
        )
        cur.execute(
            """
            UPDATE parking_sessions
            SET payment_status = 'paid', payment_method = 'wallet'
            WHERE id = ?
            """,
            (session_id,),
        )
        conn.commit()
        conn.close()
        return {"payment_status": "paid", "payment_method": "wallet", "wallet_balance": new_wallet, "pay_later_due": pay_later}

    if method == "pay_later":
        cap = get_pay_later_cap_dynamic()
        if pay_later + amount > cap + 1e-6:
            conn.close()
            raise ValueError(f"Pay-later would exceed cap of ₹{cap:.0f}. Pay wallet, pay now, or reduce due first.")
        new_pl = round(pay_later + amount, 2)
        cur.execute(
            "UPDATE users SET pay_later_due = ? WHERE id = ?",
            (new_pl, user_id),
        )
        cur.execute(
            """
            UPDATE parking_sessions
            SET payment_status = 'deferred', payment_method = 'pay_later'
            WHERE id = ?
            """,
            (session_id,),
        )
        conn.commit()
        conn.close()
        return {"payment_status": "deferred", "payment_method": "pay_later", "wallet_balance": wallet, "pay_later_due": new_pl}

    conn.close()
    raise ValueError("Invalid method")
