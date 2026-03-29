from datetime import datetime
from io import BytesIO

import pandas as pd
import qrcode
import streamlit as st

from db import (
    authenticate_user,
    close_session,
    create_session,
    create_user,
    get_member_history,
    init_db,
)
from parking_logic import suggest_slot_with_preview

try:
    from streamlit_autorefresh import st_autorefresh
except ImportError:
    st_autorefresh = None


PERMANENT_RATE_PER_HOUR = 30.0
TEMP_RATE_PER_HOUR = 50.0


def inject_styles():
    st.markdown(
        """
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
  html, body, [class*="css"] { font-family: 'Outfit', system-ui, sans-serif; }
  .stApp {
    background: radial-gradient(1200px 600px at 10% -10%, rgba(16, 185, 129, 0.12), transparent 55%),
                radial-gradient(900px 500px at 100% 0%, rgba(249, 115, 22, 0.1), transparent 50%),
                linear-gradient(165deg, #0f172a 0%, #1e293b 35%, #0f172a 100%);
  }
  .block-container { padding-top: 1.5rem; padding-bottom: 3rem; max-width: 1080px; }
  .main .block-container { color: #e2e8f0; }
  .hero-kicker {
    color: #34d399;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  .hero-title {
    font-size: clamp(1.85rem, 4vw, 2.45rem);
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.15;
    margin-bottom: 0.6rem;
    letter-spacing: -0.02em;
  }
  .hero-sub {
    color: #94a3b8;
    font-size: 1.05rem;
    line-height: 1.6;
    max-width: 560px;
  }
  .glass-card {
    background: rgba(30, 41, 59, 0.65);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 20px;
    padding: 1.6rem 1.5rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .glass-card:hover {
    transform: translateY(-3px);
    border-color: rgba(148, 163, 184, 0.35);
    box-shadow: 0 28px 60px rgba(0, 0, 0, 0.45);
  }
  .glass-card h3 { margin: 0 0 0.65rem 0; font-size: 1.2rem; color: #f1f5f9; font-weight: 600; }
  .glass-card p { margin: 0; color: #cbd5e1; font-size: 0.95rem; line-height: 1.55; }
  .badge-member {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(52, 211, 153, 0.35);
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    margin-bottom: 0.75rem;
  }
  .badge-visitor {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fdba74;
    background: rgba(249, 115, 22, 0.15);
    border: 1px solid rgba(251, 146, 60, 0.4);
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    margin-bottom: 0.75rem;
  }
  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 1.25rem 0 0.85rem 0;
    letter-spacing: -0.02em;
  }
  .sub-muted { color: #94a3b8; font-size: 0.95rem; line-height: 1.55; margin-bottom: 0.75rem; }
  .legend-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.85rem;
    color: #cbd5e1;
    margin: 0.5rem 0 1rem 0;
    padding: 0.65rem 0.85rem;
    background: rgba(15, 23, 42, 0.5);
    border-radius: 12px;
    border: 1px solid rgba(71, 85, 105, 0.4);
  }
  .dot { display: inline-block; width: 11px; height: 11px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
  .dot-red { background: #f87171; box-shadow: 0 0 12px rgba(248, 113, 113, 0.5); }
  .dot-green { background: #4ade80; box-shadow: 0 0 12px rgba(74, 222, 128, 0.4); }
  .dot-yellow { background: #facc15; border: 1px solid #eab308; box-shadow: 0 0 14px rgba(250, 204, 21, 0.45); }
  .pay-shell {
    max-width: 420px;
    margin: 0 auto;
    padding: 2rem 1.75rem;
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
    border-radius: 24px;
    border: 1px solid rgba(251, 146, 60, 0.35);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04) inset, 0 24px 48px rgba(0, 0, 0, 0.4);
    text-align: center;
  }
  .pay-shell h2 { color: #f8fafc; margin: 0 0 0.5rem 0; font-size: 1.35rem; }
  .pay-qr-wrap {
    display: inline-block;
    padding: 1rem;
    background: #fff;
    border-radius: 16px;
    margin: 1rem 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    animation: pulse-soft 2.5s ease-in-out infinite;
  }
  @keyframes pulse-soft {
    0%, 100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25); }
    50% { box-shadow: 0 8px 40px rgba(251, 146, 60, 0.35); }
  }
  div[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%) !important;
    border-right: 1px solid rgba(71, 85, 105, 0.35);
  }
  div[data-testid="stSidebar"] p, div[data-testid="stSidebar"] span, div[data-testid="stSidebar"] label { color: #e2e8f0; }
  div[data-testid="stSidebar"] .stMarkdown strong { color: #f8fafc; }
  /* Streamlit widgets on dark bg */
  .stTabs [data-baseweb="tab-list"] { background: rgba(15, 23, 42, 0.6); border-radius: 12px; padding: 4px; }
  .stMetric { background: rgba(15, 23, 42, 0.55); padding: 1rem; border-radius: 14px; border: 1px solid rgba(71, 85, 105, 0.4); }
  [data-testid="stExpander"] { background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(71, 85, 105, 0.35); border-radius: 12px; }
</style>
        """,
        unsafe_allow_html=True,
    )


