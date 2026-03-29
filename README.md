# Smart Parking App (Interactive + Billing + History)

This project now includes a complete interactive UI for smart parking flow:

- Permanent member and temporary user selection
- Username/password login for existing permanent members
- Sign up for new permanent members
- Suggested free parking slot preview from CCTV video frame
- Auto timer start when slot is confirmed
- Bill generation when user exits the slot
- QR payment flow for temporary users
- Past bills/history view for permanent members

## Tech Stack

- `streamlit` for UI
- `sqlite` for user/session/billing database
- `opencv-python` + optional `ultralytics` for slot suggestion from video

## Run

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. (Optional but recommended) put these files in project root:
- `easy.mp4` (your CCTV parking video)
- `yolov8s.pt` (YOLO model weights)

3. Start the app:

```bash
streamlit run app.py
```

## Main Files

- `app.py`: UI, auth, flows, timer, billing, history
- `db.py`: SQLite schema + auth/session/history operations
- `parking_logic.py`: free-slot suggestion + preview image
- `detector.py`: original detector script (kept as-is)

## Notes

- If `yolov8s.pt` is not available, app still works in demo suggestion mode.
- Database file is created automatically as `parking_app.db`.

