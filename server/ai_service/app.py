
"""
CottonGuard real ML inference service.

Pipeline:
1. YOLO11m detects cotton leaf/disease regions.
2. The highest-confidence detection is cropped.
3. EfficientNetV2-B0 predicts severity.
4. Real Grad-CAM explains the predicted severity class.
5. Grad-CAM is mapped back onto the original leaf image.

POST /predict with multipart field: file
"""

import base64
import io
import os
import time
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image


# ============================================================
# PATHS AND CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

YOLO_PATH = os.path.join(MODELS_DIR, "best.pt")
CNN_PATH = os.path.join(MODELS_DIR, "cnn_severity_model.h5")

CNN_CLASSES = [
    "critical",
    "mild",
    "moderate",
]

IMAGE_SIZE = (224, 224)
GRADCAM_LAYER = "top_activation"

_yolo_model = None
_cnn_model = None
_grad_model = None


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="CottonGuard ML Service",
    version="2.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DISEASE LABEL NORMALIZATION
# ============================================================

def normalize_disease_label(label: str) -> str:
    """Normalize YOLO class names for the API."""

    key = (
        label.strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )

    label_mapping = {
        "healthy": "healthy",
        "healthy_leaf": "healthy",
        "cotton_healthy": "healthy",
        "cotton_healthy_leaf": "healthy",
        "bacterial_blight": "bacterial_blight",
        "curl_virus": "curl_virus",
        "fusarium_wilt": "fusarium_wilt",
    }

    return label_mapping.get(key, key)


# ============================================================
# YOLO MODEL
# ============================================================

def get_yolo_model():
    """Load YOLO once and reuse it."""

    global _yolo_model

    if _yolo_model is None:
        if not os.path.exists(YOLO_PATH):
            raise RuntimeError(
                f"YOLO model missing: {YOLO_PATH}"
            )

        from ultralytics import YOLO

        _yolo_model = YOLO(YOLO_PATH)

        print(
            f"[AI] YOLO model loaded successfully: "
            f"{os.path.basename(YOLO_PATH)}"
        )

    return _yolo_model


# ============================================================
# CNN MODEL AND GRAD-CAM MODEL
# ============================================================

def get_cnn_model():
    """Load the CNN and prepare its Grad-CAM components."""

    global _cnn_model, _grad_model

    if _cnn_model is not None and _grad_model is not None:
        return _cnn_model

    if not os.path.exists(CNN_PATH):
        raise RuntimeError(
            f"CNN model missing: {CNN_PATH}"
        )

    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

    import tensorflow as tf

    if _cnn_model is None:
        _cnn_model = tf.keras.models.load_model(
            CNN_PATH,
            compile=False,
        )

        print(f"[AI] CNN loaded: {_cnn_model.name}")

    # Find the nested EfficientNetV2-B0 backbone.
    backbone = _cnn_model.get_layer("efficientnetv2-b0")
    target = backbone.get_layer(GRADCAM_LAYER)

    print(
        f"[AI] Grad-CAM target: "
        f"{backbone.name}/{target.name}"
    )
    print(
        f"[AI] Grad-CAM feature shape: {target.output.shape}"
    )

    # Obtain both the target activation and backbone output.
    backbone_cam = tf.keras.Model(
        inputs=backbone.input,
        outputs=[
            target.output,
            backbone.output,
        ],
        name="efficientnet_gradcam",
    )

    # Reuse the trained classifier head.
    gap = _cnn_model.get_layer("global_average_pooling2d")
    bn = _cnn_model.get_layer("batch_normalization")
    drop = _cnn_model.get_layer("dropout")
    dense = _cnn_model.get_layer("dense")
    bn1 = _cnn_model.get_layer("batch_normalization_1")
    drop1 = _cnn_model.get_layer("dropout_1")
    dense1 = _cnn_model.get_layer("dense_1")
    augmentation = _cnn_model.get_layer("data_augmentation")

    _grad_model = {
        "augmentation": augmentation,
        "backbone_cam": backbone_cam,
        "gap": gap,
        "bn": bn,
        "drop": drop,
        "dense": dense,
        "bn1": bn1,
        "drop1": drop1,
        "dense1": dense1,
    }

    print("[AI] Grad-CAM model created successfully")

    return _cnn_model


# ============================================================
# GRAD-CAM GENERATION
# ============================================================

