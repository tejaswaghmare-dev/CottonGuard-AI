const PDFDocument = require('pdfkit');
const { getDb } = require('../config/firebase');
const { getFarm } = require('./farm.service');

/**
 * Download an image from a public URL.
 *
 * Uses Node's built-in fetch().
 */
async function fetchImageBuffer(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Image request failed with status ${response.status}`
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(
      '[Doctor Report] Failed to fetch image:',
      err.message
    );

    return null;
  }
}

/**
 * Generate doctor report data.
 */
async function generateDoctorReport(
  consultationId,
  doctorId
) {
  const db = getDb();

  // ------------------------------------------------------------
  // Get consultation
  // ------------------------------------------------------------

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

  const consultation =
    consultationSnap.data();

  // ------------------------------------------------------------
  // Security
  // ------------------------------------------------------------

  if (consultation.doctorId !== doctorId) {
    throw Object.assign(
      new Error('Access denied'),
      { status: 403 }
    );
  }

  if (
    ![
      'confirmed',
      'accepted',
      'completed',
    ].includes(consultation.status)
  ) {
    throw Object.assign(
      new Error(
        'Doctor report is available only after consultation confirmation'
      ),
      { status: 400 }
    );
  }

  // ------------------------------------------------------------
  // Get farmer
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // Get farm
  // ------------------------------------------------------------

  let farm = null;

  if (consultation.farmId) {
    farm = await getFarm(
      consultation.farmId
    );
  }

  // ------------------------------------------------------------
  // Get prediction history
  // ------------------------------------------------------------

  let predictionQuery = db
    .collection('predictions')
    .where(
      'farmerId',
      '==',
      consultation.farmerId
    );

  const predictionSnap =
    await predictionQuery.get();

  let predictions =
    predictionSnap.docs.map(
      (doc) => doc.data()
    );

  // Restrict to consultation farm
  if (consultation.farmId) {
    predictions =
      predictions.filter(
        (p) =>
          p.farmId ===
          consultation.farmId
      );
  }

  // Newest first
  predictions.sort((a, b) =>
    (b.createdAt || '').localeCompare(
      a.createdAt || ''
    )
  );

  const latestPrediction =
    predictions[0] || null;

  // ------------------------------------------------------------
  // Previous consultations
  // ------------------------------------------------------------

  const previousConsultationsSnap =
    await db
      .collection('consultations')
      .where(
        'doctorId',
        '==',
        doctorId
      )
      .where(
        'farmerId',
        '==',
        consultation.farmerId
      )
      .get();

  const previousConsultations =
    previousConsultationsSnap.docs
      .map((doc) => doc.data())
      .filter(
        (c) =>
          c.consultationId !==
          consultationId
      )
      .sort((a, b) =>
        (b.createdAt || '').localeCompare(
          a.createdAt || ''
        )
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

/**
 * Create doctor PDF.
 *
 * The function is async because the YOLO annotated
 * image is downloaded from Cloudinary before adding
 * it to the PDF.
 */
async function createDoctorReportPDF(
  report,
  res
) {
  const {
    consultation,
    farmer,
    farm,
    latestPrediction,
    predictions,
    previousConsultations,
  } = report;

  // ------------------------------------------------------------
  // Download YOLO annotated image
  // ------------------------------------------------------------

  let yoloImageBuffer = null;

  if (
    latestPrediction?.yoloDetection
      ?.imageUrl
  ) {
    yoloImageBuffer =
      await fetchImageBuffer(
        latestPrediction
          .yoloDetection.imageUrl
      );
  }

  // ------------------------------------------------------------
  // Create PDF
  // ------------------------------------------------------------

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

  // ============================================================
  // HEADER
  // ============================================================

  doc
    .fontSize(22)
    .text('CottonGuard AI', {
      align: 'center',
    });

  doc
    .fontSize(16)
    .text(
      'Doctor Disease Consultation Report',
      {
        align: 'center',
      }
    );

  doc.moveDown();

  doc
    .fontSize(10)
    .text(
      `Generated: ${new Date().toLocaleString(
        'en-IN'
      )}`,
      {
        align: 'right',
      }
    );

  doc.moveDown();

  // ============================================================
  // 1. FARMER INFORMATION
  // ============================================================

  doc
    .fontSize(15)
    .text('1. Farmer Information');

  doc.moveDown(0.5);

  doc.fontSize(11);

  doc.text(
    `Name: ${
      farmer.displayName || 'N/A'
    }`
  );

  doc.text(
    `Email: ${
      farmer.email || 'N/A'
    }`
  );

  doc.text(
    `Phone: ${
      farmer.phone || 'N/A'
    }`
  );

  doc.moveDown();

  // ============================================================
  // 2. FARM INFORMATION
  // ============================================================

  doc
    .fontSize(15)
    .text('2. Farm Information');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (farm) {
    doc.text(
      `Farm Name: ${
        farm.farmName || 'N/A'
      }`
    );

    doc.text(
      `Crop: ${
        farm.crop || 'Cotton'
      }`
    );

    doc.text(
      `Area: ${
        farm.area ?? 'N/A'
      } ${
        farm.areaUnit || ''
      }`
    );

    doc.text(
      `Location: ${
        farm.locationLabel || 'N/A'
      }`
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
    doc.text(
      'No farm linked to this consultation.'
    );
  }

  doc.moveDown();

  // ============================================================
  // 3. LATEST AI DIAGNOSIS
  // ============================================================

  doc
    .fontSize(15)
    .text('3. Latest AI Diagnosis');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (latestPrediction) {
    doc.text(
      `Disease: ${
        latestPrediction.disease ||
        'N/A'
      }`
    );

    doc.text(
      `AI Confidence: ${formatPercent(
        latestPrediction.confidence
      )}`
    );

    doc.text(
      `Leaf Severity: ${formatPercent(
        latestPrediction.leafSeverity
      )}`
    );

    doc.text(
      `Severity Level: ${
        latestPrediction.severityLevel ||
        'N/A'
      }`
    );

    doc.text(
      `Affected Area: ${formatPercent(
        latestPrediction.affectedAreaPercent
      )}`
    );

    doc.text(
      `Prediction Date: ${
        latestPrediction.createdAt ||
        'N/A'
      }`
    );
  } else {
    doc.text(
      'No AI prediction found for this farm.'
    );
  }

  doc.moveDown();

  // ============================================================
  // YOLO DETECTION IMAGE
  // ============================================================

  if (yoloImageBuffer) {
    // Put the image on a separate page so it is large.
    doc.addPage();

    doc
      .fontSize(18)
      .text(
        'YOLO Disease Detection',
        {
          align: 'center',
        }
      );

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        'Annotated cotton leaf image showing detected disease regions with bounding boxes and confidence scores.',
        {
          align: 'center',
        }
      );

    doc.moveDown();

    try {
      doc.image(
        yoloImageBuffer,
        {
          fit: [495, 620],
          align: 'center',
          valign: 'center',
        }
      );
    } catch (err) {
      console.error(
        '[Doctor Report] Failed to insert YOLO image:',
        err.message
      );

      doc
        .fontSize(10)
        .text(
          'YOLO annotated image could not be inserted into the report.'
        );
    }

    doc.moveDown();

    if (
      latestPrediction?.detections?.length
    ) {
      doc
        .fontSize(11)
        .text(
          'Detected Objects'
        );

      doc.moveDown(0.3);

      latestPrediction.detections.forEach(
        (detection, index) => {
          const name =
            detection.class_name ||
            detection.className ||
            detection.name ||
            detection.class ||
            'Unknown';

          const confidence =
            detection.confidence ??
            detection.conf ??
            null;

          doc.text(
            `${index + 1}. ${name} — ${formatPercent(
              confidence
            )}`
          );
        }
      );
    }
  }

  // ============================================================
  // 4. AI RECOMMENDATION
  // ============================================================

  doc.addPage();

  doc
    .fontSize(15)
    .text('4. AI Recommendation');

  doc.moveDown(0.5);

  doc.fontSize(11);

  if (
    latestPrediction?.recommendation
  ) {
    const recommendation =
      typeof latestPrediction.recommendation ===
      'string'
        ? latestPrediction.recommendation
        : JSON.stringify(
            latestPrediction.recommendation,
            null,
            2
          );

    doc.text(
      recommendation
    );
  } else {
    doc.text(
      'No AI recommendation available.'
    );
  }

  doc.moveDown();

  // ============================================================
  // 5. MATCHING PRODUCTS
  // ============================================================

  doc
    .fontSize(15)
    .text('5. Matching Products');

  doc.moveDown(0.5);

  doc.fontSize(11);

  const products =
    latestPrediction
      ?.matchingProducts || [];

  if (products.length) {
    products.forEach(
      (product, index) => {
        doc.text(
          `${index + 1}. ${
            product.productName ||
            'Product'
          }`
        );

        doc.text(
          `   Manufacturer: ${
            product.manufacturer ||
            'N/A'
          }`
        );

        doc.text(
          `   Active Ingredient: ${
            product.activeIngredient ||
            'N/A'
          }`
        );

        doc.text(
          `   Usage: ${
            product.usageInformation ||
            'N/A'
          }`
        );

        doc.moveDown(0.3);
      }
    );
  } else {
    doc.text(
      'No matching products found.'
    );
  }

  doc.moveDown();

  // ============================================================
  // 6. DISEASE HISTORY
  // ============================================================

  doc
    .fontSize(15)
    .text('6. Disease History');

  doc.moveDown(0.5);

  doc.fontSize(10);

  if (predictions.length) {
    predictions.forEach(
      (prediction, index) => {
        doc.text(
          `${index + 1}. ${
            prediction.createdAt ||
            'Unknown date'
          }`
        );

        doc.text(
          `   Disease: ${
            prediction.disease ||
            'N/A'
          }`
        );

        doc.text(
          `   Severity: ${
            prediction.severityLevel ||
            'N/A'
          }`
        );

        doc.text(
          `   Confidence: ${formatPercent(
            prediction.confidence
          )}`
        );

        doc.moveDown(0.3);
      }
    );
  } else {
    doc.text(
      'No previous disease records.'
    );
  }

  doc.moveDown();

  // ============================================================
  // 7. PREVIOUS CONSULTATIONS
  // ============================================================

  doc
    .fontSize(15)
    .text(
      '7. Previous Consultations'
    );

  doc.moveDown(0.5);

  doc.fontSize(10);

  if (
    previousConsultations.length
  ) {
    previousConsultations.forEach(
      (c, index) => {
        doc.text(
          `${index + 1}. ${
            c.date || 'N/A'
          } ${
            c.time || ''
          }`
        );

        doc.text(
          `   Status: ${
            c.status || 'N/A'
          }`
        );

        if (c.doctorNotes) {
          doc.text(
            `   Doctor Notes: ${
              c.doctorNotes
            }`
          );
        }

        doc.moveDown(0.3);
      }
    );
  } else {
    doc.text(
      'No previous consultations.'
    );
  }

  doc.moveDown();

  // ============================================================
  // 8. CURRENT CONSULTATION
  // ============================================================

  doc
    .fontSize(15)
    .text(
      '8. Current Consultation'
    );

  doc.moveDown(0.5);

  doc.fontSize(11);

  doc.text(
    `Date: ${
      consultation.date || 'N/A'
    }`
  );

  doc.text(
    `Time: ${
      consultation.time || 'N/A'
    }`
  );

  doc.text(
    `Consultation Type: ${
      consultation.consultationType ||
      'video'
    }`
  );

  doc.text(
    `Farmer Notes: ${
      consultation.notes || 'None'
    }`
  );

  doc.text(
    `Doctor Notes: ${
      consultation.doctorNotes ||
      'Not added yet'
    }`
  );

  doc.moveDown(2);

  // ============================================================
  // DISCLAIMER
  // ============================================================

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

/**
 * Convert confidence/severity values to percentage.
 */
function formatPercent(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return 'N/A';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  // 0.85 -> 85%
  if (number <= 1) {
    return `${(
      number * 100
    ).toFixed(2)}%`;
  }

  return `${number.toFixed(2)}%`;
}

module.exports = {
  generateDoctorReport,
  createDoctorReportPDF,
};