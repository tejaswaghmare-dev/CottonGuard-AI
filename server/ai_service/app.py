"""CottonGuard real ML inference service.

Pipeline reused from the working legacy CottonGuard project:
  1. YOLOv8n detects the diseased region.
  2. The highest-confidence detection is cropped.
  3. The saved CNN model (EfficientNetV2-B0 backbone) predicts severity.
  4. Grad-CAM explains the CNN severity prediction on that crop.

POST /predict with multipart field: image
"""

import base64
import io
import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
YOLO_PATH = os.path.join(MODELS_DIR, "yolo_best.pt")
CNN_PATH = os.path.join(MODELS_DIR, "cnn_severity_model.h5")

CNN_CLASSES = ["critical", "mild", "moderate"]
YOLO_CLASSES = ["bacterial_blight", "curl_virus", "fusarium_wilt", "healthy"]
IMAGE_SIZE = (224, 224)
GRADCAM_LAYER = "top_activation"

_yolo_model = None
_cnn_model = None
_grad_model = None

app = FastAPI(title="CottonGuard ML Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        if not os.path.exists(YOLO_PATH):
            raise RuntimeError(f"YOLO model missing: {YOLO_PATH}")
        from ultralytics import YOLO
        _yolo_model = YOLO(YOLO_PATH)
        print("[AI] YOLOv8n loaded")
    return _yolo_model


def get_cnn_model():
    global _cnn_model, _grad_model
    if _cnn_model is None:
        if not os.path.exists(CNN_PATH):
            raise RuntimeError(f"CNN model missing: {CNN_PATH}")
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        import tensorflow as tf
        _cnn_model = tf.keras.models.load_model(CNN_PATH, compile=False)
        print(f"[AI] CNN loaded: {_cnn_model.name}")
        # The legacy model contains a nested EfficientNetV2-B0 functional model.
        backbone = _cnn_model.get_layer("efficientnetv2-b0")
        target = backbone.get_layer(GRADCAM_LAYER)
        # Keep the layer reference; the forward pass for Grad-CAM is built
        # explicitly below so gradients definitely flow through the nested
        # EfficientNetV2-B0 backbone to the severity head.
        _grad_model = {
            "augmentation": _cnn_model.get_layer("data_augmentation"),
            "backbone": backbone,
            "target": target,
            "backbone_cam": tf.keras.Model(backbone.input, [target.output, backbone.output]),
            "gap": _cnn_model.get_layer("global_average_pooling2d"),
            "bn": _cnn_model.get_layer("batch_normalization"),
            "drop": _cnn_model.get_layer("dropout"),
            "dense": _cnn_model.get_layer("dense"),
            "bn1": _cnn_model.get_layer("batch_normalization_1"),
            "drop1": _cnn_model.get_layer("dropout_1"),
            "dense1": _cnn_model.get_layer("dense_1"),
        }
        print(f"[AI] Grad-CAM target: {backbone.name}/{target.name}")
    return _cnn_model


def _b64_png(arr: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".png", arr)
    if not ok:
        raise RuntimeError("Could not encode Grad-CAM image")
    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def make_gradcam(model, image_batch: np.ndarray, class_index: int) -> np.ndarray:
    """Return a uint8 RGB Grad-CAM overlay for the 224x224 classifier crop."""
    import tensorflow as tf

    global _grad_model
    if _grad_model is None:
        get_cnn_model()

    image_tensor = tf.convert_to_tensor(image_batch, dtype=tf.float32)
    g = _grad_model
    with tf.GradientTape() as tape:
        x = g["augmentation"](image_tensor, training=False)
        # One shared backbone graph produces both the target feature map and
        # the classifier input, so the GradientTape can trace the exact path.
        conv_outputs, backbone_output = g["backbone_cam"](x, training=False)
        x2 = g["gap"](backbone_output)
        x2 = g["bn"](x2, training=False)
        x2 = g["drop"](x2, training=False)
        x2 = g["dense"](x2)
        x2 = g["bn1"](x2, training=False)
        x2 = g["drop1"](x2, training=False)
        predictions = g["dense1"](x2)
        target_score = predictions[:, class_index]

    grads = tape.gradient(target_score, conv_outputs)
    if grads is None:
        raise RuntimeError("Grad-CAM gradients were not produced")

    # Global-average-pool gradients over spatial dimensions.
    weights = tf.reduce_mean(grads, axis=(1, 2))
    cam = tf.reduce_sum(conv_outputs * weights[:, None, None, :], axis=-1)
    cam = tf.maximum(cam, 0)
    cam = cam[0].numpy()

    if cam.max() > 0:
        cam = cam / cam.max()
    cam = cv2.resize(cam, IMAGE_SIZE, interpolation=cv2.INTER_LINEAR)

    # Original classifier crop, exactly as fed to the model, converted for display.
    original = np.clip(image_batch[0], 0, 255).astype(np.uint8)
    heat = np.uint8(255 * cam)
    heatmap = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
    original_bgr = cv2.cvtColor(original, cv2.COLOR_RGB2BGR)
    overlay_bgr = cv2.addWeighted(original_bgr, 0.55, heatmap, 0.45, 0)
    return cv2.cvtColor(overlay_bgr, cv2.COLOR_BGR2RGB)


def predict_image(image: Image.Image) -> dict[str, Any]:
    yolo = get_yolo_model()
    cnn = get_cnn_model()

    yolo_results = yolo.predict(source=image, conf=0.25, save=False, verbose=False)
    detections = []
    best_conf = 0.0
    best_box = None
    best_label = None

    for result in yolo_results:
        for box in result.boxes:
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            xyxy = [float(x) for x in box.xyxy[0].tolist()]
            label = result.names.get(cls_id, str(cls_id))
            detections.append({
                "disease": label,
                "confidence": round(conf * 100, 1),
                "bbox": [round(x, 1) for x in xyxy],
            })
            if conf > best_conf:
                best_conf = conf
                best_box = [int(round(x)) for x in xyxy]
                best_label = label

    width, height = image.size
    if best_box is not None:
        x1, y1, x2, y2 = best_box
        x1, x2 = max(0, min(x1, width - 1)), max(1, min(x2, width))
        y1, y2 = max(0, min(y1, height - 1)), max(1, min(y2, height))
        crop = image.crop((x1, y1, x2, y2))
    else:
        x1 = y1 = x2 = y2 = None
        crop = image

    crop_224 = crop.resize(IMAGE_SIZE, Image.Resampling.LANCZOS)
    # This matches the legacy working project: NO /255 normalization.
    img_array = np.expand_dims(np.asarray(crop_224, dtype=np.float32), axis=0)
    cnn_pred = cnn.predict(img_array, verbose=0)[0]
    severity_idx = int(np.argmax(cnn_pred))
    severity = CNN_CLASSES[severity_idx]
    severity_conf = float(cnn_pred[severity_idx] * 100)
    severity_probs = {
        CNN_CLASSES[i]: round(float(cnn_pred[i]) * 100, 1)
        for i in range(len(CNN_CLASSES))
    }

    affected_pct = 0.0
    affected_region = None
    if best_box is not None:
        box_area = max(0, x2 - x1) * max(0, y2 - y1)
        affected_pct = min(100.0, (box_area / max(1, width * height)) * 100)
        affected_region = {
            "x": round(x1 / width, 4),
            "y": round(y1 / height, 4),
            "width": round((x2 - x1) / width, 4),
            "height": round((y2 - y1) / height, 4),
            "label": best_label or "affected_region",
            "detector": "YOLOv8n",
        }

    # Generate XAI heatmap for the actual predicted severity class.
    try:
        gradcam_rgb = make_gradcam(cnn, img_array, severity_idx)
        gradcam_b64 = _b64_png(gradcam_rgb)
        gradcam_available = True
        gradcam_error = None
    except Exception as exc:
        print(f"[AI] Grad-CAM failed: {exc}")
        gradcam_b64 = None
        gradcam_available = False
        gradcam_error = str(exc)

    # YOLO annotation image.
    annotated_b64 = None
    try:
        annotated_bgr = yolo_results[0].plot()
        ok, encoded = cv2.imencode(".jpg", annotated_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if ok:
            annotated_b64 = base64.b64encode(encoded.tobytes()).decode("utf-8")
    except Exception as exc:
        print(f"[AI] Annotation failed: {exc}")

    disease = best_label or "healthy"
    return {
        "disease": disease,
        "confidence": round(best_conf * 100, 1),
        "leafSeverity": round(affected_pct, 1),
        "severityLevel": severity,
        "severity": severity,
        "severity_confidence": round(severity_conf, 1),
        "severity_probs": severity_probs,
        "affected_area_percent": round(affected_pct, 1),
        "affectedRegion": affected_region,
        "detections": detections,
        "annotated_image": f"data:image/jpeg;base64,{annotated_b64}" if annotated_b64 else None,
        "gradCamImageBase64": gradcam_b64,
        "gradCam": {
            "available": gradcam_available,
            "mode": "grad-cam" if gradcam_available else "unavailable",
            "targetLayer": GRADCAM_LAYER,
            "explains": "The heatmap highlights image regions that contributed most to the predicted severity class. It is an explanation visualization, not proof of causality.",
            "disclaimer": "Grad-CAM visualizes model attention and does not prove causal reasoning.",
            "error": gradcam_error,
        },
        "pipeline": ["YOLOv8n", "EfficientNetV2-B0", "Severity", "Grad-CAM"],
        "mode": "python",
        "modelInfo": {
            "detector": "YOLOv8n (yolo_best.pt)",
            "classifier": "EfficientNetV2-B0 (cnn_severity_model.h5)",
            "gradCam": f"Grad-CAM on {GRADCAM_LAYER}",
            "inputSize": "224x224",
            "normalization": "0-255 (legacy training/inference behavior)",
        },
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "yolo_model": os.path.exists(YOLO_PATH),
        "cnn_model": os.path.exists(CNN_PATH),
        "gradcam_target": GRADCAM_LAYER,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    data = await file.read()
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}")

    try:
        return predict_image(image)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[AI] Prediction failed: {exc}")
        raise HTTPException(status_code=500, detail=f"AI inference failed: {exc}")
