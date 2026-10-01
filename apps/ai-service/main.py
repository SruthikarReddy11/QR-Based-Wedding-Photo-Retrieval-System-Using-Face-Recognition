import os
import gc
import cv2
import numpy as np
import base64
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="WedSnap AI Face Recognition Service (Tier 2 - 512D ArcFace)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(BASE_DIR, "models"))
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx")
ARCFACE_R50_PATH = os.path.join(MODELS_DIR, "face_recognition_arcface_r50_512d.onnx")
ARCFACE_MBF_PATH = os.path.join(MODELS_DIR, "face_recognition_arcface_mbf_512d.onnx")

if not os.path.exists(YUNET_PATH):
    raise RuntimeError(f"YuNet detector missing at {YUNET_PATH}")

# Pick best available ArcFace model
if os.path.exists(ARCFACE_R50_PATH):
    ACTIVE_ARCFACE_PATH = ARCFACE_R50_PATH
    MODEL_NAME = "ArcFace ResNet-50 (512D)"
elif os.path.exists(ARCFACE_MBF_PATH):
    ACTIVE_ARCFACE_PATH = ARCFACE_MBF_PATH
    MODEL_NAME = "ArcFace MobileFaceNet (512D)"
else:
    raise RuntimeError(f"ArcFace 512D models missing in {MODELS_DIR}")

# 1. Initialize YuNet Face Detector
detector = cv2.FaceDetectorYN.create(
    model=YUNET_PATH,
    config="",
    input_size=(320, 320),
    score_threshold=0.5,
    nms_threshold=0.3,
    top_k=5000,
)

# 2. Initialize ArcFace 512D via ONNX Runtime
opts = ort.SessionOptions()
opts.intra_op_num_threads = 4
opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
arcface_sess = ort.InferenceSession(ACTIVE_ARCFACE_PATH, opts, providers=["CPUExecutionProvider"])
arcface_input_name = arcface_sess.get_inputs()[0].name

print(f"WedSnap AI Tier 2 Service Initialized:")
print(f"  - Detector: YuNet")
print(f"  - Recognizer: {MODEL_NAME}")
print(f"  - Dual Thresholds: High Confidence >= 0.45, Suggested >= 0.34")

# Standard ArcFace 112x112 canonical 5-point reference landmarks
ARCFACE_REF_PTS = np.array([
    [38.2946, 51.6963],  # left eye
    [73.5318, 51.5014],  # right eye
    [56.0252, 71.7366],  # nose
    [41.5493, 92.3655],  # left mouth
    [70.7299, 92.2041]   # right mouth
], dtype=np.float32)

class CandidateFace(BaseModel):
    photoId: str
    embedding: List[float]
    boxAreaRatio: Optional[float] = 0.05
    photoFaceCount: Optional[int] = 1
    qualityScore: Optional[float] = 70.0
    blurScore: Optional[float] = 50.0
    faceWidth: Optional[int] = 100

class MatchSelfieRequest(BaseModel):
    selfieBase64: Optional[str] = None
    selfieBase64List: Optional[List[str]] = None
    candidates: List[CandidateFace]
    highThreshold: Optional[float] = 0.45
    suggestedThreshold: Optional[float] = 0.34

def decode_image_bytes(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img

def decode_base64_image(b64_string: str) -> np.ndarray:
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_string)
    return decode_image_bytes(image_bytes)

def compute_blur_score(gray_crop: np.ndarray) -> float:
    if gray_crop is None or gray_crop.size == 0:
        return 0.0
    var = cv2.Laplacian(gray_crop, cv2.CV_64F).var()
    score = min(100.0, (var / 3.0))
    return round(float(score), 2)

def compute_exposure_score(bgr_crop: np.ndarray) -> float:
    if bgr_crop is None or bgr_crop.size == 0:
        return 0.0
    hsv = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2]
    mean_v = np.mean(v_channel)
    std_v = np.std(v_channel)
    brightness_dev = abs(mean_v - 128.0)
    brightness_score = max(0.0, 100.0 - (brightness_dev * 100.0 / 128.0))
    contrast_score = min(100.0, std_v * 2.0)
    return round(float((0.7 * brightness_score) + (0.3 * contrast_score)), 2)

def compute_pose_score(landmarks: np.ndarray) -> float:
    if landmarks is None or len(landmarks) < 5:
        return 50.0
    re, le, nose, rm, lm = landmarks[0], landmarks[1], landmarks[2], landmarks[3], landmarks[4]
    d_right = abs(float(nose[0] - re[0]))
    d_left = abs(float(nose[0] - le[0]))
    denom = d_right + d_left + 1e-5
    yaw_asymmetry = abs(d_right - d_left) / denom
    dx = float(le[0] - re[0])
    dy = float(le[1] - re[1])
    roll_angle = abs(np.degrees(np.arctan2(dy, dx))) if dx != 0 else 90.0
    yaw_score = max(0.0, 100.0 * (1.0 - (yaw_asymmetry * 1.6)))
    roll_score = max(0.0, 100.0 - (roll_angle * 2.0))
    return round(float((0.7 * yaw_score) + (0.3 * roll_score)), 2)

