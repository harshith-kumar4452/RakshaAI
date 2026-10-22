/**
 * Generate a unique case ID: JUST-XXXX
 * 4-digit random number
 */
export function generateCaseId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `JUST-${randomNum}`;
}

/**
 * Calculate NLP triad score and determine what follow-up questions are needed
 * Returns object with scores and missing fields
 */
export function calculateNLPTriad(description) {
  const text = description.toLowerCase();
  const THRESHOLD = 0.4; // Score below this needs follow-up

  // Temporal indicators (dates, times, durations)
  const temporalPatterns = [
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, // dates
    /\d{1,2}:\d{2}\s*(am|pm)?/gi, // times
    /(yesterday|today|last\s+week|last\s+month|ago|january|february|march|april|may|june|july|august|september|october|november|december)/gi,
    /(morning|afternoon|evening|night)/gi,
  ];
  const temporalScore = temporalPatterns.reduce((score, pattern) => {
    const matches = text.match(pattern);
    return score + (matches ? matches.length * 0.25 : 0);
  }, 0);

  // Location indicators
  const locationPatterns = [
    /(office|room|floor|building|cafeteria|parking|conference|meeting|desk|cubicle|hallway|elevator)/gi,
    /(at\s+\w+|in\s+\w+|near\s+\w+)/gi,
  ];
  const locationScore = locationPatterns.reduce((score, pattern) => {
    const matches = text.match(pattern);
    return score + (matches ? matches.length * 0.25 : 0);
  }, 0);

  // Specificity indicators (names, quotes, concrete details)
  const specificityPatterns = [
    /"[^"]+"/g, // quoted text
    /he\s+said|she\s+said|they\s+said/gi,
    /\b(told|asked|demanded|grabbed|touched|sent|messaged)\b/gi,
  ];
  const specificityScore = specificityPatterns.reduce((score, pattern) => {
    const matches = text.match(pattern);
    return score + (matches ? matches.length * 0.2 : 0);
  }, 0);

  // Vagueness penalties
  const vaguePatterns = [
    /\b(always|never|every\s+time|constantly)\b/gi,
    /\b(someone|somewhere|sometime)\b/gi,
  ];
  const vaguePenalty = vaguePatterns.reduce((penalty, pattern) => {
    const matches = text.match(pattern);
    return penalty + (matches ? matches.length * 0.3 : 0);
  }, 0);

  // Normalize scores to 0-1 range
  const normalizedTemporal = Math.min(temporalScore, 1);
  const normalizedLocation = Math.min(locationScore, 1);
  const normalizedSpecificity = Math.max(0, Math.min(specificityScore - vaguePenalty, 1));

  // Overall detail score
  const overallScore = (normalizedTemporal + normalizedLocation + normalizedSpecificity) / 3;

  // Determine what's missing
  const missingFields = [];
  if (normalizedTemporal < THRESHOLD) missingFields.push("temporal");
  if (normalizedLocation < THRESHOLD) missingFields.push("location");
  if (normalizedSpecificity < THRESHOLD) missingFields.push("specificity");

  return {
    temporal: normalizedTemporal,
    location: normalizedLocation,
    specificity: normalizedSpecificity,
    overall: overallScore,
    needsFollowUp: missingFields.length > 0,
    missingFields, // ["temporal", "location", "specificity"]
  };
}
