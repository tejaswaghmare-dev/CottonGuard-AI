const PDFDocument = require('pdfkit');
const { getDb } = require('../config/firebase');
const { getFarm } = require('./farm.service');

async function generateDoctorReport(consultationId, doctorId) {
  const db = getDb();

  // Get consultation
  const consultationSnap = await db
    .collection('consultations')
    .doc(consultationId)
    .get();

  if (!consultationSnap.exists) {
    throw Object.assign(
      new Error('Consultation not found'),
      { status: 404 }
    );
  }

  const consultation = consultationSnap.data();

  // Security: doctor can only access assigned consultation
  if (consultation.doctorId !== doctorId) {
    throw Object.assign(
      new Error('Access denied'),
      { status: 403 }
    );
  }

  if (!['confirmed', 'accepted', 'completed'].includes(consultation.status)) {
    throw Object.assign(
      new Error('Doctor report is available only after consultation confirmation'),
      { status: 400 }
    );
  }

  // Get farmer
  const farmerSnap = await db
    .collection('users')
    .doc(consultation.farmerId)
    .get();

  const farmer = farmerSnap.exists
    ? farmerSnap.data()
    : {
        displayName: 'Unknown Farmer',
        email: '',
        phone: '',
      };

  // Get farm
  let farm = null;

  if (consultation.farmId) {
    farm = await getFarm(consultation.farmId);
  }

  // Get prediction history
  let predictionQuery = db
    .collection('predictions')
    .where('farmerId', '==', consultation.farmerId);

  const predictionSnap = await predictionQuery.get();

  let predictions = predictionSnap.docs.map((doc) => doc.data());

  if (consultation.farmId) {
    predictions = predictions.filter(
      (p) => p.farmId === consultation.farmId
    );
  }

  predictions.sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  const latestPrediction = predictions[0] || null;

  // Doctor's previous consultations with this farmer
const previousConsultationsSnap = await db
  .collection('consultations')
  .where('doctorId', '==', doctorId)
  .where('farmerId', '==', consultation.farmerId)
  .get();

const previousConsultations = previousConsultationsSnap.docs
  .map((doc) => doc.data())
  .filter((c) => c.consultationId !== consultationId)
  .sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  return {
    consultation,
    farmer,
    farm,
    latestPrediction,
    predictions,
    previousConsultations,
  };
}

