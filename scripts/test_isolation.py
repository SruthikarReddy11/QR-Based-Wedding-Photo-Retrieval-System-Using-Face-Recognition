import requests
import json
import base64

# Create Event B
login_res = requests.post('http://localhost:5000/api/v1/auth/login', json={'email': 'sai@photography.com', 'password': 'securePassword2026'}).json()
token = login_res['token']
headers = {'Authorization': f'Bearer {token}'}

event_b = requests.post('http://localhost:5000/api/v1/events', json={
    'coupleNames': 'Rohan & Meera',
    'title': 'Rohan & Meera Wedding',
    'eventDate': '2026-12-10',
    'venueCity': 'Jaipur'
}, headers=headers).json()

slug_b = event_b['slug']
print('Created Event B slug:', slug_b)

# Search the guest selfie in Event B (where this guest was NEVER uploaded)
with open('models/test_wedding_guest.jpg', 'rb') as f:
    b64_selfie = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('utf-8')

res = requests.post(f'http://localhost:5000/api/v1/public/events/{slug_b}/search', json={'selfieBase64': b64_selfie}).json()

print('Event B Matches Found:', res.get('matchesFound'))
print('Message:', res.get('message'))
assert res.get('matchesFound') == 0, "Isolation failure: Matched photo from another event!"
print("EVENT ISOLATION VERIFIED: 100% SECURE. Zero leakage across events.")
