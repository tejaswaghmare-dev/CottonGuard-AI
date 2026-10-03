/**
 * Leaf severity helpers — separate from farm disease spread.
 */

function severityLevel(percent) {
  if (percent == null) return 'Unknown';
  if (percent < 15) return 'Healthy / Negligible';
  if (percent < 35) return 'Mild';
  if (percent < 60) return 'Moderate';
  return 'Severe';
}

/**
 * Estimated farm disease spread from multiple samples.
 * Never claim one leaf represents the whole farm.
 */
function estimateFarmSpread(predictions) {
  if (!predictions || predictions.length === 0) {
    return {
      estimatedSpreadPercent: null,
      samplesAnalyzed: 0,
      diseasedSamples: 0,
      label: 'Insufficient samples',
      disclaimer:
        'Estimated Farm Disease Spread is based on sampled leaves only and does not prove the infection percentage of the entire farm.',
    };
  }

  const diseased = predictions.filter(
    (p) => p.disease && p.disease.toLowerCase() !== 'healthy'
  );
  const percent = Math.round((diseased.length / predictions.length) * 100);

  return {
    estimatedSpreadPercent: percent,
    samplesAnalyzed: predictions.length,
    diseasedSamples: diseased.length,
    avgLeafSeverity:
      diseased.length > 0
        ? Math.round(
            diseased.reduce((s, p) => s + (p.leafSeverity || 0), 0) / diseased.length
          )
        : 0,
    label: 'Estimated Farm Disease Spread',
    disclaimer:
      'This is an estimate from sampled plants/leaves only. One leaf image cannot accurately determine farm-wide infection.',
  };
}

/**
 * Simple risk indicator: Low | Moderate | High
 */
function computeSpreadRisk({ spreadPercent, avgSeverity, diseasedCount, historyDiseasedCount }) {
  let score = 0;

  if (spreadPercent != null) {
    if (spreadPercent >= 40) score += 3;
    else if (spreadPercent >= 20) score += 2;
    else if (spreadPercent >= 5) score += 1;
  }

  if (avgSeverity != null) {
    if (avgSeverity >= 60) score += 2;
    else if (avgSeverity >= 35) score += 1;
  }

  if (diseasedCount >= 5) score += 1;
  if (historyDiseasedCount >= 3) score += 1;

  let risk = 'Low';
  if (score >= 5) risk = 'High';
  else if (score >= 2) risk = 'Moderate';

  return {
    risk,
    score,
    disclaimer: 'Estimated risk indicator based on available samples — not a guaranteed prediction.',
  };
}

module.exports = {
  severityLevel,
  estimateFarmSpread,
  computeSpreadRisk,
};