def make_gradcam(
    image_batch: np.ndarray,
    class_index: int,
) -> np.ndarray:
    """
    Generate a real Grad-CAM overlay for the selected CNN class.

    Input: RGB image batch, shape (1, 224, 224, 3).
    Output: RGB overlay, shape (224, 224, 3).
    """

    import tensorflow as tf

    get_cnn_model()

    if _grad_model is None:
        raise RuntimeError(
            "Grad-CAM model was not initialized"
        )

    if image_batch is None or image_batch.size == 0:
        raise ValueError("CNN input image is empty")

    if not 0 <= class_index < len(CNN_CLASSES):
        raise ValueError(
            f"Invalid severity class index: {class_index}"
        )

    g = _grad_model

    image_tensor = tf.convert_to_tensor(
        image_batch,
        dtype=tf.float32,
    )

    with tf.GradientTape() as tape:
        # Disable random augmentation for explanation.
        x = g["augmentation"](
            image_tensor,
            training=False,
        )

        conv_outputs, backbone_output = g["backbone_cam"](
            x,
            training=False,
        )

        # Pass the backbone output through the trained classifier head.
        x = g["gap"](backbone_output)
        x = g["bn"](x, training=False)
        x = g["drop"](x, training=False)
        x = g["dense"](x)
        x = g["bn1"](x, training=False)
        x = g["drop1"](x, training=False)
        predictions = g["dense1"](x)

        target_score = predictions[:, class_index]

    grads = tape.gradient(
        target_score,
        conv_outputs,
    )

    if grads is None:
        raise RuntimeError(
            "Grad-CAM gradients are None. "
            "Check the model graph and target layer."
        )

    # Calculate channel importance from the gradients.
    weights = tf.reduce_mean(
        grads,
        axis=(1, 2),
    )

    cam = tf.reduce_sum(
        conv_outputs * weights[:, None, None, :],
        axis=-1,
    )

    # Keep positive contributions to the selected class.
    cam = tf.maximum(cam, 0)[0].numpy()

    if not np.isfinite(cam).all():
        raise ValueError(
            "Grad-CAM contains invalid values"
        )

    cam_min = float(cam.min())
    cam_max = float(cam.max())

    if cam_max - cam_min < 1e-8:
        raise ValueError(
            "Grad-CAM activation is effectively zero"
        )

    # Normalize heatmap between 0 and 1.
    cam = (cam - cam_min) / (cam_max - cam_min)

    # Smoothly resize the heatmap to the CNN input size.
    cam = cv2.resize(
        cam,
        IMAGE_SIZE,
        interpolation=cv2.INTER_CUBIC,
    )

    original = np.clip(
        image_batch[0],
        0,
        255,
    ).astype(np.uint8)

    heat = np.uint8(
        255 * np.clip(cam, 0, 1)
    )

    heatmap_bgr = cv2.applyColorMap(
        heat,
        cv2.COLORMAP_JET,
    )

    original_bgr = cv2.cvtColor(
        original,
        cv2.COLOR_RGB2BGR,
    )

    # Keep the leaf visible under the heatmap.
    overlay_bgr = cv2.addWeighted(
        original_bgr,
        0.60,
        heatmap_bgr,
        0.40,
        0,
    )

    overlay_rgb = cv2.cvtColor(
        overlay_bgr,
        cv2.COLOR_BGR2RGB,
    )

    return overlay_rgb


# ============================================================
# MAP CROP GRAD-CAM BACK ONTO THE ORIGINAL LEAF
# ============================================================

def place_gradcam_on_original(
    original_image: Image.Image,
    crop_overlay_rgb: np.ndarray,
    box: list | None,
) -> np.ndarray:
    """
    Place the actual crop Grad-CAM overlay in its original
    location. Pixels outside the detected region remain unchanged.
    """

    original_rgb = np.asarray(
        original_image.convert("RGB"),
        dtype=np.uint8,
    ).copy()

    original_h, original_w = original_rgb.shape[:2]

    if crop_overlay_rgb is None or crop_overlay_rgb.size == 0:
        raise ValueError("Grad-CAM overlay is empty")

    if box is None:
        return cv2.resize(
            crop_overlay_rgb,
            (original_w, original_h),
            interpolation=cv2.INTER_LINEAR,
        )

    x1, y1, x2, y2 = [int(v) for v in box]

    x1 = max(0, min(x1, original_w - 1))
    y1 = max(0, min(y1, original_h - 1))
    x2 = max(x1 + 1, min(x2, original_w))
    y2 = max(y1 + 1, min(y2, original_h))

    roi_w = x2 - x1
    roi_h = y2 - y1

    resized_overlay = cv2.resize(
        crop_overlay_rgb,
        (roi_w, roi_h),
        interpolation=cv2.INTER_LINEAR,
    )

    original_rgb[y1:y2, x1:x2] = resized_overlay

    return original_rgb


# ============================================================
# BASE64 IMAGE ENCODING
# ============================================================

