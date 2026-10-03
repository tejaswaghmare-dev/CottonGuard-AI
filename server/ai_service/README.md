# CottonGuard ML Service

This service replaces the old mock AI adapter with the real CottonGuard models from the working legacy project.

## Models

- `models/yolo_best.pt` — YOLOv8n disease detector
- `models/cnn_severity_model.h5` — EfficientNetV2-B0 severity classifier

The legacy classifier expects `224x224x3` RGB input in the `0..255` range. That preprocessing is intentionally preserved.

## Pipeline

1. YOLOv8n detects cotton disease regions.
2. The highest-confidence box is cropped.
3. The crop is resized to `224x224`.
4. EfficientNetV2-B0 predicts `critical`, `mild`, or `moderate`.
5. Grad-CAM uses the backbone's `top_activation` layer to generate an XAI heatmap for the predicted severity class.
6. The API returns the detection, severity, affected area, annotation, and Grad-CAM image.

## Run

From this directory:

```bash
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS/Linux
# source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Health check:

```text
GET http://localhost:8000/health
```

Prediction:

```text
POST http://localhost:8000/predict
multipart/form-data field: image
```

## Node connection

In `server/.env`:

```env
AI_MODEL_MODE=python
AI_MODEL_SERVICE_URL=http://localhost:8000
```

The Express adapter converts `gradCamImageBase64` into a Buffer and the existing Firebase Storage service uploads it to the `gradcam/` path.
