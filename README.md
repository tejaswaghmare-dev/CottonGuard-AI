# CottonGuard AI

AI-powered cotton farmer assistance platform: farm management, disease detection, severity & farm-spread estimates, Grad-CAM explanations, Gemini recommendations, verified product marketplace, Leaf Doctor Google Meet consultations (5 free/month), Marathi UI, and voice chatbot.

## Architecture

```
project/
  client/          React (Vite) — UI only
  server/          Node.js + Express — REST API, Gemini, AI adapters, Firebase Admin
```

| Layer | Stack |
|-------|--------|
| Frontend | React, React Router, Firebase Auth (client SDK) |
| Backend | Express, Firebase Admin (Auth verify + Firestore + Storage) |
| Database | Cloud Firestore |
| AI | YOLOv8 + EfficientNetB0 + Grad-CAM adapters (mock by default), Gemini via server |
| Maps | Google Maps Drawing (or demo fallback) |
| Meet / Pay | Mock Meet links + mock payment (Razorpay-ready) |

**Never** put Gemini keys or Firebase service-account JSON in the React app.

## Quick start

### 1. Firebase

1. Create a Firebase project.
2. Enable **Email/Password** Authentication.
3. Create Firestore and Storage.
4. Generate a **service account** key for the server.
5. Register a **Web app** and copy the web config for the client.

### 2. Environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in:

- `server/.env` — `FIREBASE_*`, `GEMINI_API_KEY`, `CLIENT_URL`
- `client/.env` — `VITE_FIREBASE_*`, `VITE_API_URL`, optional `VITE_GOOGLE_MAPS_API_KEY`

### 3. Install & run

```bash
npm run install:all
npm run dev:server    # http://localhost:5000
npm run dev:client    # http://localhost:5173
```

### 4. Roles

On first login, choose a role in onboarding:

- **Farmer** — farms, detection, chatbot, doctors
- **Pesticide Owner** — product CRUD (cannot alter AI results)
- **Leaf Doctor** — availability, consultations, notes, Meet

## Farmer journey

Login → Dashboard → Add Farm (map + area) → Upload leaf → Detection pipeline → Result (severity, Grad-CAM, estimated farm spread, risk, Gemini actions, products) → Chat (EN/मराठी + voice) → Leaf Doctor → 5 free Meet calls / paid mock checkout → Follow-up uploads & history chart.

## API (Express)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/profile` | Set role + profile |
| GET | `/api/auth/me` | Profile + quota |
| CRUD | `/api/farms` | Farmer-owned farms |
| GET | `/api/farms/:farmId/predictions` | Per-farm history |
| GET | `/api/farms/:farmId/spread` | Estimated spread + risk |
| POST | `/api/predictions` | multipart `image` + `farmId` |
| POST | `/api/ai/recommendation` | Gemini structured advice |
| POST | `/api/chat`, `/api/chat/voice` | Assistant |
| CRUD | `/api/products` | Owner write; public read |
| GET | `/api/doctors` | List doctors |
| POST | `/api/consultations` | Book (quota validated on server) |
| POST | `/api/payment/create`, `/confirm` | Mock payment |

All protected routes require `Authorization: Bearer <Firebase ID token>`. Roles are read from Firestore `users`, not from the client claim alone.

## AI model adapters

`server/src/services/aiModel.service.js`:

- `AI_MODEL_MODE=mock` (default) — deterministic mock YOLOv8 → EfficientNetB0 → severity → Grad-CAM hints
- `AI_MODEL_MODE=python` — POST image to `AI_MODEL_SERVICE_URL/predict` and map the JSON into the same response shape

Plug real models without changing the React app.

Disease classes: **Bacterial Blight**, **Curl Virus**, **Fusarium Wilt**, **Healthy**.

**Leaf severity** and **Estimated Farm Disease Spread** are separate metrics. Spread is computed from multiple samples and labeled as an estimate.

## Gemini

Used only on the server for recommendations and chatbot. Product names are matched from Firestore `products`, never invented by Gemini.

## Consultations & payments

- 5 free video consultations per farmer per calendar month (`consultationQuota` collection).
- Quota is consumed in a Firestore transaction on the backend.
- After limit: mock payment → confirm → consultation `confirmed` + Meet link.
- Set `PAYMENT_MODE=razorpay` later and wire the Orders API in `payment.service.js`.

## Marathi & voice

- UI toggle: English | मराठी
- Chatbot answers in the selected language; disease names stay in English
- Browser Web Speech API for STT/TTS when available; falls back to text

## Security checklist

- [x] Firebase Admin only on server
- [x] Gemini key only on server
- [x] Token verification middleware
- [x] Role middleware
- [x] Farm / product ownership checks
- [x] Image type/size validation
- [x] Consultation Meet links gated by status/auth
- [x] `.env.example` placeholders only

## License

Private / academic project — adjust as needed.

## Real CottonGuard ML service

The project now includes the working legacy CottonGuard models under `server/ai_service/models/` and a FastAPI inference service with YOLOv8n + EfficientNetV2-B0 + Grad-CAM.

1. Install Node dependencies in `server/`.
2. Create `server/.env` from `server/.env.example` and set Firebase/Gemini credentials.
3. Set `AI_MODEL_MODE=python` and `AI_MODEL_SERVICE_URL=http://localhost:8000`.
4. Create a Python environment in `server/ai_service/` and run `pip install -r requirements.txt`.
5. Start the Python service on port 8000.
6. Start the Express server on port 5000 and the React client on port 5173.

The Grad-CAM image is generated for the predicted severity class using the EfficientNetV2-B0 `top_activation` feature map.
