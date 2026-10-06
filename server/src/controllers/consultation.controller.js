const consultationService = require('../services/consultation.service');
const { getQuota } = require('../services/quota.service');

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
    const doctor = await consultationService.getDoctor(req.params.doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, doctor });
  } catch (err) {
    next(err);
  }
}

async function setAvailability(req, res, next) {
  try {
    const doctor = await consultationService.setAvailability(req.user.uid, req.body.slots);
    res.json({ success: true, doctor });
  } catch (err) {
    next(err);
  }
}

async function updateDoctorProfile(req, res, next) {
  try {
    const doctor = await consultationService.updateDoctorProfile(req.user.uid, req.body);
    res.json({ success: true, doctor });
  } catch (err) {
    next(err);
  }
}

async function book(req, res, next) {
  try {
    const result = await consultationService.bookConsultation(req.user.uid, req.body);
    const quota = await getQuota(req.user.uid);
    res.status(201).json({ success: true, ...result, quota });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const consultations = await consultationService.listConsultations(req.user);
    res.json({ success: true, consultations });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const consultation = await consultationService.getConsultation(req.params.consultationId, req.user);
    res.json({ success: true, consultation });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const consultation = await consultationService.updateConsultation(
      req.params.consultationId,
      req.user,
      req.body
    );
    res.json({ success: true, consultation });
  } catch (err) {
    next(err);
  }
}

async function farmerHistory(req, res, next) {
  try {
    const predictions = await consultationService.getFarmerFarmHistoryForDoctor(
      req.user.uid,
      req.params.farmerId,
      req.query.farmId
    );
    res.json({ success: true, predictions });
  } catch (err) {
    next(err);
  }
}

async function myQuota(req, res, next) {
  try {
    const quota = await getQuota(req.user.uid);
    res.json({ success: true, quota });
  } catch (err) {
    next(err);
  }
}

async function doctorReport(req, res, next) {
  try {
    const doctorReportService = require('../services/doctorReport.service');

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

    doctorReportService.createDoctorReportPDF(
      report,
      res
    );
  } catch (err) {
    next(err);
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
};
