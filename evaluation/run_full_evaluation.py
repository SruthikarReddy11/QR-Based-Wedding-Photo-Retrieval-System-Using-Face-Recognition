import os
import time
import json
import cv2
import numpy as np
import onnxruntime as ort
from typing import List, Dict, Any, Tuple

from face_quality import evaluate_face_quality, FaceQualityConfig
from reranker import apply_quality_aware_ranking, compute_dhash

# Standard ArcFace canonical 5 landmarks for 112x112 chip
ARCFACE_REFERENCE_PTS = np.array([
    [38.2946, 51.6963],  # left eye
    [73.5318, 51.5014],  # right eye
    [56.0252, 71.7366],  # nose
    [41.5493, 92.3655],  # left mouth
    [70.7299, 92.2041]   # right mouth
], dtype=np.float32)

class EvaluationPipeline:
    def __init__(self):
        print("Initializing Evaluation Pipeline...")
        # 1. YuNet Detector (kept constant)
        yunet_path = "models/face_detection_yunet_2023mar.onnx"
        self.detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.5,
            nms_threshold=0.3,
            top_k=5000
        )

        # 2. SFace 128D Baseline
        sface_path = "models/face_recognition_sface_2021dec.onnx"
        self.sface_recognizer = cv2.FaceRecognizerSF.create(model=sface_path, config="")

        # 3. ArcFace ResNet50 (512D)
        arcface_r50_path = "evaluation/models/buffalo_l/w600k_r50.onnx"
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.arcface_r50_sess = ort.InferenceSession(arcface_r50_path, opts, providers=['CPUExecutionProvider'])
        self.arcface_r50_input_name = self.arcface_r50_sess.get_inputs()[0].name

        # 4. ArcFace MobileFaceNet (512D)
        arcface_mbf_path = "evaluation/models/buffalo_sc/w600k_mbf.onnx"
        self.arcface_mbf_sess = ort.InferenceSession(arcface_mbf_path, opts, providers=['CPUExecutionProvider'])
        self.arcface_mbf_input_name = self.arcface_mbf_sess.get_inputs()[0].name

        print("Models loaded successfully:")
        print("  - Detector: YuNet")
        print("  - Baseline Recognizer: SFace (128D)")
        print("  - Candidate 1: ArcFace ResNet-50 (512D)")
        print("  - Candidate 2: ArcFace MobileFaceNet (512D)")

    def detect_faces(self, img: np.ndarray) -> List[Dict[str, Any]]:
        h, w = img.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(img)
        if faces is None or len(faces) == 0:
            return []

        results = []
        for face in faces:
            score = float(face[-1])
            if score < 0.45:
                continue
            x, y, fw, fh = map(int, face[0:4])
            landmarks = face[4:14].reshape(5, 2)
            results.append({
                'box': {'x': max(0, x), 'y': max(0, y), 'width': fw, 'height': fh},
                'landmarks': landmarks,
                'confidence': score,
                'raw_face': face
            })
        return results

    def extract_sface(self, img: np.ndarray, raw_face: np.ndarray) -> Tuple[np.ndarray, float]:
        t0 = time.perf_counter()
        aligned = self.sface_recognizer.alignCrop(img, raw_face)
        feat = self.sface_recognizer.feature(aligned).flatten()
        norm = np.linalg.norm(feat)
        if norm > 0:
            feat = feat / norm
        t1 = time.perf_counter()
        return feat, (t1 - t0) * 1000.0

    def extract_arcface(self, img: np.ndarray, landmarks: np.ndarray, model_type: str = "r50") -> Tuple[np.ndarray, float]:
        t0 = time.perf_counter()
        # 5-point affine transformation to 112x112 canonical space
        M, _ = cv2.estimateAffinePartial2D(landmarks.astype(np.float32), ARCFACE_REFERENCE_PTS)
        if M is None:
            aligned = cv2.resize(img, (112, 112))
        else:
            aligned = cv2.warpAffine(img, M, (112, 112), borderValue=0.0)

        # Standard ArcFace RGB normalization: (pixel - 127.5) / 127.5
        blob = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB).astype(np.float32)
        blob = (blob - 127.5) / 127.5
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis, :]  # 1x3x112x112

        sess = self.arcface_r50_sess if model_type == "r50" else self.arcface_mbf_sess
        inp_name = self.arcface_r50_input_name if model_type == "r50" else self.arcface_mbf_input_name
        feat = sess.run(None, {inp_name: blob})[0].flatten()

        norm = np.linalg.norm(feat)
        if norm > 0:
            feat = feat / norm
        t1 = time.perf_counter()
        return feat, (t1 - t0) * 1000.0

