const chatService = require('../services/chat.service');
const { createPaymentOrder, confirmMockPayment } = require('../services/payment.service');

async function chat(req, res, next) {
  try {
    const result = await chatService.sendChatMessage(req.user.uid, {
      sessionId: req.body.sessionId,
      message: req.body.message,
      farmId: req.body.farmId,
      language: req.body.language,
      context: req.body.context,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/** Voice: frontend does STT; backend receives text same as chat */
async function chatVoice(req, res, next) {
  try {
    const transcript = req.body.transcript || req.body.message;
    const result = await chatService.sendChatMessage(req.user.uid, {
      sessionId: req.body.sessionId,
      message: transcript,
      farmId: req.body.farmId,
      language: req.body.language || 'mr',
      context: req.body.context,
    });
    res.json({ success: true, transcript, ...result });
  } catch (err) {
    next(err);
  }
}

async function createPayment(req, res, next) {
  try {
    const order = await createPaymentOrder({
      farmerId: req.user.uid,
      amount: req.body.amount,
      purpose: req.body.purpose,
      consultationId: req.body.consultationId,
      metadata: req.body.metadata,
    });
    res.status(201).json({ success: true, payment: order });
  } catch (err) {
    next(err);
  }
}

async function confirmPayment(req, res, next) {
  try {
    const payment = await confirmMockPayment(req.body.paymentId || req.params.paymentId, req.user.uid);
    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
}

module.exports = { chat, chatVoice, createPayment, confirmPayment };
