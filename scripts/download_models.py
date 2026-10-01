import os
import urllib.request
import zipfile
import shutil

MODELS_DIR = os.environ.get('MODELS_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'models')))
os.makedirs(MODELS_DIR, exist_ok=True)

def download_file(url: str, dest_path: str):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        import requests
        with requests.get(url, headers=headers, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(dest_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)
    except Exception as e:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest_path, 'wb') as out_f:
            shutil.copyfileobj(resp, out_f)

# 1. Ensure YuNet 5-landmark face detector is present
yunet_path = os.path.join(MODELS_DIR, 'face_detection_yunet_2023mar.onnx')
if not os.path.exists(yunet_path) or os.path.getsize(yunet_path) < 100000:
    print(f"Downloading YuNet face detector to {yunet_path}...")
    yunet_url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
    download_file(yunet_url, yunet_path)
    print(f"[OK] YuNet face detector ready ({os.path.getsize(yunet_path)} bytes).")
else:
    print(f"[OK] YuNet face detector already present ({os.path.getsize(yunet_path)} bytes).")

# 2. Ensure ArcFace 512D model is present (ResNet-50 or MobileFaceNet)
r50_path = os.path.join(MODELS_DIR, 'face_recognition_arcface_r50_512d.onnx')
mbf_path = os.path.join(MODELS_DIR, 'face_recognition_arcface_mbf_512d.onnx')

if not os.path.exists(r50_path) and not os.path.exists(mbf_path):
    print("Downloading ArcFace 512D deep model (InsightFace buffalo_sc)...")
    sc_zip = os.path.join(MODELS_DIR, 'buffalo_sc.zip')
    sc_url = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip'
    download_file(sc_url, sc_zip)
    with zipfile.ZipFile(sc_zip, 'r') as zf:
        zf.extract('w600k_mbf.onnx', MODELS_DIR)
    extracted_mbf = os.path.join(MODELS_DIR, 'w600k_mbf.onnx')
    shutil.move(extracted_mbf, mbf_path)
    if os.path.exists(sc_zip):
        os.remove(sc_zip)
    print(f"[OK] ArcFace 512D model ready ({os.path.getsize(mbf_path)} bytes).")
else:
    active_path = r50_path if os.path.exists(r50_path) else mbf_path
    print(f"[OK] ArcFace 512D model already present ({os.path.basename(active_path)} - {os.path.getsize(active_path)} bytes).")

print("All AI vision models verified.")