def calculate_quality(img: np.ndarray, box: Dict[str, int], landmarks: np.ndarray, conf: float) -> Dict[str, Any]:
    x, y, w, h = box['x'], box['y'], box['width'], box['height']
    img_h, img_w = img.shape[:2]
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(img_w, x + w), min(img_h, y + h)
    crop = img[y1:y2, x1:x2]

    if crop.size == 0:
        return {
            'face_width': w, 'face_height': h, 'blur_score': 0.0,
            'exposure_score': 0.0, 'pose_score': 0.0, 'quality_score': 0.0,
            'is_high_quality': False
        }

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blur_score = compute_blur_score(gray)
    exposure_score = compute_exposure_score(crop)
    pose_score = compute_pose_score(landmarks)
    size_score = min(100.0, (min(w, h) / 120.0) * 100.0)

    composite = (
        0.30 * blur_score +
        0.25 * pose_score +
        0.20 * exposure_score +
        0.15 * size_score +
        0.10 * (conf * 100.0)
    )
    composite = round(min(100.0, max(0.0, composite)), 2)
    is_high_quality = (w >= 40 and h >= 40 and blur_score >= 35.0 and pose_score >= 35.0)

    return {
        'face_width': int(w),
        'face_height': int(h),
        'blur_score': blur_score,
        'exposure_score': exposure_score,
        'pose_score': pose_score,
        'quality_score': composite,
        'is_high_quality': is_high_quality
    }

def align_and_extract_arcface(img: np.ndarray, landmarks: np.ndarray) -> List[float]:
    """Applies 5-point affine alignment and ArcFace 512D feature extraction."""
    M, _ = cv2.estimateAffinePartial2D(landmarks.astype(np.float32), ARCFACE_REF_PTS)
    if M is None:
        aligned = cv2.resize(img, (112, 112))
    else:
        aligned = cv2.warpAffine(img, M, (112, 112), borderValue=0.0)

    blob = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB).astype(np.float32)
    blob = (blob - 127.5) / 127.5
    blob = np.transpose(blob, (2, 0, 1))[np.newaxis, :]  # 1x3x112x112

    feat = arcface_sess.run(None, {arcface_input_name: blob})[0].flatten()
    norm = np.linalg.norm(feat)
    if norm > 0:
        feat = feat / norm
    return feat.tolist()

def extract_faces_from_image(img: np.ndarray) -> List[Dict[str, Any]]:
    orig_h, orig_w = img.shape[:2]

    # Memory optimization: resize for YuNet detection if large, preventing OOM spikes
    MAX_DET_DIM = 1600
    scale = 1.0
    if max(orig_h, orig_w) > MAX_DET_DIM:
        scale = MAX_DET_DIM / float(max(orig_h, orig_w))
        det_w, det_h = int(orig_w * scale), int(orig_h * scale)
        det_img = cv2.resize(img, (det_w, det_h), interpolation=cv2.INTER_AREA)
    else:
        det_w, det_h = orig_w, orig_h
        det_img = img

    detector.setInputSize((det_w, det_h))
    _, faces = detector.detect(det_img)

    results = []
    if faces is not None:
        for face in faces:
            score = float(face[-1])
            if score < 0.45:
                continue

            if scale != 1.0:
                inv_scale = 1.0 / scale
                x = int(face[0] * inv_scale)
                y = int(face[1] * inv_scale)
                fw = int(face[2] * inv_scale)
                fh = int(face[3] * inv_scale)
                landmarks = (face[4:14].reshape(5, 2) * inv_scale).astype(np.float32)
            else:
                x, y, fw, fh = map(int, face[0:4])
                landmarks = face[4:14].reshape(5, 2).astype(np.float32)

            box = {"x": max(0, x), "y": max(0, y), "width": fw, "height": fh}
            total_area = orig_w * orig_h
            box_area = fw * fh
            box_ratio = float(box_area / total_area) if total_area > 0 else 0.0

            quality = calculate_quality(img, box, landmarks, score)
            embedding_512d = align_and_extract_arcface(img, landmarks)

            results.append({
                "box": box,
                "confidence": score,
                "boxAreaRatio": box_ratio,
                "quality": quality,
                "embedding": embedding_512d
            })

    if det_img is not img:
        del det_img
    return results

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "WedSnap AI Microservice (Tier 2)",
        "models": {
            "detector": "YuNet",
            "recognizer": MODEL_NAME,
            "embedding_dimension": 512,
            "thresholds": {
                "high_confidence": 0.45,
                "suggested": 0.34
            }
        }
    }

class PathExtractRequest(BaseModel):
    filePath: str

