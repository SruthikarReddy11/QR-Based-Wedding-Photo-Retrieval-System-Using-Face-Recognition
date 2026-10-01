import cv2
import numpy as np
from typing import Dict, Any, Optional

class FaceQualityConfig:
    # Configurable thresholds (never blindly reject, but used for flags and re-ranking)
    MIN_FACE_WIDTH: int = 40
    MIN_FACE_HEIGHT: int = 40
    MIN_BLUR_THRESHOLD: float = 40.0      # Laplacian variance threshold
    MIN_EXPOSURE_THRESHOLD: float = 35.0  # Normalized exposure score
    MIN_POSE_THRESHOLD: float = 35.0      # Normalized frontal pose score
    MIN_CONFIDENCE: float = 0.50

    # Composite weights
    WEIGHT_SHARPNESS: float = 0.30
    WEIGHT_POSE: float = 0.25
    WEIGHT_EXPOSURE: float = 0.20
    WEIGHT_SIZE: float = 0.15
    WEIGHT_CONFIDENCE: float = 0.10

def compute_blur_score(gray_crop: np.ndarray) -> float:
    """Calculates Laplacian variance as a measure of sharpness/blur."""
    if gray_crop is None or gray_crop.size == 0:
        return 0.0
    var = cv2.Laplacian(gray_crop, cv2.CV_64F).var()
    # Normalize with smooth saturation into [0, 100]
    # Variance < 20 is heavily blurry, 100 is moderately sharp, > 300 is very crisp
    score = min(100.0, (var / 3.0))
    return round(float(score), 2)

def compute_exposure_score(bgr_crop: np.ndarray) -> float:
    """Evaluates brightness balance and contrast on [0, 100]."""
    if bgr_crop is None or bgr_crop.size == 0:
        return 0.0
    hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2]
    mean_v = np.mean(v_channel)
    std_v = np.std(v_channel)

    # Ideal brightness mean ~ 128 (range 90 - 165). Penalize extreme dark (<50) or blown-out (>220)
    brightness_dev = abs(mean_v - 128.0)
    brightness_score = max(0.0, 100.0 - (brightness_dev * 100.0 / 128.0))

    # Contrast penalty: std < 15 is washed out/flat
    contrast_score = min(100.0, std_v * 2.0)

    final_exposure = (0.7 * brightness_score) + (0.3 * contrast_score)
    return round(float(final_exposure), 2)

def compute_pose_score(landmarks: np.ndarray) -> float:
    """
    Evaluates frontality using 5 facial landmarks:
    [right_eye, left_eye, nose, right_mouth, left_mouth]
    Returns score 0 (extreme profile) to 100 (pure frontal).
    """
    if landmarks is None or len(landmarks) < 5:
        return 50.0  # neutral fallback if landmarks unavailable

    re, le, nose, rm, lm = landmarks[0], landmarks[1], landmarks[2], landmarks[3], landmarks[4]

    # Horizontal distance from nose to left eye vs nose to right eye
    d_right = abs(float(nose[0] - re[0]))
    d_left = abs(float(nose[0] - le[0]))
    denom = d_right + d_left + 1e-5

    yaw_asymmetry = abs(d_right - d_left) / denom  # 0.0 is perfect symmetry, >0.6 is profile

    # Roll angle (eye tilt)
    dx = float(le[0] - re[0])
    dy = float(le[1] - re[1])
    roll_angle = abs(np.degrees(np.arctan2(dy, dx))) if dx != 0 else 90.0

    # Score calculation
    yaw_score = max(0.0, 100.0 * (1.0 - (yaw_asymmetry * 1.6)))
    roll_score = max(0.0, 100.0 - (roll_angle * 2.0))

    pose_score = (0.7 * yaw_score) + (0.3 * roll_score)
    return round(float(pose_score), 2)

def evaluate_face_quality(
    img: np.ndarray,
    box: Dict[str, int],
    landmarks: Optional[np.ndarray] = None,
    confidence: float = 0.90,
    config: FaceQualityConfig = FaceQualityConfig()
) -> Dict[str, Any]:
    """
    Computes comprehensive face quality metrics without hard rejection.
    Stores all metrics for PhotoFace record and downstream re-ranking.
    """
    x, y, w, h = box['x'], box['y'], box['width'], box['height']
    img_h, img_w = img.shape[:2]

    # Safe crop bounds
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(img_w, x + w), min(img_h, y + h)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return {
            'face_width': w,
            'face_height': h,
            'blur_score': 0.0,
            'detection_confidence': confidence,
            'exposure_score': 0.0,
            'pose_score': 0.0,
            'quality_score': 0.0,
            'is_high_quality': False,
        }

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blur_score = compute_blur_score(gray)
    exposure_score = compute_exposure_score(crop)
    pose_score = compute_pose_score(landmarks)

    # Size score (scaled relative to 120px optimal face size)
    face_min_dim = min(w, h)
    size_score = min(100.0, (face_min_dim / 120.0) * 100.0)

    # Weighted composite quality score
    composite_quality = (
        config.WEIGHT_SHARPNESS * blur_score +
        config.WEIGHT_POSE * pose_score +
        config.WEIGHT_EXPOSURE * exposure_score +
        config.WEIGHT_SIZE * size_score +
        config.WEIGHT_CONFIDENCE * (confidence * 100.0)
    )
    composite_quality = round(min(100.0, max(0.0, composite_quality)), 2)

    is_high_quality = (
        w >= config.MIN_FACE_WIDTH and
        h >= config.MIN_FACE_HEIGHT and
        blur_score >= config.MIN_BLUR_THRESHOLD and
        exposure_score >= config.MIN_EXPOSURE_THRESHOLD and
        pose_score >= config.MIN_POSE_THRESHOLD and
        confidence >= config.MIN_CONFIDENCE
    )

    return {
        'face_width': int(w),
        'face_height': int(h),
        'blur_score': blur_score,
        'detection_confidence': round(float(confidence), 4),
        'exposure_score': exposure_score,
        'pose_score': pose_score,
        'quality_score': composite_quality,
        'is_high_quality': bool(is_high_quality),
    }
