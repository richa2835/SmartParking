"""
Run from FindNPark root:  uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import base64
import os
import sys
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
import qrcode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from db import (  # noqa: E402
    FACILITY_ADMIN_USERNAMES,
    apply_admin_settings_patch,
    authenticate_user,
    close_session,
    compute_session_charge,
    create_session,
    create_user,
    facility_display_name,
    finalize_member_session_payment,
    get_admin_dashboard_bundle,
    get_member_history,
    get_monthly_usage,
    get_notices_for_user,
    get_pay_later_cap_dynamic,
    get_public_config,
    get_session,
    get_user_by_id,
    get_user_financials,
    init_db,
    maybe_apply_monthly_penalty,
    pay_pay_later_from_wallet,
    recharge_wallet,
)
from parking_logic import get_lot_occupancy_insights, suggest_slot_preview_data_url  # noqa: E402

SECRET_KEY = os.getenv("JWT_SECRET", "smartpark-dev-change-in-production")
ALGORITHM = "HS256"

app = FastAPI(title="Smart Parking API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


def create_access_token(user_id: int, role: str = "user") -> str:
    expire = datetime.utcnow() + timedelta(days=7)
    payload: dict = {"sub": str(user_id), "exp": expire, "role": role}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token_payload(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "user_id": int(payload["sub"]),
            "role": str(payload.get("role", "user")),
        }
    except (JWTError, ValueError, KeyError):
        return None


def decode_user_id(token: str) -> Optional[int]:
    p = decode_token_payload(token)
    return p["user_id"] if p else None


async def optional_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[int]:
    if not creds:
        return None
    p = decode_token_payload(creds.credentials)
    return p["user_id"] if p else None


async def require_user(creds: HTTPAuthorizationCredentials | None = Depends(security)) -> int:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    p = decode_token_payload(creds.credentials)
    if p is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    u = get_user_by_id(p["user_id"])
    if u and int(u.get("is_blocked") or 0) == 1:
        raise HTTPException(status_code=403, detail="Account suspended")
    return p["user_id"]


async def require_admin(user_id: int = Depends(require_user)) -> int:
    u = get_user_by_id(user_id)
    if not u or u.get("role") != "admin" or u.get("username") not in FACILITY_ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Facility admin only")
    return user_id


@app.on_event("startup")
def startup():
    init_db()


def qr_data_url(amount: float) -> str:
    payload = f"SMARTPARK|PAY|UPI|INR|{amount:.2f}"
    img = qrcode.make(payload)
    bio = BytesIO()
    img.save(bio, format="PNG")
    b64 = base64.b64encode(bio.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


class RegisterBody(BaseModel):
    full_name: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginBody(BaseModel):
    username: str
    password: str


class StartSessionBody(BaseModel):
    user_type: Literal["permanent", "temporary"]
    slot_id: str = Field(min_length=1)


class EndSessionBody(BaseModel):
    session_id: int


class RechargeBody(BaseModel):
    amount: float = Field(gt=0, le=100000)


class MemberPayBody(BaseModel):
    method: Literal["pay_now", "wallet", "pay_later"]


class AdminSettingsPatchBody(BaseModel):
    permanent_rate_per_hour: Optional[float] = None
    temporary_rate_per_hour: Optional[float] = None
    pay_later_cap: Optional[float] = None
    member_rate_label: Optional[str] = None
    visitor_rate_label: Optional[str] = None
    overstay_hours: Optional[float] = None
    peak_multiplier: Optional[float] = None
    peak_windows: Optional[list] = None


def _parse_started_at(s: str) -> datetime:
    s = (s or "").strip()
    if " " in s and "T" not in s:
        s = s.replace(" ", "T", 1)
    return datetime.fromisoformat(s)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/auth/register")
def register(body: RegisterBody):
    ok, err = create_user(body.full_name.strip(), body.username.strip(), body.password)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Registration failed")
    return {"message": "Account created"}


@app.post("/api/auth/login")
def login(body: LoginBody):
    user = authenticate_user(body.username.strip(), body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if int(user.get("is_blocked") or 0) == 1:
        raise HTTPException(status_code=403, detail="Account suspended")
    role = user.get("role") or "user"
    token = create_access_token(user["id"], role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "username": user["username"],
            "role": role,
        },
    }


@app.get("/api/config/public")
def public_config():
    return get_public_config()


@app.get("/api/me")
def me(user_id: int = Depends(require_user)):
    penalty_info = maybe_apply_monthly_penalty(user_id)
    fin = get_user_financials(user_id)

    row = get_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    role = row.get("role") or "user"
    cap = get_pay_later_cap_dynamic()
    out = {
        "id": row["id"],
        "full_name": row["full_name"],
        "username": row["username"],
        "role": role,
        "wallet_balance": fin.get("wallet_balance", 0),
        "pay_later_due": fin.get("pay_later_due", 0),
        "pay_later_cap": cap,
    }
    if role == "admin" and row.get("username") in FACILITY_ADMIN_USERNAMES:
        out["facility_name"] = facility_display_name(str(row["username"]))
    if role != "admin":
        out["account_notices"] = get_notices_for_user(user_id)
    if penalty_info:
        out["penalty_notice"] = penalty_info
    return out


@app.get("/api/slot/preview")
def slot_preview(video_path: str = "easy.mp4"):
    path = video_path.strip() or "easy.mp4"
    slot_id, data_url, message = suggest_slot_preview_data_url(path)
    return {"slot_id": slot_id, "image": data_url, "message": message, "video_path": path}


@app.get("/api/overview/insights")
def overview_insights(video_path: str = "easy.mp4"):
    path = video_path.strip() or "easy.mp4"
    occ = get_lot_occupancy_insights(path)
    return {"video_path": path, **occ}


@app.post("/api/sessions/start")
def start_session(body: StartSessionBody, user_id: Optional[int] = Depends(optional_user)):
    if body.user_type == "permanent":
        if user_id is None:
            raise HTTPException(status_code=401, detail="Login required for permanent members")
        u = get_user_by_id(user_id)
        if u and u.get("role") == "admin":
            raise HTTPException(status_code=403, detail="Admin accounts cannot book bays")
        uid = user_id
    else:
        uid = None

    started = datetime.now().isoformat()
    sid = create_session(uid, body.user_type, body.slot_id, started)
    return {"session_id": sid, "started_at": started, "slot_id": body.slot_id}


@app.post("/api/sessions/end")
def end_session_api(body: EndSessionBody):
    row = get_session(body.session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row.get("ended_at"):
        raise HTTPException(status_code=400, detail="Session already ended")

    start = _parse_started_at(str(row["started_at"]))
    end = datetime.now()
    is_perm = row["user_type"] == "permanent"
    duration_minutes, amount = compute_session_charge(start, end, is_perm)

    if is_perm:
        payment_status = "pending_member_payment"
        payment_method = "unset"
    else:
        payment_status = "pending"
        payment_method = "qr_scanner"

    close_session(
        body.session_id,
        end.isoformat(),
        duration_minutes,
        amount,
        payment_status,
        payment_method,
    )

    out: dict = {
        "session_id": body.session_id,
        "duration_minutes": duration_minutes,
        "amount": amount,
        "user_type": row["user_type"],
        "requires_payment": not is_perm,
        "requires_member_payment": is_perm,
    }

    if not is_perm:
        out["qr_image"] = qr_data_url(amount)
    else:
        uid = row.get("user_id")
        if uid:
            fin = get_user_financials(int(uid))
            out["wallet_balance"] = fin.get("wallet_balance", 0)
            out["pay_later_due"] = fin.get("pay_later_due", 0)
            out["pay_later_cap"] = get_pay_later_cap_dynamic()

    return out


@app.post("/api/wallet/recharge")
def wallet_recharge(body: RechargeBody, user_id: int = Depends(require_user)):
    u = get_user_by_id(user_id)
    if u and u.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Not available for admin accounts")
    try:
        new_bal = recharge_wallet(user_id, float(body.amount))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"wallet_balance": new_bal, "message": f"Wallet credited ₹{body.amount:.2f}"}


@app.post("/api/wallet/repay-pay-later")
def wallet_repay_pay_later(user_id: int = Depends(require_user)):
    u = get_user_by_id(user_id)
    if u and u.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Not available for admin accounts")
    try:
        w, pl = pay_pay_later_from_wallet(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"wallet_balance": w, "pay_later_due": pl}


@app.post("/api/sessions/{session_id}/member-pay")
def member_pay_session(session_id: int, body: MemberPayBody, user_id: int = Depends(require_user)):
    u = get_user_by_id(user_id)
    if u and u.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Not available for admin accounts")
    row = get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not your session")
    if row.get("payment_status") != "pending_member_payment":
        raise HTTPException(status_code=400, detail="Session does not need member payment")
    amount = float(row["amount"] or 0)
    try:
        result = finalize_member_session_payment(session_id, user_id, body.method, amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@app.post("/api/sessions/{session_id}/pay")
def pay_session(session_id: int):
    row = get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row["user_type"] != "temporary":
        raise HTTPException(status_code=400, detail="Not a temporary session")
    if row.get("payment_status") == "paid":
        return {"message": "Already paid"}

    end = row.get("ended_at") or datetime.now().isoformat()
    close_session(
        session_id,
        end,
        row["duration_minutes"] or 0.0,
        row["amount"] or 0.0,
        "paid",
        "qr_scanner",
    )
    return {"message": "Payment recorded"}


@app.get("/api/history")
def history(user_id: int = Depends(require_user)):
    u = get_user_by_id(user_id)
    if u and u.get("role") == "admin":
        return {"sessions": []}
    rows = get_member_history(user_id)
    return {"sessions": rows}


@app.get("/api/dashboard/monthly")
def dashboard_monthly(year: Optional[int] = None, user_id: int = Depends(require_user)):
    from datetime import datetime as dt

    u = get_user_by_id(user_id)
    if u and u.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Use the admin dashboard")
    y = year if year is not None else dt.now().year
    if y < 2000 or y > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    return get_monthly_usage(user_id, y)


@app.get("/api/admin/dashboard")
def admin_dashboard(admin_id: int = Depends(require_admin)):
    u = get_user_by_id(admin_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return get_admin_dashboard_bundle(str(u["username"]))


@app.get("/api/admin/settings")
def admin_get_settings(_admin_id: int = Depends(require_admin)):
    return get_public_config()


@app.patch("/api/admin/settings")
def admin_patch_settings(body: AdminSettingsPatchBody, admin_id: int = Depends(require_admin)):
    patch = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else body.dict(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        return apply_admin_settings_patch(admin_id, patch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


_dist = ROOT / "web" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="spa")
