import requests
import json
import os
import sys

def main():
    print("[TEST] Testing Full Real Deletion Flow (Photo + Event)...")
    
    # 1. Register or Login
    user_cred = {
        'fullName': 'Sai Photographer',
        'email': 'sai_test_del@photography.com',
        'password': 'securePassword2026',
        'studioName': 'Sai Captures'
    }
    reg_res = requests.post('http://localhost:5000/api/v1/auth/register', json=user_cred)
    if reg_res.status_code == 201:
        token = reg_res.json()['token']
        print("[PASS] Registered new photographer account.")
    else:
        login_res = requests.post(
            'http://localhost:5000/api/v1/auth/login',
            json={'email': user_cred['email'], 'password': user_cred['password']}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()['token']
        print("[PASS] Logged in successfully.")

    headers = {'Authorization': f'Bearer {token}'}

    # 2. Create a test event
    event_payload = {
        'coupleNames': 'Vikram & Neha Deletion Test',
        'eventDate': '2026-11-20',
        'venueCity': 'Goa',
        'venueName': 'Taj Exotica'
    }
    create_res = requests.post('http://localhost:5000/api/v1/events', json=event_payload, headers=headers)
    assert create_res.status_code == 201, f"Create event failed: {create_res.text}"
    event_data = create_res.json()
    event_id = event_data['id']
    print(f"[PASS] Created test event: {event_id} ({event_data['coupleNames']})")

    # 3. Upload 2 photos
    sample_photo = 'models/test_wedding_guest.jpg'
    assert os.path.exists(sample_photo), "Sample photo not found"

    with open(sample_photo, 'rb') as f1, open(sample_photo, 'rb') as f2:
        files = [
            ('photos', ('photo_1.jpg', f1.read(), 'image/jpeg')),
            ('photos', ('photo_2.jpg', f2.read(), 'image/jpeg'))
        ]
        upload_res = requests.post(
            f'http://localhost:5000/api/v1/events/{event_id}/photos',
            files=files,
            headers=headers
        )
    
    assert upload_res.status_code in (200, 201), f"Upload failed: {upload_res.text}"
    photos_uploaded = upload_res.json()['photos']
    print(f"[PASS] Uploaded {len(photos_uploaded)} photos successfully.")
    assert len(photos_uploaded) == 2, f"Expected 2 photos, got {len(photos_uploaded)}"

    # 4. Check photos on disk
    photo1 = photos_uploaded[0]
    photo2 = photos_uploaded[1]
    
    # Path inside uploads folder
    event_dir = os.path.join(os.getcwd(), 'uploads', event_id)
    photo1_filename = os.path.basename(photo1['url'])
    photo1_disk_path = os.path.join(event_dir, photo1_filename)
    
    assert os.path.exists(event_dir), f"Event directory {event_dir} should exist"
    assert os.path.exists(photo1_disk_path), f"Photo 1 on disk {photo1_disk_path} should exist"
    print(f"[PASS] Verified photo file exists on disk: {photo1_filename}")

    # 5. Delete Photo 1
    print(f"[INFO] Deleting photo {photo1['id']}...")
    del_photo_res = requests.delete(
        f'http://localhost:5000/api/v1/events/{event_id}/photos/{photo1["id"]}',
        headers=headers
    )
    assert del_photo_res.status_code == 200, f"Delete photo failed: {del_photo_res.text}"
    print(f"[PASS] Delete photo API returned 200 OK: {del_photo_res.json()['message']}")

    # 6. Verify photo 1 file is deleted from disk
    assert not os.path.exists(photo1_disk_path), f"File {photo1_disk_path} should be deleted from disk!"
    print(f"[PASS] Verified photo file physically deleted from disk.")

    # 7. Check photo listing now only has 1 photo
    list_res = requests.get(f'http://localhost:5000/api/v1/events/{event_id}/photos', headers=headers)
    assert list_res.status_code == 200
    current_photos = list_res.json()
    assert len(current_photos) == 1, f"Expected 1 photo remaining, got {len(current_photos)}"
    assert current_photos[0]['id'] == photo2['id'], "Remaining photo should be photo 2"
    print(f"[PASS] Photo listing correctly reports 1 remaining photo.")

    # 8. Delete the entire Event
    print(f"[INFO] Deleting event {event_id}...")
    del_event_res = requests.delete(f'http://localhost:5000/api/v1/events/{event_id}', headers=headers)
    assert del_event_res.status_code == 200, f"Delete event failed: {del_event_res.text}"
    print(f"[PASS] Delete event API returned 200 OK: {del_event_res.json()['message']}")

    # 9. Verify event directory is removed from disk
    assert not os.path.exists(event_dir), f"Event directory {event_dir} should be deleted!"
    print(f"[PASS] Verified entire event upload folder physically purged from disk.")

    # 10. Verify event fetch now returns 404
    get_event_res = requests.get(f'http://localhost:5000/api/v1/events/{event_id}', headers=headers)
    assert get_event_res.status_code == 404, f"Expected 404 for deleted event, got {get_event_res.status_code}"
    print(f"[PASS] Event lookup confirmed 404 Not Found.")

    print("\n[SUCCESS] ALL PHOTO AND EVENT DELETION TESTS PASSED COMPLETELY!")

if __name__ == '__main__':
    main()
