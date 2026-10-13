const consultationService = require('../services/consultation.service');
const { getQuota } = require('../services/quota.service');

const geminiService = require('../services/gemini.service');

async function listDoctors(req, res, next) {
  try {
    const doctors = await consultationService.listDoctors();
    res.json({ success: true, doctors });
  } catch (err) {
    next(err);
  }
}

async function getDoctor(req, res, next) {
  try {
    const doctor = await consultationService.getDoctor(
      req.params.doctorId
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
      });
    }

    res.json({
      success: true,
      doctor,
    });
  } catch (err) {
    next(err);
  }
}

async function setAvailability(req, res, next) {
  try {
    const doctor =
      await consultationService.setAvailability(
        req.user.uid,
        req.body.slots
      );

    res.json({
      success: true,
      doctor,
    });
  } catch (err) {
    next(err);
  }
}

async function updateDoctorProfile(req, res, next) {
  try {
    const doctor =
      await consultationService.updateDoctorProfile(
        req.user.uid,
        req.body
      );

    res.json({
      success: true,
      doctor,
    });
  } catch (err) {
    next(err);
  }
}

async function book(req, res, next) {
  try {
    const result =
      await consultationService.bookConsultation(
        req.user.uid,
        req.body
      );

    const quota =
      await getQuota(req.user.uid);

    res.status(201).json({
      success: true,
      ...result,
      quota,
    });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const consultations =
      await consultationService.listConsultations(
        req.user
      );

    res.json({
      success: true,
      consultations,
    });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const consultation =
      await consultationService.getConsultation(
        req.params.consultationId,
        req.user
      );

    res.json({
      success: true,
      consultation,
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const consultation =
      await consultationService.updateConsultation(
        req.params.consultationId,
        req.user,
        req.body
      );

    res.json({
      success: true,
      consultation,
    });
  } catch (err) {
    next(err);
  }
}

async function farmerHistory(req, res, next) {
  try {
    const predictions =
      await consultationService.getFarmerFarmHistoryForDoctor(
        req.user.uid,
        req.params.farmerId,
        req.query.farmId
      );

    res.json({
      success: true,
      predictions,
    });
  } catch (err) {
    next(err);
  }
}

async function myQuota(req, res, next) {
  try {
    const quota =
      await getQuota(req.user.uid);

    res.json({
      success: true,
      quota,
    });
  } catch (err) {
    next(err);
  }
}

async function doctorReport(req, res, next) {
  try {
    const doctorReportService =
      require('../services/doctorReport.service');

    const report =
      await doctorReportService.generateDoctorReport(
        req.params.consultationId,
        req.user.uid
      );

    res.json({
      success: true,
      report,
    });
  } catch (err) {
    next(err);
  }
}

async function downloadDoctorReport(req, res, next) {
  try {
    const doctorReportService = require('../services/doctorReport.service');

    const report =
      await doctorReportService.generateDoctorReport(
        req.params.consultationId,
        req.user.uid
      );

    await doctorReportService.createDoctorReportPDF(
      report,
      res
    );
  } catch (err) {
    next(err);
  }
}


async function getTreatmentPlan(req, res, next) {
  try {
    const result = await consultationService.getTreatmentPlan(
      req.params.consultationId,
      req.user
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function saveTreatmentPlan(req, res, next) {
  try {
    const treatmentPlan = await consultationService.saveTreatmentPlan(
      req.params.consultationId,
      req.user.uid,
      req.body
    );
    res.json({ success: true, treatmentPlan });
  } catch (err) {
    next(err);
  }
}

async function updateTreatmentTask(req, res, next) {
  try {
    const treatmentPlan = await consultationService.updateTreatmentTask(
      req.params.consultationId,
      req.user,
      req.params.taskId,
      req.body.completed
    );
    res.json({ success: true, treatmentPlan });
  } catch (err) {
    next(err);
  }
}


async function generateTreatmentPlan(req, res, next) {
  try {
    const consultation = await consultationService.getConsultation(
      req.params.consultationId,
      req.user
    );

    // Only the assigned leaf doctor may generate a plan.
    if (
      req.user.role !== 'leaf_doctor' ||
      consultation.doctorId !== req.user.uid
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned leaf doctor can generate this plan.',
      });
    }

    if (!['accepted', 'completed'].includes(consultation.status)) {
      return res.status(400).json({
        success: false,
        message: 'Accept the consultation before generating a treatment plan.',
      });
    }

    const durationDays = Number(req.body.durationDays || 7);

    if (![7, 10].includes(durationDays)) {
      return res.status(400).json({
        success: false,
        message: 'Choose a 7-day or 10-day plan.',
      });
    }

    // Use the existing farm-history service instead of trusting
    // disease details supplied by the browser.
    const predictions =
      await consultationService.getFarmerFarmHistoryForDoctor(
        req.user.uid,
        consultation.farmerId,
        consultation.farmId
      );

    const latestPrediction = Array.isArray(predictions)
      ? [...predictions].sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        })[0]
      : null;

    const context = {
      disease: latestPrediction?.disease || 'Unknown',
      confidence: latestPrediction?.confidence ?? null,
      leafSeverity: latestPrediction?.leafSeverity ?? null,
      severityLevel: latestPrediction?.severityLevel || '',
      farmName: consultation.farmName || '',
      area: consultation.area ?? '',
      areaUnit: consultation.areaUnit || '',
      location: consultation.location || '',
      previousReports: (predictions || [])
        .slice(0, 5)
        .map((p) =>
          `${p.disease || 'Unknown disease'}, severity ${
            p.leafSeverity ?? 'unknown'
          }%, date ${p.createdAt || 'unknown'}`
        )
        .join('; '),
      language: req.body.language === 'mr' ? 'mr' : 'en',
    };

    const treatmentPlan =
      await geminiService.generateTreatmentPlanDraft(
        context,
        durationDays
      );

    // Return the draft only. Nothing is saved or published here.
    return res.json({
      success: true,
      treatmentPlan: {
        ...treatmentPlan,
        published: false,
      },
    });
  } catch (error) {
    next(error);
  }
}



module.exports = {
  listDoctors,
  getDoctor,
  setAvailability,
  updateDoctorProfile,
  book,
  list,
  getOne,
  update,
  farmerHistory,
  myQuota,
  doctorReport,
  downloadDoctorReport,
  getTreatmentPlan,
  saveTreatmentPlan,
  updateTreatmentTask,
  generateTreatmentPlan,
};