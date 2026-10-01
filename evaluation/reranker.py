import cv2
import numpy as np
from typing import List, Dict, Any

def compute_dhash(img: np.ndarray, hash_size: int = 8) -> int:
    """
    Computes 64-bit difference hash (dHash) for fast near-duplicate detection.
    Very robust to slight compression, noise, and burst photography.
    """
    if img is None:
        return 0
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    
    hash_val = 0
    for bit in diff.flatten():
        hash_val = (hash_val << 1) | int(bit)
    return hash_val

def hamming_distance(h1: int, h2: int) -> int:
    """Counts differing bits between two 64-bit hashes."""
    return bin(h1 ^ h2).count('1')

def deduplicate_photos(
    candidates: List[Dict[str, Any]],
    distance_threshold: int = 5
) -> List[Dict[str, Any]]:
    """
    Removes near-duplicate photos (e.g. burst shots taken 1 second apart).
    Retains the higher-similarity / higher-quality photo among duplicates.
    """
    if len(candidates) <= 1:
        return candidates

    unique_results = []
    seen_hashes: List[int] = []

    for item in candidates:
        photo_hash = item.get('dhash')
        if photo_hash is None:
            # If hash not precomputed, compute from image path if available
            img_path = item.get('file_path')
            if img_path:
                img = cv2.imread(img_path)
                photo_hash = compute_dhash(img)
                item['dhash'] = photo_hash
            else:
                photo_hash = 0

        is_duplicate = False
        for sh in seen_hashes:
            if hamming_distance(photo_hash, sh) <= distance_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            seen_hashes.append(photo_hash)
            unique_results.append(item)

    return unique_results

def apply_quality_aware_ranking(
    candidates: List[Dict[str, Any]],
    alpha: float = 0.85,
    dedup_hamming_threshold: int = 5
) -> List[Dict[str, Any]]:
    """
    Ranks candidates using combined identity similarity and face quality score,
    followed by near-duplicate suppression.
    
    Rank Score = alpha * CosineSimilarity + (1 - alpha) * (QualityScore / 100)
    """
    scored = []
    for cand in candidates:
        sim = float(cand.get('similarity', 0.0))
        quality = float(cand.get('quality_score', 70.0))
        
        # Penalize if severely degraded
        penalty = 0.0
        if cand.get('blur_score', 50.0) < 20.0:
            penalty += 0.05
        if cand.get('face_width', 100) < 35:
            penalty += 0.05

        composite_rank = (alpha * sim) + ((1.0 - alpha) * (quality / 100.0)) - penalty
        cand_copy = dict(cand)
        cand_copy['composite_rank_score'] = round(float(composite_rank), 4)
        scored.append(cand_copy)

    # Sort descending by composite rank score
    sorted_candidates = sorted(scored, key=lambda c: c['composite_rank_score'], reverse=True)

    # Apply near-duplicate removal
    final_ranked = deduplicate_photos(sorted_candidates, distance_threshold=dedup_hamming_threshold)
    return final_ranked