def _b64_png(arr: np.ndarray) -> str:
    """Encode an RGB NumPy image as a Base64 PNG string."""

    if arr is None:
        raise ValueError("Grad-CAM image is None")

    arr = np.asarray(arr)

    if arr.size == 0:
        raise ValueError("Grad-CAM image is empty")

    if arr.ndim != 3 or arr.shape[2] != 3:
        raise ValueError(
            f"Expected RGB image with 3 channels, got {arr.shape}"
        )

    arr = np.ascontiguousarray(
        np.clip(arr, 0, 255).astype(np.uint8)
    )

    buffer = io.BytesIO()

    Image.fromarray(arr).save(
        buffer,
        format="PNG",
    )

    return base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")


# ============================================================
# MAIN PREDICTION
# ============================================================

def predict_image(
    image: Image.Image,
) -> dict[str, Any]:

    total_start = time.perf_counter()

    # First-time model loading is included in total time.
    model_start = time.perf_counter()

    yolo = get_yolo_model()
    cnn = get_cnn_model()

    print(
        f"[TIME] Model loading/setup: "
        f"{(time.perf_counter() - model_start) * 1000:.0f} ms"
    )

    # --------------------------------------------------------
    # YOLO DETECTION
    # --------------------------------------------------------

    yolo_start = time.perf_counter()

    yolo_results = yolo.predict(
        source=image,
        conf=0.25,
        save=False,
        verbose=False,
    )

    print(
        f"[TIME] YOLO: "
        f"{(time.perf_counter() - yolo_start) * 1000:.0f} ms"
    )

    detections = []
    best_conf = 0.0
    best_box = None
    best_label = None

    for result in yolo_results:
        for box in result.boxes:
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])

            xyxy = [
                float(value)
                for value in box.xyxy[0].tolist()
            ]

            raw_label = result.names.get(
                cls_id,
                str(cls_id),
            )

            label = normalize_disease_label(raw_label)

            detections.append({
                "disease": label,
                "confidence": round(conf * 100, 1),
                "bbox": [
                    round(value, 1)
                    for value in xyxy
                ],
            })

            if conf > best_conf:
                best_conf = conf
                best_box = [
                    int(round(value))
                    for value in xyxy
                ]
                best_label = label

    # --------------------------------------------------------
    # CROP THE HIGHEST-CONFIDENCE DETECTION
    # --------------------------------------------------------

    width, height = image.size

    if best_box is not None:
        x1, y1, x2, y2 = best_box

        x1 = max(0, min(x1, width - 1))
        y1 = max(0, min(y1, height - 1))
        x2 = max(1, min(x2, width))
        y2 = max(1, min(y2, height))

        if x2 <= x1:
            x2 = min(width, x1 + 1)

        if y2 <= y1:
            y2 = min(height, y1 + 1)

        # Save the exact clamped crop coordinates.
        best_box = [x1, y1, x2, y2]

        crop = image.crop((x1, y1, x2, y2))

    else:
        x1 = y1 = x2 = y2 = None

        # Preserve existing behavior when YOLO detects nothing.
        crop = image

    # --------------------------------------------------------
    # CNN INPUT
    # --------------------------------------------------------

    crop_224 = crop.resize(
        IMAGE_SIZE,
        Image.Resampling.LANCZOS,
    )

    # Preserve the existing 0-255 preprocessing behavior.
    # Do not change normalization without checking training.
    img_array = np.expand_dims(
        np.asarray(crop_224, dtype=np.float32),
        axis=0,
    )

    # --------------------------------------------------------
    # SEVERITY PREDICTION
    # --------------------------------------------------------

    cnn_start = time.perf_counter()

    cnn_pred = cnn(
        img_array,
        training=False,
    ).numpy()[0]

    print(
        f"[TIME] CNN: "
        f"{(time.perf_counter() - cnn_start) * 1000:.0f} ms"
    )

    if len(cnn_pred) != len(CNN_CLASSES):
        raise RuntimeError(
            f"CNN returned {len(cnn_pred)} classes, "
            f"but CNN_CLASSES contains {len(CNN_CLASSES)} labels."
        )

    severity_idx = int(np.argmax(cnn_pred))
    severity = CNN_CLASSES[severity_idx]

    severity_conf = float(
        cnn_pred[severity_idx] * 100
    )

    severity_probs = {
        CNN_CLASSES[i]: round(
            float(cnn_pred[i]) * 100,
            1,
        )
        for i in range(len(CNN_CLASSES))
    }

    # --------------------------------------------------------
    # AFFECTED REGION
    # --------------------------------------------------------

    affected_pct = 0.0
    affected_region = None

    if best_box is not None:
        box_area = max(0, x2 - x1) * max(0, y2 - y1)

        # This is bounding-box coverage, not disease severity.
        affected_pct = min(
            100.0,
            (box_area / max(1, width * height)) * 100,
        )

        affected_region = {
            "x": round(x1 / width, 4),
            "y": round(y1 / height, 4),
            "width": round((x2 - x1) / width, 4),
            "height": round((y2 - y1) / height, 4),
            "label": best_label or "affected_region",
            "detector": "YOLO11m",
        }

    # --------------------------------------------------------
    # GRAD-CAM
    # --------------------------------------------------------

    gradcam_b64 = None
    gradcam_available = False
    gradcam_error = None

    gradcam_start = time.perf_counter()

    try:
        # Generate real Grad-CAM for the CNN's crop.
        crop_gradcam_rgb = make_gradcam(
            img_array,
            severity_idx,
        )

        # Map the crop overlay onto the full original image.
        gradcam_rgb = place_gradcam_on_original(
            image,
            crop_gradcam_rgb,
            best_box,
        )

        gradcam_b64 = _b64_png(gradcam_rgb)
        gradcam_available = True

        print(
            f"[AI] Grad-CAM generated for severity: {severity}"
        )

    except Exception as exc:
        print(f"[AI] Grad-CAM failed: {exc}")
        gradcam_error = str(exc)

    finally:
        print(
            f"[TIME] Grad-CAM and encoding: "
            f"{(time.perf_counter() - gradcam_start) * 1000:.0f} ms"
        )

    # --------------------------------------------------------
    # YOLO ANNOTATED IMAGE
    # --------------------------------------------------------

    annotated_b64 = None
    annotation_start = time.perf_counter()

    try:
        if yolo_results:
            # Actual YOLO boxes, labels and confidence values.
            annotated_bgr = yolo_results[0].plot()

            ok, encoded = cv2.imencode(
                ".jpg",
                annotated_bgr,
                [
                    cv2.IMWRITE_JPEG_QUALITY,
                    90,
                ],
            )

            if ok:
                annotated_b64 = base64.b64encode(
                    encoded.tobytes()
                ).decode("utf-8")

    except Exception as exc:
        print(f"[AI] Annotation failed: {exc}")

    finally:
        print(
            f"[TIME] YOLO annotation and encoding: "
            f"{(time.perf_counter() - annotation_start) * 1000:.0f} ms"
        )

    # --------------------------------------------------------
    # FINAL DISEASE
    # --------------------------------------------------------

    disease = best_label or "healthy"

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    print(
        f"[TIME] Total Python inference: "
        f"{(time.perf_counter() - total_start) * 1000:.0f} ms"
    )

    return {
        "disease": disease,
        "confidence": round(best_conf * 100, 1),

        # Bounding-box coverage; not CNN severity.
        "leafSeverity": round(affected_pct, 1),
        "affected_area_percent": round(affected_pct, 1),
        "affectedRegion": affected_region,

        "severityLevel": severity,
        "severity": severity,
        "severity_confidence": round(severity_conf, 1),
        "severity_probs": severity_probs,

        "detections": detections,

        "annotated_image": (
            f"data:image/jpeg;base64,{annotated_b64}"
            if annotated_b64
            else None
        ),

        # Base64 PNG string, compatible with the Node adapter.
        "gradCamImageBase64": (
            gradcam_b64 if gradcam_available else None
        ),

        "gradCam": {
            "available": gradcam_available,
            "mode": (
                "grad-cam"
                if gradcam_available
                else "unavailable"
            ),
            "targetLayer": GRADCAM_LAYER,
            "explains": (
                "The heatmap highlights image regions that contributed "
                "to the predicted severity class. It is an explanation "
                "visualization, not proof of causality."
            ),
            "disclaimer": (
                "Grad-CAM visualizes model attention and does not "
                "prove causal reasoning."
            ),
            "error": gradcam_error,
        },

        "pipeline": [
            "YOLO11m",
            "EfficientNetV2-B0",
            "Severity",
            "Grad-CAM",
        ],

        "mode": "python",

        "modelInfo": {
            "detector": (
                f"YOLO11m ({os.path.basename(YOLO_PATH)})"
            ),
            "classifier": (
                "EfficientNetV2-B0 (cnn_severity_model.h5)"
            ),
            "gradCam": f"Grad-CAM on {GRADCAM_LAYER}",
            "inputSize": "224x224",
            "normalization": (
                "0-255 (legacy training/inference behavior)"
            ),
        },
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "yolo_model": os.path.exists(YOLO_PATH),
        "cnn_model": os.path.exists(CNN_PATH),
        "gradcam_target": GRADCAM_LAYER,
    }


# ============================================================
# PREDICTION ENDPOINT
# ============================================================

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
):
    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    try:
        image = Image.open(
            io.BytesIO(data)
        ).convert("RGB")

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image file: {exc}",
        )

    try:
        return predict_image(image)

    except HTTPException:
        raise

    except Exception as exc:
        print(f"[AI] Prediction failed: {exc}")

        raise HTTPException(
            status_code=500,
            detail=f"AI inference failed: {exc}",
        )
