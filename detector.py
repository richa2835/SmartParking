import cv2
import numpy as np
from ultralytics import YOLO
print("detection started")
# Load class list
my_file = open("coco.txt", "r")
data = my_file.read()
class_list = data.split("\n")

# Initialize YOLO model
model = YOLO('yolov8s.pt')

# Define colors for bounding boxes
colors = {
    "car": (0, 0, 255),  # Red
    "empty_parking": (0, 255, 0),  # Green
}

# Open video capture
cap = cv2.VideoCapture("easy1.mp4")
if not cap.isOpened():
    print("ERROR: Cannot open video file")
    exit()
else:
    print("Video opened successfully")


# Constants (Adjust these based on your video)
PARKING_SPACE_WIDTH = 120
PARKING_SPACE_HEIGHT = 250

#Parking lot ROI vertices
PARKING_LOT_ROI = np.array([
    [100, 250],  # Adjust these based on your image, following the white lines in the example image.
    [900, 250],
    [950, 450],
    [50, 450]
], dtype=np.int32)
def calculate_iou(box1, box2):
    """Calculate Intersection over Union (IoU) of two bounding boxes."""
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2

    # Calculate intersection coordinates
    x_intersect_start = max(x1_1, x1_2)
    y_intersect_start = max(y1_1, y1_2)
    x_intersect_end = min(x2_1, x2_2)
    y_intersect_end = min(y2_1, y2_2)

    # Calculate intersection area
    intersection_area = max(0, x_intersect_end - x_intersect_start) * max(0, y_intersect_end - y_intersect_start)

    # Calculate area of each bounding box
    box1_area = (x2_1 - x1_1) * (y2_1 - y1_1)
    box2_area = (x2_2 - x1_2) * (y2_2 - y1_2)

    # Calculate union area
    union_area = box1_area + box2_area - intersection_area

    # Calculate IoU
    iou = intersection_area / union_area if union_area > 0 else 0
    return iou

def point_in_roi(point, roi_vertices):
    """Check if a point is within the ROI polygon."""
    return cv2.pointPolygonTest(roi_vertices, point, False) >= 0

def rectangle_in_roi(x1, y1, x2, y2, roi_vertices):
    """Check if the rectangle is completely within the ROI polygon."""
    # Check all four corners of the rectangle
    return (point_in_roi((x1, y1), roi_vertices) and
            point_in_roi((x2, y1), roi_vertices) and
            point_in_roi((x1, y2), roi_vertices) and
            point_in_roi((x2, y2), roi_vertices))

def process_frame(frame):
    # Resize frame
    frame = cv2.resize(frame, (1020, 500))

    # Predict using YOLO (on the entire frame)
    results = model.predict(frame)

    # Store car bounding boxes, filtering for those inside the parking lot ROI
    car_boxes = []
    for result in results:
        xyxy = result.boxes.xyxy
        conf = result.boxes.conf
        cls = result.boxes.cls

        for i in range(len(xyxy)):
            # Extract bounding box coordinates and class index
            x1, y1, x2, y2 = int(xyxy[i][0]), int(xyxy[i][1]), int(xyxy[i][2]), int(xyxy[i][3])
            class_index = int(cls[i])
            confidence = float(conf[i])

            # Get class label
            class_label = class_list[class_index]

            # Filter for cars *within* the parking lot ROI
            if class_label == "car" and rectangle_in_roi(x1, y1, x2, y2, PARKING_LOT_ROI):
                car_boxes.append((x1, y1, x2, y2))
                cv2.rectangle(frame, (x1, y1), (x2, y2), colors["car"], 2)
                cv2.putText(frame, f"Car {confidence:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    # Detect empty parking spaces based on cars *within* the parking lot ROI
    empty_spaces = []
    for x1, y1, x2, y2 in car_boxes:
        car_width = x2 - x1
        car_height = y2 - y1

        # Project a parking space to the right of the car
        projected_x1 = x2
        projected_y1 = y1
        projected_x2 = projected_x1 + PARKING_SPACE_WIDTH
        projected_y2 = y2
        # Project a parking space to the right of the car
        projected_x1 = x2
        projected_y1 = y1
        projected_x2 = projected_x1 + PARKING_SPACE_WIDTH
        projected_y2 = y2

        if rectangle_in_roi(projected_x1, projected_y1, projected_x2, projected_y2, PARKING_LOT_ROI):
        # Check for car in the projected parking space
            space_occupied = False
            for other_x1, other_y1, other_x2, other_y2 in car_boxes:
                iou = calculate_iou((projected_x1, projected_y1, projected_x2, projected_y2),
                                    (other_x1, other_y1, other_x2, other_y2))
                if iou > 0.1:  # Adjust IoU threshold as needed
                    space_occupied = True
                    break

                # Draw empty parking space if not occupied
            if not space_occupied:
                empty_spaces.append((projected_x1, projected_y1, projected_x2, projected_y2))

                # Now, also try projecting to the *left* of each car
        projected_x1 = x1 - PARKING_SPACE_WIDTH
        projected_y1 = y1
        projected_x2 = x1
        projected_y2 = y2
        if rectangle_in_roi(projected_x1, projected_y1, projected_x2, projected_y2, PARKING_LOT_ROI):
            # Check for car in the projected parking space
            space_occupied = False
            for other_x1, other_y1, other_x2, other_y2 in car_boxes:
                iou = calculate_iou((projected_x1, projected_y1, projected_x2, projected_y2),
                                    (other_x1, other_y1, other_x2, other_y2))
                if iou > 0.1:  # Adjust IoU threshold as needed
                    space_occupied = True
                    break

                    # Draw empty parking space if not occupied
            if not space_occupied:
                empty_spaces.append((projected_x1, projected_y1, projected_x2, projected_y2))

    # Draw the rectangle for empty parking spaces
    for projected_x1, projected_y1, projected_x2, projected_y2 in empty_spaces:
        cv2.rectangle(frame, (projected_x1, projected_y1), (projected_x2, projected_y2), colors["empty_parking"], 2)
        cv2.putText(frame, "Empty Parking", (projected_x1, projected_y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    # Draw the parking lot ROI for visualization
    cv2.polylines(frame, [PARKING_LOT_ROI], True, (255, 255, 255), 2)

    return frame

count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        continue

    count += 1
    if count % 3 != 0:
        continue

    # Process the frame
    processed_frame = process_frame(frame)

    # Display frame
    cv2.imshow('FRAME', processed_frame)

    # Wait for key press
    key = cv2.waitKey(100) & 0xFF
    if key == ord('q'):
        break

# Release resources
cap.release()
cv2.destroyAllWindows()
