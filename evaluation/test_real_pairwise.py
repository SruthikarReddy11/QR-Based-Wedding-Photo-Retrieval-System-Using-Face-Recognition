import cv2
import numpy as np
import onnxruntime as ort

REFERENCE_PTS = np.array([
    [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
    [41.5493, 92.3655], [70.7299, 92.2041]
], dtype=np.float32)

detector = cv2.FaceDetectorYN.create('models/face_detection_yunet_2023mar.onnx', '', (320, 320), 0.5)
sface = cv2.FaceRecognizerSF.create('models/face_recognition_sface_2021dec.onnx', '')
arc_r50 = ort.InferenceSession('evaluation/models/buffalo_l/w600k_r50.onnx')
arc_mbf = ort.InferenceSession('evaluation/models/buffalo_sc/w600k_mbf.onnx')

def get_face(path):
    img = cv2.imread(path)
    if img is None: return None, None, None
    h, w = img.shape[:2]
    if max(h, w) > 1200:
        scale = 1200.0 / max(h, w)
        img = cv2.resize(img, (int(w*scale), int(h*scale)))
        h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0:
        return None, None, None
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

def main():
    probe_img, p_raw, p_lms = get_face('evaluation/dataset/real_cross_age/sundar_2023_probe.jpg')
    p_sf, p_r50, p_mbf = extract_features(probe_img, p_raw, p_lms)

    targets = [
        ('Sundar 2021 (2yr gap)', 'evaluation/dataset/real_cross_age/sundar_2021_2yr.png', True),
        ('Sundar 2017 (6yr gap / 5+ yr)', 'evaluation/dataset/real_cross_age/sundar_2017_5yr.jpg', True),
        ('Sundar 2015 (8yr gap)', 'evaluation/dataset/real_cross_age/sundar_2015_8yr.jpg', True),
        ('Satya 2024 (Different person)', 'evaluation/dataset/real_cross_age/satya_2024_probe.jpg', False),
        ('Tim Cook (Different person)', 'evaluation/dataset/real_cross_age/distractor_tim_cook.jpg', False),
        ('Jensen Huang (Different person)', 'evaluation/dataset/real_cross_age/distractor_jensen.jpg', False)
    ]

    print("=" * 90)
    print("REAL CROSS-AGE PAIRWISE SIMILARITY COMPARISON (Probe: Sundar Pichai 2023)")
    print("=" * 90)
    print(f"{'Target Photograph':<32} | {'GroundTruth':<11} | {'SFace (128D)':<16} | {'ArcFace MBF':<12} | {'ArcFace R50'}")
    print("-" * 90)

    for label, path, is_match in targets:
        t_img, t_raw, t_lms = get_face(path)
        if t_img is None or t_raw is None:
            print(f"{label:<32} | Face not detected in {path}")
            continue
        t_sf, t_r50, t_mbf = extract_features(t_img, t_raw, t_lms)

        sim_sf = float(np.dot(p_sf, t_sf))
        sim_mbf = float(np.dot(p_mbf, t_mbf))
        sim_r50 = float(np.dot(p_r50, t_r50))

        # Check pass against production SFace threshold (0.363) vs ArcFace calibrated threshold (0.38)
        sf_status = "PASS (Match)" if sim_sf >= 0.363 else "FAIL (Missed)"
        r50_status = "PASS (Match)" if sim_r50 >= 0.38 else "FAIL (Missed)"

        print(f"{label:<32} | {str(is_match):<11} | {sim_sf:6.4f} ({sf_status:<13}) | {sim_mbf:6.4f}      | {sim_r50:6.4f} ({r50_status})")

    # Repeat for Satya Nadella (2024 probe vs 2021 vs 2018)
    satya_probe, s_raw, s_lms = get_face('evaluation/dataset/real_cross_age/satya_2024_probe.jpg')
    s_sf, s_r50, s_mbf = extract_features(satya_probe, s_raw, s_lms)

    satya_targets = [
        ('Satya 2021 (3yr gap)', 'evaluation/dataset/real_cross_age/satya_2021_3yr.jpg', True),
        ('Satya 2018 (6yr gap / 5+ yr)', 'evaluation/dataset/real_cross_age/satya_2018_6yr.jpg', True),
        ('Sundar 2023 (Different person)', 'evaluation/dataset/real_cross_age/sundar_2023_probe.jpg', False),
    ]

    print("\n" + "=" * 90)
    print("REAL CROSS-AGE PAIRWISE SIMILARITY COMPARISON (Probe: Satya Nadella 2024)")
    print("=" * 90)
    print(f"{'Target Photograph':<32} | {'GroundTruth':<11} | {'SFace (128D)':<16} | {'ArcFace MBF':<12} | {'ArcFace R50'}")
    print("-" * 90)
    for label, path, is_match in satya_targets:
        t_img, t_raw, t_lms = get_face(path)
        t_sf, t_r50, t_mbf = extract_features(t_img, t_raw, t_lms)
        sim_sf = float(np.dot(s_sf, t_sf))
        sim_mbf = float(np.dot(s_mbf, t_mbf))
        sim_r50 = float(np.dot(s_r50, t_r50))

        sf_status = "PASS (Match)" if sim_sf >= 0.363 else "FAIL (Missed)"
        r50_status = "PASS (Match)" if sim_r50 >= 0.38 else "FAIL (Missed)"

        print(f"{label:<32} | {str(is_match):<11} | {sim_sf:6.4f} ({sf_status:<13}) | {sim_mbf:6.4f}      | {sim_r50:6.4f} ({r50_status})")

if __name__ == '__main__':
    main()
