import os
from typing import List, Optional, Tuple

import cv2
import numpy as np


# Slot boxes in normalized 0–1 coords (x1, y1, x2, y2) so they scale to any frame size.
SLOTS_NORM: List[Tuple[str, Tuple[float, float, float, float]]] = [
    ("A1", (0.09, 0.44, 0.24, 0.86)),
    ("A2", (0.26, 0.44, 0.41, 0.86)),
    ("A3", (0.42, 0.44, 0.58, 0.86)),
    ("A4", (0.59, 0.44, 0.74, 0.86)),
    ("A5", (0.76, 0.44, 0.91, 0.86)),
]


def _slots_pixel(w: int, h: int) -> List[Tuple[str, Tuple[int, int, int, int]]]:
    out = []
    for sid, (nx1, ny1, nx2, ny2) in SLOTS_NORM:
        x1 = int(nx1 * w)
        y1 = int(ny1 * h)
        x2 = int(nx2 * w)
        y2 = int(ny2 * h)
        out.append((sid, (x1, y1, x2, y2)))
    return out


def _read_first_frame(video_path: str) -> Optional[np.ndarray]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return None
    return cv2.resize(frame, (900, 500))


def _yolo_car_boxes(frame: np.ndarray):
    model_path = "yolov8s.pt"
    if not os.path.exists(model_path):
        return []

    try:
        from ultralytics import YOLO
    except Exception:
        return []

    model = YOLO(model_path)
    results = model.predict(frame, verbose=False)
    boxes = []
    for result in results:
        xyxy = result.boxes.xyxy
        cls = result.boxes.cls
        for i in range(len(xyxy)):
            class_index = int(cls[i])
            if class_index == 2:  # COCO class id for "car"
                x1, y1, x2, y2 = map(int, xyxy[i].tolist())
                boxes.append((x1, y1, x2, y2))
    return boxes


def get_lot_occupancy_insights(video_path: str):
    """
    Occupancy from first CCTV frame + YOLO cars vs slot grid.
    Peak traffic when most slots are occupied (>= 60% or >= 3 of 5).
    """
    frame = _read_first_frame(video_path)
    if frame is None:
        frame = np.zeros((500, 900, 3), dtype=np.uint8)
    h, w = frame.shape[:2]
    slots = _slots_pixel(w, h)
    car_boxes = _yolo_car_boxes(frame)
    total = len(slots)
    occupied = 0
    occupied_ids = []
    for sid, slot_box in slots:
        occ = any(_iou(slot_box, car_box) > 0.12 for car_box in car_boxes)
        if occ:
            occupied += 1
            occupied_ids.append(sid)
    free = total - occupied
    ratio = occupied / total if total else 0.0
    peak = ratio >= 0.6 or occupied >= max(3, int(0.6 * total))
    if peak:
        label = "peak"
        hint = "High traffic — most bays are occupied. Expect congestion at entry and exits."
    else:
        label = "free"
        hint = "Lighter traffic — more bays free. Good time to park quickly."
    return {
        "total_slots": total,
        "occupied_count": occupied,
        "free_count": free,
        "occupancy_ratio": round(ratio, 4),
        "occupied_slot_ids": occupied_ids,
        "peak_traffic": peak,
        "traffic_label": label,
        "summary": f"{occupied}/{total} bays occupied (~{ratio * 100:.0f}%).",
        "insight": hint,
    }


def _iou(box1, box2):
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2

    x_left = max(x1_1, x1_2)
    y_top = max(y1_1, y1_2)
    x_right = min(x2_1, x2_2)
    y_bottom = min(y2_1, y2_2)

    inter_w = max(0, x_right - x_left)
    inter_h = max(0, y_bottom - y_top)
    inter_area = inter_w * inter_h

    area1 = max(0, (x2_1 - x1_1)) * max(0, (y2_1 - y1_1))
    area2 = max(0, (x2_2 - x1_2)) * max(0, (y2_2 - y1_2))
    union = area1 + area2 - inter_area
    return inter_area / union if union else 0.0


def _blend_yellow_overlay(frame: np.ndarray, x1: int, y1: int, x2: int, y2: int, alpha: float = 0.35):
    """Semi-transparent yellow fill so the suggested slot is unmistakable (BGR yellow = 0,255,255)."""
    overlay = frame.copy()
    yellow_bgr = (0, 255, 255)
    cv2.rectangle(overlay, (x1, y1), (x2, y2), yellow_bgr, -1)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, dst=frame)


def suggest_slot_with_preview(video_path: str):
    frame = _read_first_frame(video_path)
    if frame is None:
        frame = np.zeros((500, 900, 3), dtype=np.uint8)
        cv2.putText(
            frame,
            "Video not found - using demo lot",
            (220, 240),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2,
        )

    h, w = frame.shape[:2]
    SLOTS = _slots_pixel(w, h)

    car_boxes = _yolo_car_boxes(frame)
    free_slots = []
    occupied_slots = []

    for slot_id, slot_box in SLOTS:
        occupied = any(_iou(slot_box, car_box) > 0.12 for car_box in car_boxes)
        if occupied:
            occupied_slots.append((slot_id, slot_box))
        else:
            free_slots.append((slot_id, slot_box))

    suggested = free_slots[0] if free_slots else None

    # Occupied = red (BGR)
    for _, (x1, y1, x2, y2) in occupied_slots:
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

    # Free (not suggested) = green
    for sid, box in free_slots:
        if suggested and sid == suggested[0]:
            continue
        x1, y1, x2, y2 = box
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 0), 2)

    if suggested is not None:
        slot_id, (x1, y1, x2, y2) = suggested
        _blend_yellow_overlay(frame, x1, y1, x2, y2, alpha=0.38)
        # Bold yellow border (BGR yellow, not cyan)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 5)
        cv2.rectangle(frame, (x1 - 2, y1 - 2), (x2 + 2, y2 + 2), (0, 180, 255), 2)

        label = f"SUGGESTED: {slot_id}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.85, 2)
        lx, ly = max(8, x1), max(th + 14, y1 - 8)
        cv2.rectangle(frame, (lx - 4, ly - th - 6), (lx + tw + 6, ly + 6), (0, 0, 0), -1)
        cv2.putText(frame, label, (lx, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 255, 255), 2)

        message = "Your suggested free bay is highlighted in bright yellow (filled + border)."
        return slot_id, frame[:, :, ::-1], message

    cv2.putText(frame, "No free slots detected", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3)
    return None, frame[:, :, ::-1], "No free slot available right now."


def suggest_slot_preview_data_url(video_path: str):
    """Return (slot_id, data_url_or_none, message) for web/API clients."""
    import base64

    slot_id, rgb, msg = suggest_slot_with_preview(video_path)
    if rgb is None:
        return slot_id, None, msg
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        return slot_id, None, msg
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return slot_id, f"data:image/png;base64,{b64}", msg
