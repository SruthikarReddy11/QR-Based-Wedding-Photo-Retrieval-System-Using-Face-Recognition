import requests
import json
import base64
import os
import sys

def main():
    print("=" * 80)
    print("TESTING TIER 2: 512D ARCFACE PIPELINE & DUAL-TIER MATCHING")
    print("=" * 80)

    # 1. Health check on AI Microservice
    health_res = requests.get('http://localhost:8000/health')
    assert health_res.status_code == 200, f"AI Health check failed: {health_res.text}"
    health_data = health_res.json()
    print("[PASS] AI Service is healthy:")
    print(f"       Recognizer: {health_data['models']['recognizer']}")
    print(f"       Embedding Dimension: {health_data['models']['embedding_dimension']}")
    print(f"       Thresholds: {health_data['models']['thresholds']}")
    assert health_data['models']['embedding_dimension'] == 512

    # 2. Register/Login Photographer
    creds = {
        'fullName': 'Tier 2 Tester',
        'email': 'tier2_test@photography.com',
        'password': 'securePassword2026',
        'studioName': 'Tier2 Studios'
    }
    reg_res = requests.post('http://localhost:5000/api/v1/auth/register', json=creds)
    if reg_res.status_code == 201:
        token = reg_res.json()['token']
        print("[PASS] Registered new test photographer.")
    else:
        login_res = requests.post('http://localhost:5000/api/v1/auth/login', json={'email': creds['email'], 'password': creds['password']})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()['token']
        print("[PASS] Logged in successfully.")

    headers = {'Authorization': f'Bearer {token}'}

    # 3. Create a Wedding Event
    event_payload = {
        'coupleNames': 'Sundar & Ananya Tier 2 Wedding',
        'eventDate': '2026-10-15',
        'venueCity': 'Hyderabad',
        'venueName': 'Taj Falaknuma'
    }
    create_res = requests.post('http://localhost:5000/api/v1/events', json=event_payload, headers=headers)
    assert create_res.status_code == 201, f"Failed to create event: {create_res.text}"
    event = create_res.json()
    event_id = event['id']
    slug = event['slug']
    print(f"[PASS] Created event '{event['coupleNames']}' (slug: {slug})")

    # 4. Upload gallery photos (spanning 2015, 2021, and distractors)
    test_photos = [
        ('sundar_2021.png', 'evaluation/dataset/real_cross_age/sundar_2021_2yr.png'),
        ('sundar_2015_8yr.jpg', 'evaluation/dataset/real_cross_age/sundar_2015_8yr.jpg'),
        ('distractor_tim.jpg', 'evaluation/dataset/real_cross_age/distractor_tim_cook.jpg')
    ]

    files_to_upload = []
    for label, file_path in test_photos:
        if os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                files_to_upload.append(('photos', (label, f.read(), 'image/jpeg')))

    assert len(files_to_upload) > 0, "No test photos found to upload!"

    upload_res = requests.post(f'http://localhost:5000/api/v1/events/{event_id}/photos', files=files_to_upload, headers=headers)
    assert upload_res.status_code in (200, 201), f"Photo upload failed: {upload_res.text}"
    upload_data = upload_res.json()
    print(f"[PASS] Uploaded {len(upload_data['photos'])} photos. Faces detected & indexed: {upload_data['totalFacesDetected']}")

    # 5. Guest Search with 2023 Probe Selfie (8-year age gap test!)
    probe_path = 'evaluation/dataset/real_cross_age/sundar_2023_probe.jpg'
    assert os.path.exists(probe_path), f"Probe photo missing: {probe_path}"

    with open(probe_path, 'rb') as f:
        selfie_b64 = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('utf-8')

    print(f"[INFO] Executing guest search using 2023 probe selfie against wedding gallery...")
    search_res = requests.post(f'http://localhost:5000/api/v1/public/events/{slug}/search', json={'selfieBase64': selfie_b64})
    assert search_res.status_code == 200, f"Search request failed: {search_res.text}"
    search_data = search_res.json()

    print("\n[RESULT] Guest Search Output:")
    print(f"  Selfie Valid: {search_data.get('selfieValid')}")
    print(f"  Matches Found: {search_data.get('matchesFound')}")
    print(f"  High Confidence Matches: {search_data.get('highConfidenceCount')}")
    print(f"  Suggested Matches: {search_data.get('suggestedCount')}")
    print(f"  Latency: {search_data.get('executionTimeMs')} ms")

    for i, match in enumerate(search_data.get('matches', [])):
        print(f"   Match {i+1}: file={match['fileName']}, similarity={match['similarityScore']}, tier={match['matchTier']}, category={match['category']}")

    # Assertions
    assert search_data['matchesFound'] >= 2, f"Expected at least 2 matches for Sundar, got {search_data['matchesFound']}"
    # Confirm distractor was NOT matched
    matched_filenames = [m['fileName'] for m in search_data['matches']]
    assert 'distractor_tim.jpg' not in matched_filenames, "False positive! Distractor was incorrectly matched!"
    print("\n[PASS] Verified zero false positives: Distractor Tim Cook was rejected!")

    print("\n" + "=" * 80)
    print("SUCCESS: TIER 2 PIPELINE (512D ARCFACE + DUAL THRESHOLDS) VERIFIED 100%!")
    print("=" * 80)

if __name__ == '__main__':
    main()
