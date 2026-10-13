
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../config/env');

let genAI = null;

const GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

function getClient() {
  if (!env.geminiApiKey) {
    return null;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.geminiApiKey);
  }

  return genAI;
}

function getErrorStatus(error) {
  const status = Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status
  );

  if (status) return status;

  const message = String(error?.message || '');

  const match = message.match(/\b(429|500|502|503|504)\b/);

  return match ? Number(match[1]) : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry temporary Gemini errors once.
 * Retries do not guarantee success if the service is overloaded
 * or the account has reached its quota.
 */
async function generateContentWithRetry(model, prompt) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      lastError = error;

      const status = getErrorStatus(error);
      const retryable = [429, 500, 502, 503, 504].includes(status);

      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      console.warn(
        `[Gemini] Temporary error ${status || 'unknown'}. ` +
        `Retrying (${attempt + 1}/${MAX_ATTEMPTS})...`
      );

      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

function fallbackRecommendation(context = {}) {
  const {
    disease,
    leafSeverity,
    farmName,
    location,
  } = context;

  const isHealthy =
    !disease ||
    String(disease).toLowerCase() === 'healthy';

  if (isHealthy) {
    return {
      status: 'fallback',
      source: 'fallback',
      language: context.language || 'en',

      immediateActions: [
        'Continue regular field scouting twice a week.',
        'Maintain balanced irrigation and avoid waterlogging.',
        'Maintain farm sanitation and remove fallen plant debris.',
      ],

      fieldMonitoring: [
        'Sample leaves from different areas of the farm regularly.',
        'Watch for yellowing, spots, or curling on new growth.',
      ],

      preventivePractices: [
        'Use certified cotton seed when replanting.',
        'Rotate crops where possible to help reduce pathogen build-up.',
      ],

      followUp: [
        'Upload follow-up leaf images in 7–10 days for monitoring.',
      ],

      consultDoctorWhen:
        'Consult a Leaf Doctor if symptoms appear, become severe, or continue to worsen.',

      note: 'General monitoring advice. Continue observing the crop.',
    };
  }

  const severity = Number(leafSeverity);
  const isHighSeverity = Number.isFinite(severity) && severity >= 60;

  return {
    status: 'fallback',
    source: 'fallback',
    language: context.language || 'en',

    immediateActions: [
      `Monitor plants showing ${disease} symptoms in ${
        farmName || 'your farm'
      }${location ? ` (${location})` : ''}.`,

      'Do not spray unverified chemicals. Check the verified product catalogue and follow expert guidance.',

      isHighSeverity
        ? 'The sampled leaf has a high severity score. Arrange a specialist review promptly.'
        : 'Inspect nearby plants for similar symptoms and record any changes.',
    ],

    fieldMonitoring: [
      'Inspect leaves from different areas of the farm.',
      'Record plants showing similar symptoms.',
      'Upload follow-up images regularly to monitor changes.',
    ],

    preventivePractices: [
      'Avoid working in wet fields when this could spread disease.',
      'Clean tools between fields where appropriate.',
      'Maintain suitable plant spacing and field drainage.',
    ],

    followUp: [
      'Recheck the affected plants in 5–7 days, or sooner if symptoms worsen.',
      'Track changes using your disease history.',
    ],

    consultDoctorWhen:
      'Book a Leaf Doctor if symptoms are severe, worsening, or not improving.',

    note:
      'Gemini was unavailable. This is general fallback guidance, not a confirmed treatment prescription.',
  };
}

/**
 * Generate agricultural recommendations.
 * Specific pesticide products must come from the verified catalogue.
 */
async function generateRecommendation(context = {}) {
  const client = getClient();

  if (!client) {
    return {
      ...fallbackRecommendation(context),
      note: 'Gemini API key is not configured. Showing fallback advice.',
    };
  }

  const language =
    context.language === 'mr' ? 'Marathi' : 'English';

  const prompt = `
You are CottonGuard AI, an agricultural assistant for cotton farmers in India.

Respond ONLY in ${language}.
Use simple, farmer-friendly language.

Do not invent specific pesticide brand names, chemical dosages,
test results, or unsupported diagnoses.
Product matching is handled separately using a verified catalogue.
Provide general monitoring and prevention advice when information is missing.

Context:
- Disease: ${context.disease || 'Unknown'}
- Confidence: ${context.confidence ?? 'N/A'}%
- Leaf severity: ${context.leafSeverity ?? 'N/A'}%
- Severity level: ${context.severityLevel || 'N/A'}
- Farm: ${context.farmName || 'N/A'}
- Area: ${context.area ?? 'N/A'} ${context.areaUnit || ''}
- Location: ${context.location || 'N/A'}
- Previous reports: ${context.previousReports || 'None'}

Return one valid JSON object with exactly these keys:
{
  "immediateActions": ["string"],
  "fieldMonitoring": ["string"],
  "preventivePractices": ["string"],
  "followUp": ["string"],
  "consultDoctorWhen": "string"
}

No Markdown or code fences.
`;

  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
    });

    const responseText = await generateContentWithRetry(model, prompt);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Gemini did not return a valid JSON object.');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const arrayKeys = [
      'immediateActions',
      'fieldMonitoring',
      'preventivePractices',
      'followUp',
    ];

    for (const key of arrayKeys) {
      if (!Array.isArray(parsed[key])) {
        throw new Error(`Invalid recommendation field: ${key}`);
      }

      parsed[key] = parsed[key]
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof parsed.consultDoctorWhen !== 'string') {
      throw new Error('Invalid consultDoctorWhen field.');
    }

    return {
      status: 'generated',
      source: 'gemini',
      language: context.language || 'en',
      ...parsed,
    };
  } catch (error) {
    console.error(
      '[Gemini recommendation]',
      getErrorStatus(error) || '',
      error.message
    );

    return {
      ...fallbackRecommendation(context),
      status: 'fallback',
      source: 'gemini-error-fallback',
      error: error.message,
    };
  }
}

