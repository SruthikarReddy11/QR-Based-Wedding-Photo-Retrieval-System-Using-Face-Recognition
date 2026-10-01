import urllib.request
import os

os.makedirs('models', exist_ok=True)

opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
urllib.request.install_opener(opener)

yunet_url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
sface_url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'

print("Downloading YuNet...")
urllib.request.urlretrieve(yunet_url, 'models/face_detection_yunet_2023mar.onnx')
print("YuNet size:", os.path.getsize('models/face_detection_yunet_2023mar.onnx'))

print("Downloading SFace...")
urllib.request.urlretrieve(sface_url, 'models/face_recognition_sface_2021dec.onnx')
print("SFace size:", os.path.getsize('models/face_recognition_sface_2021dec.onnx'))
