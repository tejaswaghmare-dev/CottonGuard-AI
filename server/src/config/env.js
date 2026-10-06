require('dotenv').config();

const required = [];

function get(key, fallback = undefined) {
  const value = process.env[key] ?? fallback;
  return value;
}

const env = {
  port: Number(get('PORT', 5000)),
  nodeEnv: get('NODE_ENV', 'development'),
  clientUrl: get('CLIENT_URL', 'http://localhost:5173'),
  firebase: {
    projectId: get('FIREBASE_PROJECT_ID'),
    clientEmail: get('FIREBASE_CLIENT_EMAIL'),
    privateKey: get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    storageBucket: get('FIREBASE_STORAGE_BUCKET'),
  },
  geminiApiKey: get('GEMINI_API_KEY'),
  aiModelMode: get('AI_MODEL_MODE', 'mock'),
  aiModelServiceUrl: get('AI_MODEL_SERVICE_URL', 'http://localhost:8000'),
  freeConsultationsPerMonth: Number(get('FREE_CONSULTATIONS_PER_MONTH', 5)),
  defaultConsultationFee: Number(get('DEFAULT_CONSULTATION_FEE', 299)),
  mockMeetBaseUrl: get('MOCK_MEET_BASE_URL', 'https://meet.google.com'),
  paymentMode: get('PAYMENT_MODE', 'mock'),
  razorpay: {
    keyId: get('RAZORPAY_KEY_ID'),
    keySecret: get('RAZORPAY_KEY_SECRET'),
  },
  google: {
    clientId: get('GOOGLE_CLIENT_ID'),
    clientSecret: get('GOOGLE_CLIENT_SECRET'),
    redirectUri: get(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:5000/api/google/oauth2callback'
    ),
  },
};

module.exports = { env, required };