/**
 * Chat with Gemini using farmer context.
 */
async function chat(messages = [], context = {}) {
  const client = getClient();

  const language =
    context.language === 'mr' ? 'Marathi' : 'English';

  const lastMessage =
    messages[messages.length - 1]?.content || '';

  if (!client) {
    const reply =
      context.language === 'mr'
        ? `तुमचा प्रश्न समजला: "${lastMessage}". सध्या Gemini API कॉन्फिगर केलेले नाही. पानांची नियमित तपासणी करा, CottonGuard मधील पडताळलेली उत्पादने पहा आणि लक्षणे वाढल्यास Leaf Doctor चा सल्ला घ्या.`
        : `I understood your question: "${lastMessage}". Gemini is not configured yet. Inspect leaves regularly, check verified CottonGuard products, and consult a Leaf Doctor if symptoms worsen.`;

    return {
      status: 'fallback',
      source: 'fallback',
      reply,
    };
  }

  const system = `
You are CottonGuard Assistant, a friendly AI helper for cotton farmers.

Answer in ${language}. Use simple, practical language.
Do not invent pesticide brands, chemical dosages, diagnoses, or test results.
For chemical treatment, advise the farmer to consult a qualified expert
and check the verified CottonGuard product catalogue.

Disease names:
Bacterial Blight, Curl Virus, Fusarium Wilt, Healthy.

Farmer context:
- Farm: ${context.farmName || 'Not selected'}
- Crop: ${context.crop || 'Cotton'}
- Location: ${context.location || 'N/A'}
- Latest disease: ${context.latestDisease || 'N/A'}
- Leaf severity: ${context.leafSeverity ?? 'N/A'}
- History: ${context.historySummary || 'N/A'}
`;

  const historyText = messages
    .map((message) => {
      const role = message.role === 'user' ? 'Farmer' : 'Assistant';
      return `${role}: ${message.content || ''}`;
    })
    .join('\n');

  const prompt = `${system}

Conversation:
${historyText}

Assistant:`;

  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
    });

    const reply = await generateContentWithRetry(model, prompt);

    return {
      status: 'generated',
      source: 'gemini',
      reply: reply.trim(),
    };
  } catch (error) {
    console.error(
      '[Gemini chat]',
      getErrorStatus(error) || '',
      error.message
    );

    return {
      status: 'fallback',
      source: 'gemini-error-fallback',
      reply:
        context.language === 'mr'
          ? 'सध्या AI उत्तर देऊ शकत नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा किंवा Leaf Doctor चा सल्ला घ्या.'
          : 'The AI assistant is temporarily unavailable. Please try again shortly or consult a Leaf Doctor.',
      error: error.message,
    };
  }
}

function fallbackTreatmentPlan(context = {}, durationDays = 7) {
  const activities = [
    {
      title: 'Initial inspection',
      task: {
        title: 'Inspect affected cotton plants',
        details: 'Record visible symptoms and photograph affected leaves.',
      },
    },
    {
      title: 'Field sanitation',
      task: {
        title: 'Check field sanitation',
        details: 'Inspect plant debris and clean tools where appropriate.',
      },
    },
    {
      title: 'Water management',
      task: {
        title: 'Check water management',
        details: 'Inspect soil moisture, irrigation, and field drainage.',
      },
    },
    {
      title: 'Disease monitoring',
      task: {
        title: 'Monitor disease symptoms',
        details: 'Check for new spots, curling, yellowing, or wilting.',
      },
    },
    {
      title: 'Doctor review',
      task: {
        title: 'Review diagnosis with the doctor',
        details: 'Confirm appropriate next steps with the Leaf Doctor.',
      },
    },
    {
      title: 'Plant health check',
      task: {
        title: 'Record plant health observations',
        details: 'Record changes in symptoms and plant condition.',
      },
    },
    {
      title: 'AI follow-up scan',
      task: {
        title: 'Upload a follow-up leaf image',
        details: 'Capture a clear image and compare it with the initial result.',
      },
    },
    {
      title: 'Progress review',
      task: {
        title: 'Review progress with the doctor',
        details: 'Share observations and confirm the next steps.',
      },
    },
    {
      title: 'Surrounding plant inspection',
      task: {
        title: 'Inspect surrounding plants',
        details: 'Check nearby plants for similar symptoms.',
      },
    },
    {
      title: 'Final assessment',
      task: {
        title: 'Complete the progress review',
        details: 'Summarize observations and discuss continued monitoring.',
      },
    },
  ];

  const days = Array.from({ length: durationDays }, (_, index) => ({
    day: index + 1,
    title: `Day ${index + 1} - ${activities[index].title}`,
    tasks: [activities[index].task],
  }));

  return {
    title: `${context.disease || 'Cotton'} Treatment and Monitoring Plan`,
    durationDays,
    doctorInstructions:
      'Gemini was unavailable. This is a draft for the Leaf Doctor to review and personalize before publishing.',
    days,
    status: 'fallback',
    source: 'fallback',
    published: false,
  };
}