def calc_bill(start_time: datetime, end_time: datetime, is_permanent: bool):
    duration_minutes = max((end_time - start_time).total_seconds() / 60.0, 1.0)
    hours = duration_minutes / 60.0
    rate = PERMANENT_RATE_PER_HOUR if is_permanent else TEMP_RATE_PER_HOUR
    amount = round(hours * rate, 2)
    return duration_minutes, amount


def build_qr(amount: float) -> BytesIO:
    payload = f"SMARTPARK|PAY|UPI|INR|{amount:.2f}"
    img = qrcode.make(payload)
    bio = BytesIO()
    img.save(bio, format="PNG")
    bio.seek(0)
    return bio


def init_state():
    defaults = {
        "authenticated_user": None,
        "active_session_id": None,
        "active_slot": None,
        "session_started_at": None,
        "current_user_type": None,
        "video_path": "easy.mp4",
        "ui_phase": "landing",
        "pending_payment": None,
        "flash_message": None,
        "last_receipt": None,
        "celebrate_payment": False,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def auth_panel():
    st.markdown('<p class="section-title">Permanent member</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="sub-muted">Sign in to reserve bays and view billing history.</p>',
        unsafe_allow_html=True,
    )
    tab1, tab2 = st.tabs(["Login", "Sign up"])

    with tab1:
        username = st.text_input("Username", key="login_username", placeholder="your_username")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Log in", type="primary", use_container_width=True):
            user = authenticate_user(username.strip(), password)
            if user:
                st.session_state.authenticated_user = user
                st.success(f"Welcome back, {user['full_name']}!")
                st.rerun()
            else:
                st.error("Invalid username or password.")

    with tab2:
        full_name = st.text_input("Full name", key="signup_full_name")
        username = st.text_input("Choose username", key="signup_username")
        password = st.text_input("Choose password", type="password", key="signup_password")
        if st.button("Create account", use_container_width=True):
            ok, err = create_user(full_name.strip(), username.strip(), password)
            if ok:
                st.success("Account created. Please log in from the Login tab.")
            else:
                st.error(err)


def slot_selection_and_start(user_type: str):
    st.markdown('<p class="section-title">Live bay suggestion</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="sub-muted">Occupied bays are red; other free bays green. '
        "Your <strong style=\"color:#facc15;\">suggested</strong> bay is highlighted in yellow.</p>",
        unsafe_allow_html=True,
    )
    st.markdown(
        '<div class="legend-row">'
        '<span><span class="dot dot-red"></span>Occupied</span>'
        '<span><span class="dot dot-green"></span>Free (other)</span>'
        '<span><span class="dot dot-yellow"></span><strong>Suggested for you</strong></span>'
        "</div>",
        unsafe_allow_html=True,
    )

    with st.expander("Tips — get the best match from CCTV", expanded=False):
        st.markdown(
            "- Point the camera at the full row of bays.\n"
            "- Set **CCTV video path** in the sidebar if your file is not `easy.mp4`.\n"
            "- YOLO marks cars; empty bays drive the suggestion."
        )

    slot_id, preview_img, msg = suggest_slot_with_preview(st.session_state.video_path)
    st.image(preview_img, caption="Frame from your parking feed", use_container_width=True)
    if msg:
        st.success(msg)

    if slot_id is None:
        st.warning("No free slot available right now. Try again in a moment.")
        return

    st.info(f"**Recommended bay:** `{slot_id}` — use the yellow overlay.")
    if st.button("Confirm bay & start timer", type="primary", use_container_width=True):
        started = datetime.now()
        st.session_state.active_slot = slot_id
        st.session_state.session_started_at = started
        st.session_state.current_user_type = user_type
        user_id = st.session_state.authenticated_user["id"] if user_type == "permanent" else None
        session_id = create_session(
            user_id=user_id,
            user_type=user_type,
            slot_id=slot_id,
            started_at=started.isoformat(),
        )
        st.session_state.active_session_id = session_id
        st.rerun()


def active_session_panel():
    if st_autorefresh:
        st_autorefresh(interval=1000, limit=None, key="session_tick")

    st.markdown('<p class="section-title">Active session</p>', unsafe_allow_html=True)
    start_dt = st.session_state.session_started_at
    slot = st.session_state.active_slot
    user_type = st.session_state.current_user_type

    now = datetime.now()
    elapsed_sec = max((now - start_dt).total_seconds(), 0.0)
    elapsed_min = elapsed_sec / 60.0

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Bay", slot or "—")
    with c2:
        st.metric("Elapsed", f"{elapsed_min:.1f} min")
    with c3:
        rate = PERMANENT_RATE_PER_HOUR if user_type == "permanent" else TEMP_RATE_PER_HOUR
        est = round((elapsed_min / 60.0) * rate, 2)
        st.metric("Est. charge (so far)", f"₹{est:.2f}")

    st.caption(f"Started {start_dt.strftime('%Y-%m-%d %H:%M:%S')} · refreshes every second")

    if st.button("I've left my bay — end session", type="primary", use_container_width=True):
        end_dt = datetime.now()
        is_permanent = user_type == "permanent"
        duration_minutes, amount = calc_bill(start_dt, end_dt, is_permanent)
        session_id = st.session_state.active_session_id

        payment_status = "paid" if is_permanent else "pending"
        payment_method = "account_billing" if is_permanent else "qr_scanner"
        close_session(
            session_id=session_id,
            ended_at=end_dt.isoformat(),
            duration_minutes=duration_minutes,
            amount=amount,
            payment_status=payment_status,
            payment_method=payment_method,
        )

        st.session_state.active_session_id = None
        st.session_state.active_slot = None
        st.session_state.session_started_at = None
        if not is_permanent:
            st.session_state.current_user_type = None

        if is_permanent:
            st.session_state.last_receipt = {
                "duration_minutes": duration_minutes,
                "amount": amount,
                "type": "permanent",
            }
            st.rerun()
        else:
            st.session_state.pending_payment = {
                "session_id": session_id,
                "amount": amount,
                "duration_minutes": duration_minutes,
                "ended_at": end_dt.isoformat(),
            }
            st.rerun()


def temporary_payment_screen():
    p = st.session_state.pending_payment
    if not p:
        return

    st.markdown('<p class="section-title">Complete payment</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="sub-muted">Your session is closed. Scan the QR with any UPI app. This screen stays until you confirm.</p>',
        unsafe_allow_html=True,
    )

    st.markdown(
        f"""
<div class="pay-shell">
  <h2>Pay ₹{p["amount"]:.2f}</h2>
  <p style="color:#94a3b8;font-size:0.9rem;margin:0;">Session duration · {p["duration_minutes"]:.1f} min</p>
</div>
        """,
        unsafe_allow_html=True,
    )

    col_l, col_m, col_r = st.columns([1, 2, 1])
    with col_m:
        st.image(build_qr(p["amount"]), width=280)
        st.caption("Scan with PhonePe, GPay, Paytm, or any UPI app — stays on screen until you confirm")

    st.markdown("")
    b1, b2 = st.columns(2)
    with b1:
        if st.button("I've completed UPI payment", type="primary", use_container_width=True):
            close_session(
                session_id=p["session_id"],
                ended_at=p["ended_at"],
                duration_minutes=p["duration_minutes"],
                amount=p["amount"],
                payment_status="paid",
                payment_method="qr_scanner",
            )
            st.session_state.pending_payment = None
            st.session_state.flash_message = "Payment recorded. Thank you — drive safe!"
            st.session_state.celebrate_payment = True
            st.rerun()
    with b2:
        if st.button("Pay later (keep QR)", use_container_width=True):
            st.info("The QR stays on this page. Scroll up to scan anytime.")

    if st.button("Cancel and return home", use_container_width=True):
        st.session_state.pending_payment = None
        st.session_state.ui_phase = "landing"
        st.session_state.current_user_type = None
        st.rerun()


def member_history_panel():
    user = st.session_state.authenticated_user
    if not user:
        return
    st.markdown('<p class="section-title">Past bills & history</p>', unsafe_allow_html=True)
    rows = get_member_history(user["id"])
    if not rows:
        st.caption("No past records yet.")
        return
    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)


