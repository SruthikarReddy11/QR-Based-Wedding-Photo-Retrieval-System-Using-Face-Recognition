import urllib.request
import zipfile
import os
import sys

def download_file(url, dest_path):
    print(f"Downloading from {url} to {dest_path}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, 'wb') as f:
        total_size = int(resp.headers.get('content-length', 0))
        downloaded = 0
        block_size = 1024 * 1024  # 1 MB
        while True:
            buffer = resp.read(block_size)
            if not buffer:
                break
            downloaded += len(buffer)
            f.write(buffer)
            if total_size > 0:
                percent = downloaded * 100 / total_size
                if downloaded % (5 * block_size) < block_size:
                    print(f"Progress: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB ({percent:.1f}%)")
    print("Download complete.")

def main():
    dest_zip = 'evaluation/models/buffalo_l.zip'
    dest_dir = 'evaluation/models/buffalo_l'
    r50_file = os.path.join(dest_dir, 'w600k_r50.onnx')
    
    if os.path.exists(r50_file):
        print(f"Already have {r50_file}!")
        return

    url = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip'
    download_file(url, dest_zip)
    
    print("Extracting buffalo_l.zip...")
    with zipfile.ZipFile(dest_zip, 'r') as z:
        z.extractall(dest_dir)
    print("Extracted buffalo_l successfully.")

if __name__ == '__main__':
    main()
