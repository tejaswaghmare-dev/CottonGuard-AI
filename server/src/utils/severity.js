/**
 * Leaf severity helpers.
 */

function severityLevel(percent) {
  if (percent == null) return 'Unknown';

  if (percent < 15) return 'Healthy / Negligible';
  if (percent < 35) return 'Mild';
  if (percent < 60) return 'Moderate';

  return 'Severe';
}

module.exports = {
  severityLevel,
};