# ----------------- BENCHMARK DATASET SETUP -----------------
def load_and_index_dataset(pipeline: EvaluationPipeline):
    """Indexes all images in evaluation/dataset/ and extracts quality & embeddings."""
    with open("evaluation/dataset/manifest.json", "r") as f:
        manifest = json.load(f)

    # Also include the challenges we generated
    extra_items = [
        {"subject_id": "subject_1_cross_age", "label": "variant_low_res", "file_path": "evaluation/dataset/subject_1_cross_age/variant_low_res.jpg", "type": "gallery", "description": "Low-resolution 35px face"},
        {"subject_id": "subject_1_cross_age", "label": "variant_blurred", "file_path": "evaluation/dataset/subject_1_cross_age/variant_blurred.jpg", "type": "gallery", "description": "Motion-blurred face"},
        {"subject_id": "subject_1_cross_age", "label": "variant_group_photo", "file_path": "evaluation/dataset/subject_1_cross_age/variant_group_photo.jpg", "type": "gallery", "description": "Multi-person group photo"}
    ]
    for item in extra_items:
        if os.path.exists(item["file_path"]):
            manifest.append(item)

    indexed_records = []
    print(f"\nProcessing and indexing {len(manifest)} benchmark images...")

    for item in manifest:
        path = item["file_path"]
        if not os.path.exists(path):
            continue
        img = cv2.imread(path)
        if img is None:
            continue

        faces = pipeline.detect_faces(img)
        dhash = compute_dhash(img)

        for i, face_data in enumerate(faces):
            box = face_data['box']
            lms = face_data['landmarks']
            conf = face_data['confidence']
            raw_face = face_data['raw_face']

            # Face quality metrics
            quality = evaluate_face_quality(img, box, lms, conf)

            # SFace embedding
            sface_vec, sface_time = pipeline.extract_sface(img, raw_face)

            # ArcFace R50 embedding
            arc_r50_vec, r50_time = pipeline.extract_arcface(img, lms, model_type="r50")

            # ArcFace MBF embedding
            arc_mbf_vec, mbf_time = pipeline.extract_arcface(img, lms, model_type="mbf")

            indexed_records.append({
                'record_id': f"{item['label']}_face_{i}",
                'subject_id': item['subject_id'],
                'label': item['label'],
                'type': item['type'],
                'year_offset': item.get('year_offset'),
                'description': item['description'],
                'file_path': path,
                'dhash': dhash,
                'quality': quality,
                'sface_vec': sface_vec,
                'arc_r50_vec': arc_r50_vec,
                'arc_mbf_vec': arc_mbf_vec,
                'times': {'sface': sface_time, 'arc_r50': r50_time, 'arc_mbf': mbf_time}
            })

    print(f"Indexed {len(indexed_records)} face detections across the benchmark.")
    return indexed_records

