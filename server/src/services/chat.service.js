const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { chat } = require('./gemini.service');
const { getFarm } = require('./farm.service');

async function sendChatMessage(farmerId, { sessionId, message, farmId, language, context }) {
  if (!message || !String(message).trim()) {
    throw Object.assign(new Error('Message is required'), { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  let sid = sessionId;

  if (!sid) {
    sid = uuidv4();
    await db.collection('chatSessions').doc(sid).set({
      sessionId: sid,
      farmerId,
      farmId: farmId || null,
      language: language || 'en',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Load recent messages
  const msgSnap = await db
    .collection('chatMessages')
    .where('sessionId', '==', sid)
    .get();
  const history = msgSnap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));

  history.push({ role: 'user', content: message });

  // Enrich context from farm
  let farmCtx = { ...(context || {}), language: language || 'en' };
  if (farmId) {
    try {
      const farm = await getFarm(farmId);
      if (farm && farm.farmerId === farmerId) {
        farmCtx.farmName = farm.farmName;
        farmCtx.crop = farm.crop;
        farmCtx.location = farm.locationLabel;
        const predSnap = await db.collection('predictions').where('farmId', '==', farmId).get();
        const preds = predSnap.docs.map((d) => d.data());
        preds.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (preds[0]) {
          farmCtx.latestDisease = preds[0].disease;
          farmCtx.leafSeverity = preds[0].leafSeverity;
        }
        farmCtx.historySummary = preds
          .slice(0, 5)
          .map((p) => `${p.disease} ${p.leafSeverity}% on ${p.createdAt?.slice(0, 10)}`)
          .join('; ');
      }
    } catch (_) {
      /* ignore */
    }
  }

  const ai = await chat(history, farmCtx);

  const userMsgId = uuidv4();
  const aiMsgId = uuidv4();

  await db.collection('chatMessages').doc(userMsgId).set({
    messageId: userMsgId,
    sessionId: sid,
    farmerId,
    role: 'user',
    content: message,
    createdAt: now,
  });

  const replyAt = new Date().toISOString();
  await db.collection('chatMessages').doc(aiMsgId).set({
    messageId: aiMsgId,
    sessionId: sid,
    farmerId,
    role: 'assistant',
    content: ai.reply,
    source: ai.source,
    createdAt: replyAt,
  });

  await db.collection('chatSessions').doc(sid).set(
    { updatedAt: replyAt, language: language || 'en', farmId: farmId || null },
    { merge: true }
  );

  return {
    sessionId: sid,
    reply: ai.reply,
    source: ai.source,
    userMessageId: userMsgId,
    assistantMessageId: aiMsgId,
  };
}

module.exports = { sendChatMessage };
