import urllib.request
import requests
import json
import base64
import os

print("--- Testing Real End-to-End Face Detection & Retrieval ---")

# 1. Download a real test portrait face
sample_photo_path = 'models/test_wedding_guest.jpg'
face_url = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80'
urllib.request.urlretrieve(face_url, sample_photo_path)
print(f"Sample test photo downloaded ({os.path.getsize(sample_photo_path)} bytes).")

# 1. Login to get real valid JWT
login_res = requests.post('http://localhost:5000/api/v1/auth/login', json={'email': 'sai@photography.com', 'password': 'securePassword2026'})
token = login_res.json()['token']
headers = {'Authorization': f'Bearer {token}'}
print(f"Logged in successfully. Valid JWT obtained.")

# 2. Upload photo to event
event_id = 'event_1790853183074'
slug = 'karthik-pooja-295'

with open(sample_photo_path, 'rb') as f:
    files = {'photos': ('guest_man.jpg', f, 'image/jpeg')}
    upload_res = requests.post(f'http://localhost:5000/api/v1/events/{event_id}/photos', files=files, headers=headers)

print(f"Upload Response Status: {upload_res.status_code}")
upload_data = upload_res.json()
print("Upload Result:", json.dumps(upload_data, indent=2))

# 3. Simulate Guest Selfie Search with the same face
with open(sample_photo_path, 'rb') as f:
    b64_selfie = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('utf-8')

search_res = requests.post(
    f'http://localhost:5000/api/v1/public/events/{slug}/search',
    json={'selfieBase64': b64_selfie}
)

print(f"\nGuest Selfie Search Status: {search_res.status_code}")
search_data = search_res.json()
print("Guest Match Result:", json.dumps(search_data, indent=2))
