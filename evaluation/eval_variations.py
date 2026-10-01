import cv2
import numpy as np
import onnxruntime as ort
import os

REFERENCE_PTS = np.array([
    [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
    [41.5493, 92.3655], [70.7299, 92.2041]
], dtype=np.float32)

detector = cv2.FaceDetectorYN.create('models/face_detection_yunet_2023mar.onnx', '', (320, 320), 0.4)
sface = cv2.FaceRecognizerSF.create('models/face_recognition_sface_2021dec.onnx', '')
arc_r50 = ort.InferenceSession('evaluation/models/buffalo_l/w600k_r50.onnx')
arc_mbf = ort.InferenceSession('evaluation/models/buffalo_sc/w600k_mbf.onnx')

def get_face(path):
    img = cv2.imread(path)
    if img is None: return None, None, None
    h, w = img.shape[:2]
    if max(h, w) > 1000:
        s = 1000.0 / max(h, w)
        img = cv2.resize(img, (int(w*s), int(h*s)))
        h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0: return None, None, None
    face = max(faces, key=lambda f: f[2]*f[3])
    raw = face
    lms = face[4:14].reshape(5, 2)
    return img, raw, lms

def extract_features(img, raw, lms):
    # SFace
    al_sf = sface.alignCrop(img, raw)
    f_sf = sface.feature(al_sf).flatten()
    f_sf = f_sf / np.linalg.norm(f_sf)

    # ArcFace
    M, _ = cv2.estimateAffinePartial2D(lms.astype(np.float32), REFERENCE_PTS)
    al_arc = cv2.warpAffine(img, M, (112, 112)) if M is not None else cv2.resize(img, (112, 112))
    blob = cv2.cvtColor(al_arc, cv2.COLOR_BGR2RGB).astype(np.float32)
    blob = (blob - 127.5) / 127.5
    blob = np.transpose(blob, (2, 0, 1))[np.newaxis, :]

    f_r50 = arc_r50.run(None, {arc_r50.get_inputs()[0].name: blob})[0].flatten()
    f_r50 = f_r50 / np.linalg.norm(f_r50)

    f_mbf = arc_mbf.run(None, {arc_mbf.get_inputs()[0].name: blob})[0].flatten()
    f_mbf = f_mbf / np.linalg.norm(f_mbf)

    return f_sf, f_r50, f_mbf

def run():
    probe_img, p_raw, p_lms = get_face('evaluation/dataset/subject_2_variations/selfie_standard.jpg')
    p_sf, p_r50, p_mbf = extract_features(probe_img, p_raw, p_lms)

    test_cases = [
        ("Base Reference (0-yr)", "evaluation/dataset/subject_2_variations/selfie_standard.jpg", True),
        ("Expression (Smiling)", "evaluation/dataset/subject_2_variations/variation_smile.jpg", True),
        ("Glasses / Eyewear", "evaluation/dataset/subject_2_variations/variation_glasses.jpg", True),
        ("Pose Angle (30° Yaw)", "evaluation/dataset/subject_2_variations/variation_pose_angle.jpg", True),
        ("Lighting (Dim / Dusk)", "evaluation/dataset/subject_2_variations/variation_dim_lighting.jpg", True),
        ("Low-Resolution (Downscaled)", "evaluation/dataset/subject_1_cross_age/variant_low_res.jpg", False), # distractor/diff person
        ("Different Person (Distractor 1)", "evaluation/dataset/distractors_negative/distractor_1.jpg", False),
        ("Different Person (Distractor 2)", "evaluation/dataset/distractors_negative/distractor_2.jpg", False)
    ]

    print("=" * 85)
    print("ATTRIBUTE VARIATION BENCHMARK (Pose, Lighting, Glasses, Expression)")
    print("=" * 85)
    print(f"{'Condition':<28} | {'GroundTruth':<11} | {'SFace':<8} | {'ArcFace MBF':<12} | {'ArcFace R50'}")
    print("-" * 85)

    for label, path, is_match in test_cases:
        t_img, t_raw, t_lms = get_face(path)
        if t_img is None:
            print(f"{label:<28} | [Face Not Detected]")
            continue
        t_sf, t_r50, t_mbf = extract_features(t_img, t_raw, t_lms)

        sim_sf = float(np.dot(p_sf, t_sf))
        sim_mbf = float(np.dot(p_mbf, t_mbf))
        sim_r50 = float(np.dot(p_r50, t_r50))

        print(f"{label:<28} | {str(is_match):<11} | {sim_sf:6.4f}   | {sim_mbf:6.4f}       | {sim_r50:6.4f}")

if __name__ == '__main__':
    run()
