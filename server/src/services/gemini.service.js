const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../config/env');

let genAI = null;

function getClient() {
  if (!env.geminiApiKey) {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.geminiApiKey);
  }
  return genAI;
}

function fallbackRecommendation(context) {
  const { disease, leafSeverity, farmName, location } = context;
  const isHealthy = !disease || disease.toLowerCase() === 'healthy';

  if (isHealthy) {
    return {
      source: 'fallback',
      immediateActions: [
        'Continue regular field scouting twice a week.',
        'Maintain balanced irrigation — avoid waterlogging.',
        'Keep farm sanitation: remove fallen plant debris.',
      ],
      fieldMonitoring: [
        'Sample leaves from different corners of the farm weekly.',
        'Watch for yellowing, spots, or curling on new growth.',
      ],
      preventivePractices: [
        'Use certified cotton seed when replanting.',
        'Rotate crops where possible to reduce pathogen build-up.',
      ],
      followUp: ['Upload follow-up leaf images in 7–10 days for monitoring.'],
      consultDoctorWhen: 'Consult a Leaf Doctor if symptoms appear on multiple plants.',
      language: context.language || 'en',
    };
  }

  return {
    source: 'fallback',
    immediateActions: [
      `Isolate and monitor plants showing ${disease} symptoms in ${farmName || 'your farm'}${location ? ` (${location})` : ''}.`,
      'Do not spray unverified chemicals — check Matching Products for verified catalogue items.',
      leafSeverity >= 60
        ? 'Severity is high on sampled leaves — prioritize specialist consultation.'
        : 'Continue sampling from other farm areas to estimate spread.',
    ],
    fieldMonitoring: [
      'Collect samples from north, south, east, west zones of the farm.',
      'Record how many plants show similar symptoms.',
      'Upload follow-up images every week.',
    ],
    preventivePractices: [
      'Avoid working wet fields to reduce mechanical spread.',
      'Clean tools between fields.',
      'Improve airflow by proper spacing where possible.',
    ],
    followUp: [
      'Re-scan affected zones in 5–7 days.',
      'Track leaf severity trend on the farm history chart.',
    ],
    consultDoctorWhen:
      'Book a Leaf Doctor if spread risk is Moderate/High, or if symptoms worsen after one week.',
    language: context.language || 'en',
    note: 'Gemini API key not configured — showing structured fallback advice. Product names are never invented here.',
  };
}

/**
 * Generate agricultural recommendations.
 * Must NOT invent pesticide products — products come from Firestore.
 */
async function generateRecommendation(context) {
  const client = getClient();
  if (!client) {
    return fallbackRecommendation(context);
  }

  const lang = context.language === 'mr' ? 'Marathi' : 'English';
  const prompt = `You are CottonGuard AI, an agricultural assistant for cotton farmers in India.
Respond ONLY in ${lang}. Use simple farmer-friendly language. Do NOT invent or recommend specific brand pesticide product names.
Product matching is handled separately from a verified catalogue.

Context:
- Disease: ${context.disease || 'Unknown'}
- Confidence: ${context.confidence ?? 'N/A'}%
- Leaf Severity: ${context.leafSeverity ?? 'N/A'}% (${context.severityLevel || ''})
- Estimated Farm Disease Spread: ${context.estimatedSpreadPercent != null ? context.estimatedSpreadPercent + '%' : 'insufficient samples'}
- Spread Risk: ${context.spreadRisk || 'Unknown'}
- Farm: ${context.farmName || 'N/A'}, Area: ${context.area || 'N/A'} ${context.areaUnit || ''}
- Location: ${context.location || 'N/A'}
- Previous reports: ${context.previousReports || 'None'}
- Samples analyzed: ${context.samplesAnalyzed ?? 'N/A'}

Return a JSON object with keys:
immediateActions (string array),
fieldMonitoring (string array),
preventivePractices (string array),
followUp (string array),
consultDoctorWhen (string).
No markdown, JSON only.`;

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ...fallbackRecommendation(context), source: 'gemini-parse-fallback', raw: text };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return { source: 'gemini', language: context.language || 'en', ...parsed };
  } catch (err) {
    console.error('[Gemini recommendation]', err.message);
    return { ...fallbackRecommendation(context), source: 'gemini-error-fallback', error: err.message };
  }
}

/**
 * Chat with Gemini using farmer context.
 */
async function chat(messages, context = {}) {
  const client = getClient();
  const lang = context.language === 'mr' ? 'Marathi' : 'English';
  const system = `You are CottonGuard Assistant — a friendly AI helper for cotton farmers.
Answer in ${lang} unless the farmer writes in the other language; then match their language.
Keep answers simple and practical. Do NOT invent pesticide brands.
If recommending chemical control, say to check verified products in CottonGuard marketplace.
Technical disease names stay in English: Bacterial Blight, Curl Virus, Fusarium Wilt, Healthy.

Farmer context:
- Farm: ${context.farmName || 'not selected'}
- Crop: ${context.crop || 'Cotton'}
- Location: ${context.location || 'N/A'}
- Latest disease: ${context.latestDisease || 'N/A'}
- Leaf severity: ${context.leafSeverity ?? 'N/A'}
- History: ${context.historySummary || 'N/A'}`;

  if (!client) {
    const last = messages[messages.length - 1]?.content || '';
    const reply =
      context.language === 'mr'
        ? `मी तुमचा प्रश्न समजलो: "${last}". सध्या Gemini API कॉन्फिगर नाही, तरीही सामान्य सल्ला: पानांची नियमित तपासणी करा, शेताच्या वेगवेगळ्या भागांतून नमुने घ्या, आणि CottonGuard मधील पडताळलेली उत्पादने पाहा. गरज असल्यास Leaf Doctor ची भेट बुक करा.`
        : `I understood: "${last}". Gemini API is not configured yet. General advice: scout leaves regularly, sample different farm zones, check verified products in CottonGuard, and book a Leaf Doctor if symptoms worsen.`;
    return { reply, source: 'fallback' };
  }

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const historyText = messages
      .map((m) => `${m.role === 'user' ? 'Farmer' : 'Assistant'}: ${m.content}`)
      .join('\n');
    const prompt = `${system}\n\nConversation:\n${historyText}\n\nAssistant:`;
    const result = await model.generateContent(prompt);
    return { reply: result.response.text().trim(), source: 'gemini' };
  } catch (err) {
    console.error('[Gemini chat]', err.message);
    return {
      reply:
        context.language === 'mr'
          ? 'सध्या AI उत्तर देऊ शकत नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा किंवा Leaf Doctor ची भेट बुक करा.'
          : 'The AI assistant is temporarily unavailable. Please try again shortly or book a Leaf Doctor.',
      source: 'error',
      error: err.message,
    };
  }
}

module.exports = {
  generateRecommendation,
  chat,
  fallbackRecommendation,
};