@app.post("/extract-embeddings-path")
def extract_embeddings_path(payload: PathExtractRequest):
    """Memory-efficient extraction directly reading from disk path (0-copy HTTP transfer)."""
    try:
        if not os.path.exists(payload.filePath):
            raise HTTPException(status_code=404, detail=f"File not found: {payload.filePath}")

        img = cv2.imread(payload.filePath)
        if img is None:
            raise HTTPException(status_code=400, detail="Could not read image file")

        h, w = img.shape[:2]
        faces_data = extract_faces_from_image(img)
        del img
        gc.collect()

        return {
            "width": w,
            "height": h,
            "faceCount": len(faces_data),
            "faces": faces_data
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/extract-embeddings")
async def extract_embeddings(file: UploadFile = File(...)):
    """Extracts all faces, quality metrics, and 512-dimensional ArcFace embeddings."""
    try:
        contents = await file.read()
        img = decode_image_bytes(contents)
        del contents
        h, w = img.shape[:2]
        faces_data = extract_faces_from_image(img)
        del img
        gc.collect()
        return {
            "width": w,
            "height": h,
            "faceCount": len(faces_data),
            "faces": faces_data
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/match-selfie")
def match_selfie(payload: MatchSelfieRequest):
    """
    Matches guest selfie(s) against candidates using 512D ArcFace embeddings,
    dual-tier thresholds (high confidence >= 0.45, suggested >= 0.34),
    and quality-weighted ranking.
    """
    # Collect all selfie base64 strings
    selfie_inputs = []
    if payload.selfieBase64:
        selfie_inputs.append(payload.selfieBase64)
    if payload.selfieBase64List:
        for s in payload.selfieBase64List:
            if s and s not in selfie_inputs:
                selfie_inputs.append(s)

    if len(selfie_inputs) == 0:
        raise HTTPException(status_code=400, detail="No selfie image provided.")

    query_embeddings = []
    best_conf = 0.0

    for b64 in selfie_inputs:
        try:
            s_img = decode_base64_image(b64)
            detected = extract_faces_from_image(s_img)
            if len(detected) > 0:
                best_face = max(detected, key=lambda f: f["boxAreaRatio"])
                query_embeddings.append(np.array(best_face["embedding"], dtype=np.float32))
                best_conf = max(best_conf, best_face["confidence"])
        except Exception as e:
            continue

    if len(query_embeddings) == 0:
        return {
            "selfieValid": False,
            "error": "No face detected in selfie. Please ensure good lighting and face the camera directly.",
            "matchesFound": 0,
            "matches": []
        }

    # Strategy B: Fused mean vector
    mean_vec = np.mean(query_embeddings, axis=0)
    norm = np.linalg.norm(mean_vec)
    if norm > 0:
        mean_vec = mean_vec / norm

    high_thresh = payload.highThreshold or 0.45
    sugg_thresh = payload.suggestedThreshold or 0.34

    matches_map = {}

    for candidate in payload.candidates:
        cand_vec = np.array(candidate.embedding, dtype=np.float32)
        cand_norm = np.linalg.norm(cand_vec)
        if cand_norm > 0:
            cand_vec = cand_vec / cand_norm

        # Cosine similarity using fused mean vector and max over individual query frames
        sim_mean = float(np.dot(mean_vec, cand_vec))
        sim_max = max([float(np.dot(qv, cand_vec)) for qv in query_embeddings])
        sim = max(sim_mean, sim_max)

        if sim >= sugg_thresh:
            pid = candidate.photoId
            tier = "high_confidence" if sim >= high_thresh else "suggested"
            category = "portrait" if (candidate.boxAreaRatio and candidate.boxAreaRatio >= 0.06) or (candidate.photoFaceCount and candidate.photoFaceCount <= 2) else "group"

            # Composite ranking score: 85% similarity + 15% quality score
            q_score = candidate.qualityScore if candidate.qualityScore is not None else 70.0
            rank_score = (0.85 * sim) + (0.15 * (q_score / 100.0))

            if pid not in matches_map or matches_map[pid]["similarityScore"] < sim:
                matches_map[pid] = {
                    "photoId": pid,
                    "similarityScore": round(sim, 4),
                    "matchTier": tier,
                    "category": category,
                    "compositeRankScore": round(float(rank_score), 4),
                    "qualityScore": q_score
                }

    # Sort descending by compositeRankScore
    ranked_matches = sorted(matches_map.values(), key=lambda m: m["compositeRankScore"], reverse=True)

    high_conf_matches = [m for m in ranked_matches if m["matchTier"] == "high_confidence"]
    suggested_matches = [m for m in ranked_matches if m["matchTier"] == "suggested"]

    return {
        "selfieValid": True,
        "faceDetected": True,
        "selfieConfidence": best_conf,
        "queryFramesProcessed": len(query_embeddings),
        "matchesFound": len(ranked_matches),
        "highConfidenceCount": len(high_conf_matches),
        "suggestedCount": len(suggested_matches),
        "matches": ranked_matches
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