# ----------------- EVALUATION FUNCTIONS -----------------
def run_evaluation():
    pipeline = EvaluationPipeline()
    records = load_and_index_dataset(pipeline)

    # Split into probe (selfies) and gallery (wedding photos & distractors)
    probes = [r for r in records if r['type'] == 'probe_selfie']
    gallery = [r for r in records if r['type'] != 'probe_selfie']

    print(f"\nBenchmark Composition: {len(probes)} Probe Selfies, {len(gallery)} Gallery Photos.")

    # STEP 5: Calibration - Compute all pairwise similarities for Positive and Negative pairs
    print("\n--- STEP 5: Threshold Calibration (Evaluating 0 to 5-year gaps vs Distractors) ---")
    pos_pairs_sface = {0: [], 1: [], 2: [], 3: [], 4: [], 5: []}
    pos_pairs_arc = {0: [], 1: [], 2: [], 3: [], 4: [], 5: []}
    neg_pairs_sface = []
    neg_pairs_arc = []

    for p in probes:
        for g in gallery:
            # Positive match if same subject
            is_match = (p['subject_id'] == g['subject_id'])
            sface_sim = float(np.dot(p['sface_vec'], g['sface_vec']))
            arc_sim = float(np.dot(p['arc_r50_vec'], g['arc_r50_vec']))

            if is_match:
                y = g.get('year_offset', 0)
                if y is None: y = 0
                if y in pos_pairs_sface:
                    pos_pairs_sface[y].append(sface_sim)
                    pos_pairs_arc[y].append(arc_sim)
            else:
                neg_pairs_sface.append(sface_sim)
                neg_pairs_arc[y if (y := g.get('year_offset', 0)) else 0] if False else neg_pairs_arc.append(arc_sim)

    print("\nSimilarity Progression Across Age Gaps:")
    print(" Age Gap | SFace (128D) Mean Cosine | ArcFace R50 (512D) Mean Cosine")
    print("----------------------------------------------------------------------")
    for y in range(6):
        sf_m = np.mean(pos_pairs_sface[y]) if len(pos_pairs_sface[y]) > 0 else 0.0
        ar_m = np.mean(pos_pairs_arc[y]) if len(pos_pairs_arc[y]) > 0 else 0.0
        print(f" {y}-year  | {sf_m:.4f}                   | {ar_m:.4f}")

    print(f" Negative| {np.mean(neg_pairs_sface):.4f} (Max: {max(neg_pairs_sface):.4f})      | {np.mean(neg_pairs_arc):.4f} (Max: {max(neg_pairs_arc):.4f})")

    # Threshold calibration sweep for ArcFace
    best_arc_thresh = 0.40
    best_f1 = 0
    all_pos = [s for sublist in pos_pairs_arc.values() for s in sublist]
    print("\nThreshold Sweep on ArcFace (FAR vs Recall):")
    for th in [0.30, 0.35, 0.38, 0.40, 0.42, 0.45, 0.50]:
        far = np.mean([s >= th for s in neg_pairs_arc]) * 100
        frr = np.mean([s < th for s in all_pos]) * 100
        rec = 100.0 - frr
        prec = (np.sum([s >= th for s in all_pos]) / (np.sum([s >= th for s in all_pos]) + np.sum([s >= th for s in neg_pairs_arc]))) * 100 if (np.sum([s >= th for s in all_pos]) + np.sum([s >= th for s in neg_pairs_arc])) > 0 else 0
        f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0
        if f1 > best_f1:
            best_f1 = f1
            best_arc_thresh = th
        print(f"  Thresh: {th:.2f} -> FAR: {far:5.1f}% | FRR: {frr:5.1f}% | Precision: {prec:5.1f}% | Recall: {rec:5.1f}% | F1: {f1:5.1f}%")

    print(f"\nCalibrated Optimal Threshold for ArcFace: {best_arc_thresh:.2f}")

    # ----------------- STEP 1 to 7 BENCHMARK SUITE -----------------
    configs = [
        ("Current SFace Baseline", "sface", 0.363, False, "single", False),
        ("New ArcFace R50", "arc_r50", best_arc_thresh, False, "single", False),
        ("ArcFace + Quality Filtering", "arc_r50", best_arc_thresh, True, "single", False),
        ("ArcFace + Multi-Selfie (Strategy A: Max)", "arc_r50", best_arc_thresh, False, "multi_max", False),
        ("ArcFace + Multi-Selfie (Strategy B: Fused Mean)", "arc_r50", best_arc_thresh, False, "multi_mean", False),
        ("ArcFace + Quality + Multi-Selfie + ReRank", "arc_r50", best_arc_thresh, True, "multi_max", True)
    ]

    results_table = []

    for name, model_key, threshold, use_quality, selfie_mode, use_rerank in configs:
        correct_matches = 0
        false_matches = 0
        missed_matches = 0
        total_queries = 0
        top1_hits = 0
        top5_hits = 0
        age_4_5_total = 0
        age_4_5_correct = 0
        inference_times = []

        for probe in probes:
            total_queries += 1
            probe_subj = probe['subject_id']

            # Query vector formulation
            if "multi" in selfie_mode:
                # Use standard probe + variation smile/event as multi-selfie query
                sibling_probes = [r for r in records if r['subject_id'] == probe_subj and 'selfie' in r['label'] or 'smile' in r['label']]
                if len(sibling_probes) == 0:
                    sibling_probes = [probe]
                
                query_vecs = [sp[f"{model_key}_vec"] for sp in sibling_probes]
                if selfie_mode == "multi_mean":
                    fused = np.mean(query_vecs, axis=0)
                    fused_norm = np.linalg.norm(fused)
                    query_vec = fused / fused_norm if fused_norm > 0 else fused
                else:
                    query_vec = query_vecs  # list for Strategy A (max)
            else:
                query_vec = probe[f"{model_key}_vec"]

            # Score each candidate in gallery
            scored_candidates = []
            for g in gallery:
                # Quality filter check
                if use_quality:
                    q = g['quality']
                    if not q['is_high_quality'] and q['quality_score'] < 35.0:
                        continue  # Skip degraded candidate

                cand_vec = g[f"{model_key}_vec"]
                inference_times.append(g['times']['sface' if model_key == 'sface' else 'arc_r50'])

                if isinstance(query_vec, list):
                    # Strategy A: max similarity across query embeddings
                    sim = max([float(np.dot(qv, cand_vec)) for qv in query_vec])
                else:
                    sim = float(np.dot(query_vec, cand_vec))

                is_gt_match = (g['subject_id'] == probe_subj)
                is_above_thresh = (sim >= threshold)

                scored_candidates.append({
                    'record_id': g['record_id'],
                    'file_path': g['file_path'],
                    'dhash': g['dhash'],
                    'similarity': sim,
                    'is_gt_match': is_gt_match,
                    'year_offset': g.get('year_offset'),
                    'quality_score': g['quality']['quality_score'],
                    'blur_score': g['quality']['blur_score'],
                    'face_width': g['quality']['face_width']
                })

                # Age 4-5 check
                y = g.get('year_offset')
                if y in [4, 5] and is_gt_match:
                    age_4_5_total += 1
                    if is_above_thresh:
                        age_4_5_correct += 1

                # Ground truth accounting
                if is_above_thresh and is_gt_match:
                    correct_matches += 1
                elif is_above_thresh and not is_gt_match:
                    false_matches += 1
                elif not is_above_thresh and is_gt_match:
                    missed_matches += 1

            # Re-ranking & Top-1 / Top-5
            if use_rerank:
                ranked = apply_quality_aware_ranking(scored_candidates)
            else:
                ranked = sorted(scored_candidates, key=lambda c: c['similarity'], reverse=True)

            if len(ranked) > 0 and ranked[0]['is_gt_match']:
                top1_hits += 1
            if any(r['is_gt_match'] for r in ranked[:5]):
                top5_hits += 1

        precision = (correct_matches / (correct_matches + false_matches)) * 100.0 if (correct_matches + false_matches) > 0 else 0.0
        recall = (correct_matches / (correct_matches + missed_matches)) * 100.0 if (correct_matches + missed_matches) > 0 else 0.0
        top1_acc = (top1_hits / total_queries) * 100.0 if total_queries > 0 else 0.0
        top5_acc = (top5_hits / total_queries) * 100.0 if total_queries > 0 else 0.0
        age_4_5_rate = (age_4_5_correct / age_4_5_total) * 100.0 if age_4_5_total > 0 else 0.0
        avg_infer_time = float(np.mean(inference_times)) if len(inference_times) > 0 else 0.0

        results_table.append({
            "Configuration": name,
            "Precision": f"{precision:.1f}%",
            "Recall": f"{recall:.1f}%",
            "Top-1": f"{top1_acc:.1f}%",
            "Top-5": f"{top5_acc:.1f}%",
            "FP": false_matches,
            "FN": missed_matches,
            "4–5 Yr Recall": f"{age_4_5_rate:.1f}%",
            "Avg Infer Time": f"{avg_infer_time:.1f}ms"
        })

    # Save summary report to JSON
    report_path = "evaluation/benchmark_results.json"
    with open(report_path, "w") as f:
        json.dump(results_table, f, indent=2)

    print("\n" + "="*95)
    print(f"{'CONFIGURATION':<42} | {'PREC':<6} | {'REC':<6} | {'TOP1':<6} | {'TOP5':<6} | {'FP':<3} | {'FN':<3} | {'4-5YR':<6} | {'LATENCY'}")
    print("="*95)
    for r in results_table:
        print(f"{r['Configuration']:<42} | {r['Precision']:<6} | {r['Recall']:<6} | {r['Top-1']:<6} | {r['Top-5']:<6} | {r['FP']:<3} | {r['FN']:<3} | {r['4–5 Yr Recall']:<6} | {r['Avg Infer Time']}")
    print("="*95)

if __name__ == "__main__":
    run_evaluation()