/**
 * Generate a treatment schedule draft for a Leaf Doctor to review.
 * This function does not save or publish the plan.
 */
async function generateTreatmentPlanDraft(
  context = {},
  requestedDuration = 7
) {
  const durationDays = Number(requestedDuration);

  if (![7, 10].includes(durationDays)) {
    const error = new Error(
      'Treatment plan duration must be 7 or 10 days.'
    );
    error.status = 400;
    throw error;
  }

  const client = getClient();

  if (!client) {
    return fallbackTreatmentPlan(context, durationDays);
  }

  const language =
    context.language === 'mr' ? 'Marathi' : 'English';

  const prompt = `
You are CottonGuard AI, assisting a qualified Leaf Doctor
with a cotton crop monitoring plan in India.

Generate a DRAFT for the doctor to review.
Language: ${language}
Duration: exactly ${durationDays} days.

Available information:
- Crop: Cotton
- Disease prediction: ${context.disease || 'Unknown'}
- Model confidence: ${context.confidence ?? 'Not available'}%
- Leaf severity: ${context.leafSeverity ?? 'Not available'}%
- Severity level: ${context.severityLevel || 'Not available'}
- Farm name: ${context.farmName || 'Not available'}
- Farm area: ${context.area ?? 'Not available'} ${context.areaUnit || ''}
- Location: ${context.location || 'Not available'}
- Recent observations: ${context.previousReports || 'Not available'}

Rules:
1. Return exactly ${durationDays} days, numbered 1 through ${durationDays}.
2. Each day needs a title and 1 to 4 practical tasks.
3. Each task needs a short title and useful details.
4. Include relevant monitoring, sanitation, irrigation checks,
   observations, and doctor follow-up.
5. Do not promise recovery by a particular day.
6. Do not invent diagnoses, measurements, or test results.
7. Do not recommend pesticide brands, chemical dosages,
   or unverified application instructions.
8. If chemical treatment may be necessary, ask the doctor to verify
   the product label, crop stage, and local agricultural guidance.
9. Keep the language simple and practical.
10. This is a draft, not a prescription. The doctor must review it.
11. Return valid JSON only, without Markdown or code fences.

Required structure:
{
  "title": "Short plan title",
  "durationDays": ${durationDays},
  "doctorInstructions": "Instructions for the doctor",
  "days": [
    {
      "day": 1,
      "title": "Daily heading",
      "tasks": [
        {
          "title": "Short task title",
          "details": "Practical task instructions"
        }
      ]
    }
  ]
}
`;

  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
    });

    const responseText = await generateContentWithRetry(model, prompt);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON object returned for treatment plan.');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (
      !Array.isArray(parsed.days) ||
      parsed.days.length !== durationDays
    ) {
      throw new Error('Invalid number of treatment-plan days.');
    }

    const days = parsed.days.map((day, index) => ({
      day: index + 1,
      title: String(day.title || `Day ${index + 1}`).trim(),
      tasks: (Array.isArray(day.tasks) ? day.tasks : [])
        .map((task) => ({
          title: String(task.title || '').trim(),
          details: String(task.details || '').trim(),
        }))
        .filter((task) => task.title && task.details)
        .slice(0, 4),
    }));

    if (days.some((day) => day.tasks.length === 0)) {
      throw new Error('One or more treatment-plan days have no valid tasks.');
    }

    return {
      title: String(parsed.title || 'Cotton Treatment Plan').trim(),
      durationDays,
      doctorInstructions: String(
        parsed.doctorInstructions || ''
      ).trim(),
      days,
      status: 'generated',
      source: 'gemini',
      published: false,
    };
  } catch (error) {
    console.error(
      '[Gemini treatment plan]',
      getErrorStatus(error) || '',
      error.message
    );

    return {
      ...fallbackTreatmentPlan(context, durationDays),
      source: 'gemini-error-fallback',
      error: error.message,
    };
  }
}

module.exports = {
  generateRecommendation,
  chat,
  fallbackRecommendation,
  generateTreatmentPlanDraft,
};