function createDoctorReportPDF(report, res) {
  const {
    consultation,
    farmer,
    farm,
    latestPrediction,
    predictions,
    previousConsultations,
  } = report;

  const doc = new PDFDocument({
    margin: 50,
    size: 'A4',
  });

  res.setHeader(
    'Content-Type',
    'application/pdf'
  );

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="CottonGuard-Doctor-Report-${consultation.consultationId}.pdf"`
  );

  doc.pipe(res);

  // Header
  doc
    .fontSize(22)
    .text('CottonGuard AI', {
      align: 'center',
    });

  doc
    .fontSize(16)
    .text('Doctor Disease Consultation Report', {
      align: 'center',
    });

  doc.moveDown();

  doc
    .fontSize(10)
    .text(
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      { align: 'right' }
    );

  doc.moveDown();

  // Farmer
  doc
    .fontSize(15)
    .text('1. Farmer Information');

  doc.moveDown(0.5);

  doc.fontSize(11);

  doc.text(`Name: ${farmer.displayName || 'N/A'}`);
  doc.text(`Email: ${farmer.email || 'N/A'}`);
  doc.text(`Phone: ${farmer.phone || 'N/A'}`);

  doc.moveDown();

  // Farm
  doc
    .fontSize(15)
    .text('2. Farm Information');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (farm) {
    doc.text(`Farm Name: ${farm.farmName || 'N/A'}`);
    doc.text(`Crop: ${farm.crop || 'Cotton'}`);
    doc.text(
      `Area: ${farm.area ?? 'N/A'} ${farm.areaUnit || ''}`
    );
    doc.text(
      `Location: ${farm.locationLabel || 'N/A'}`
    );

    if (
       farm.latitude != null &&
  farm.longitude != null
    ) {
      doc.text(
        `Coordinates: ${farm.latitude}, ${farm.longitude}`
      );
    }
  } else {
    doc.text('No farm linked to this consultation.');
  }

  doc.moveDown();

  // Latest AI diagnosis
  doc
    .fontSize(15)
    .text('3. Latest AI Diagnosis');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (latestPrediction) {
    doc.text(
      `Disease: ${latestPrediction.disease || 'N/A'}`
    );

    doc.text(
      `AI Confidence: ${formatPercent(latestPrediction.confidence)}`
    );

    doc.text(
      `Leaf Severity: ${formatPercent(latestPrediction.leafSeverity)}`
    );

    doc.text(
      `Severity Level: ${latestPrediction.severityLevel || 'N/A'}`
    );

    doc.text(
      `Affected Area: ${formatPercent(latestPrediction.affectedAreaPercent)}`
    );

    doc.text(
      `Estimated Farm Spread: ${formatPercent(
        latestPrediction.estimatedFarmSpread?.estimatedSpreadPercent
      )}`
    );

    doc.text(
      `Spread Risk: ${latestPrediction.spreadRisk?.risk || 'N/A'}`
    );

    doc.text(
      `Prediction Date: ${latestPrediction.createdAt || 'N/A'}`
    );
  } else {
    doc.text('No AI prediction found for this farm.');
  }

  doc.moveDown();

  // AI recommendation
  doc
    .fontSize(15)
    .text('4. AI Recommendation');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (latestPrediction?.recommendation) {
    const recommendation =
      typeof latestPrediction.recommendation === 'string'
        ? latestPrediction.recommendation
        : JSON.stringify(
            latestPrediction.recommendation,
            null,
            2
          );

    doc.text(recommendation);
  } else {
    doc.text('No AI recommendation available.');
  }

  doc.moveDown();

  // Products
  doc
    .fontSize(15)
    .text('5. Matching Products');

  doc.moveDown(0.5);

  doc.fontSize(11);

  const products =
    latestPrediction?.matchingProducts || [];

  if (products.length) {
    products.forEach((product, index) => {
      doc.text(
        `${index + 1}. ${product.productName || 'Product'}`
      );

      doc.text(
        `   Manufacturer: ${product.manufacturer || 'N/A'}`
      );

      doc.text(
        `   Active Ingredient: ${
          product.activeIngredient || 'N/A'
        }`
      );

      doc.text(
        `   Usage: ${
          product.usageInformation || 'N/A'
        }`
      );

      doc.moveDown(0.3);
    });
  } else {
    doc.text('No matching products found.');
  }

  doc.moveDown();

  // Disease history
  doc
    .fontSize(15)
    .text('6. Disease History');

  doc.moveDown(0.5);

  doc.fontSize(10);

  if (predictions.length) {
    predictions.forEach((prediction, index) => {
      doc.text(
        `${index + 1}. ${
          prediction.createdAt || 'Unknown date'
        }`
      );

      doc.text(
        `   Disease: ${prediction.disease || 'N/A'}`
      );

      doc.text(
        `   Severity: ${
          prediction.severityLevel || 'N/A'
        }`
      );

      doc.text(
        `   Confidence: ${formatPercent(
          prediction.confidence
        )}`
      );

      doc.moveDown(0.3);
    });
  } else {
    doc.text('No previous disease records.');
  }

  doc.moveDown();

  // Previous consultations
  doc
    .fontSize(15)
    .text('7. Previous Consultations');

  doc.moveDown(0.5);

  doc.fontSize(10);

  if (previousConsultations.length) {
    previousConsultations.forEach((c, index) => {
      doc.text(
        `${index + 1}. ${c.date || 'N/A'} ${
          c.time || ''
        }`
      );

      doc.text(
        `   Status: ${c.status || 'N/A'}`
      );

      if (c.doctorNotes) {
        doc.text(
          `   Doctor Notes: ${c.doctorNotes}`
        );
      }

      doc.moveDown(0.3);
    });
  } else {
    doc.text('No previous consultations.');
  }

  doc.moveDown();

  // Current consultation
  doc
    .fontSize(15)
    .text('8. Current Consultation');

  doc.moveDown(0.5);

  doc.fontSize(11);

  doc.text(
    `Date: ${consultation.date || 'N/A'}`
  );

  doc.text(
    `Time: ${consultation.time || 'N/A'}`
  );

  doc.text(
    `Consultation Type: ${
      consultation.consultationType || 'video'
    }`
  );

  doc.text(
    `Farmer Notes: ${
      consultation.notes || 'None'
    }`
  );

  doc.text(
    `Doctor Notes: ${
      consultation.doctorNotes || 'Not added yet'
    }`
  );

  doc.moveDown(2);

  doc
    .fontSize(9)
    .text(
      'Important: AI results are decision-support information. Final treatment decisions should be made by the qualified agricultural/plant doctor after reviewing the farmer and farm condition.',
      {
        align: 'left',
      }
    );

  doc.end();
}

function formatPercent(value) {
  if (value === undefined || value === null) {
    return 'N/A';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  // Convert 0.85 → 85%
  if (number <= 1) {
    return `${(number * 100).toFixed(2)}%`;
  }

  return `${number.toFixed(2)}%`;
}

module.exports = {
  generateDoctorReport,
  createDoctorReportPDF,
};