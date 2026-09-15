// Office data entry and a Protean/NSDL export routinely spell the same name slightly
// differently (a dropped middle name, a typo, extra initials) — nameSimilarity returns 0..1
// rather than requiring an exact match, shared by both PAN and TAN's ack/punching importers.

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

export function normalizeNameForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - levenshteinDistance(na, nb) / maxLen;
}

// A near-miss on spelling shouldn't block a match when a stronger signal (mobile/DOB) already
// lines up — but the name still has to be recognizably the same person/entity, not just an
// unrelated shared number.
export const NAME_SIMILARITY_THRESHOLD = 0.6;
