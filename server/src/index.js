require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { env } = require('./config/env');
const { initFirebase } = require('./config/firebase');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const farmsRoutes = require('./routes/farms.routes');
const predictionsRoutes = require('./routes/predictions.routes');
const farmPredictionsRoutes = require('./routes/farmPredictions.routes');
const productsRoutes = require('./routes/products.routes');
const consultationsRoutes = require('./routes/consultations.routes');
const doctorsRoutes = require('./routes/doctors.routes');
const chatRoutes = require('./routes/chat.routes');
const paymentRoutes = require('./routes/payment.routes');
const googleRoutes = require('./routes/google.routes');
const predCtrl = require('./controllers/prediction.controller');
const { authenticate } = require('./middleware/auth');
const { requireRole, ROLES } = require('./middleware/roles');

initFirebase();

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: [env.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'CottonGuard AI API',
    version: '1.0.0',
    aiModelMode: env.aiModelMode,
    paymentMode: env.paymentMode,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/farms', farmsRoutes);
app.use('/api/farms', farmPredictionsRoutes);
app.use('/api/predictions', predictionsRoutes);
app.post('/api/ai/recommendation', authenticate, requireRole(ROLES.FARMER), predCtrl.recommendation);
app.use('/api/products', productsRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/google', googleRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`CottonGuard AI API listening on http://localhost:${env.port}`);
});

module.exports = app;
