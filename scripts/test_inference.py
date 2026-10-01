import cv2
import numpy as np

# Load YuNet face detector
detector = cv2.FaceDetectorYN.create(
    model='models/face_detection_yunet_2023mar.onnx',
    config='',
    input_size=(320, 320),
    score_threshold=0.6,
    nms_threshold=0.3,
    top_k=5000
)

# Load SFace face recognizer
recognizer = cv2.FaceRecognizerSF.create(
    model='models/face_recognition_sface_2021dec.onnx',
    config=''
)

print("Detector & Recognizer loaded successfully!")

# Create a test synthetic image or test with a real face
# Let's test on an image if available or test function signatures
print("YuNet & SFace initialized with zero errors.")