def receipt_banner():
    r = st.session_state.get("last_receipt")
    if not r or r.get("type") != "permanent":
        return
    st.success(
        f"Session billed to your account: **₹{r['amount']:.2f}** · **{r['duration_minutes']:.1f}** min"
    )
    if st.button("Dismiss", key="dismiss_receipt"):
        st.session_state.last_receipt = None
        st.rerun()


def landing_page():
    st.markdown('<p class="hero-kicker">Intelligent parking</p>', unsafe_allow_html=True)
    st.markdown('<p class="hero-title">Smart parking demo</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="hero-sub">Choose how you use the car park. Members get ML-suggested bays from CCTV; '
        "visitors pay with UPI when they leave.</p>",
        unsafe_allow_html=True,
    )

    c1, c2 = st.columns(2)
    with c1:
        st.markdown(
            """
<div class="glass-card">
  <span class="badge-member">Member</span>
  <h3>Permanent member</h3>
  <p>Get a suggested free bay, park, then receive a bill on your account when you exit.</p>
</div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("")
        if st.button("Start member session →", type="primary", use_container_width=True, key="btn_member"):
            st.session_state.ui_phase = "app"
            st.session_state.current_user_type = "permanent"
            st.rerun()

    with c2:
        st.markdown(
            """
<div class="glass-card">
  <span class="badge-visitor">Visitor</span>
  <h3>Temporary visitor</h3>
  <p>Same bay suggestion. When you leave, pay with a UPI QR — the payment screen stays open until you’re done.</p>
</div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("")
        if st.button("Start visitor session →", type="primary", use_container_width=True, key="btn_visitor"):
            st.session_state.ui_phase = "app"
            st.session_state.current_user_type = "temporary"
            st.rerun()


def main():
    st.set_page_config(page_title="Smart Parking", page_icon="🚗", layout="wide", initial_sidebar_state="expanded")
    inject_styles()
    init_db()
    init_state()

    if st.session_state.get("celebrate_payment"):
        st.balloons()
        st.session_state.celebrate_payment = False
    if st.session_state.get("flash_message"):
        st.success(st.session_state.flash_message)
        st.session_state.flash_message = None

    with st.sidebar:
        st.markdown("### Controls")
        custom_video = st.text_input("CCTV video path", value=st.session_state.video_path)
        st.session_state.video_path = custom_video.strip() or "easy.mp4"

        if st.session_state.authenticated_user:
            st.success(f"**{st.session_state.authenticated_user['username']}**")
            if st.button("Log out"):
                st.session_state.authenticated_user = None
                st.rerun()

        if st.button("Back to welcome"):
            st.session_state.ui_phase = "landing"
            st.session_state.pending_payment = None
            if st.session_state.active_session_id is None:
                st.session_state.current_user_type = None
            st.rerun()

    if st.session_state.ui_phase == "landing":
        landing_page()
        return

    if st.session_state.pending_payment is not None:
        temporary_payment_screen()
        return

    user_type = st.session_state.current_user_type
    if user_type is None:
        user_type = "temporary"

    if user_type == "permanent" and not st.session_state.authenticated_user:
        auth_panel()
        st.stop()

    receipt_banner()

    if st.session_state.active_session_id is None:
        slot_selection_and_start(user_type)
    else:
        active_session_panel()

    if st.session_state.authenticated_user:
        st.divider()
        member_history_panel()


if __name__ == "__main__":
    main()
