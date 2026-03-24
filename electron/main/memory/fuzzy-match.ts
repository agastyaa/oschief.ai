/**
 * Fuzzy string matching utilities.
 * Shared by people-store and project-store.
 */

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Compute similarity between two strings (0 = completely different, 1 = identical).
 * Based on normalized Levenshtein distance.
 */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen
}

/**
 * Find the best fuzzy match in a list of candidates.
 * Returns the match and its similarity score, or null if no match above threshold.
 */
export function findBestMatch<T>(
  query: string,
  candidates: T[],
  getName: (item: T) => string,
  threshold = 0.7
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null
  const queryLower = query.toLowerCase()

  for (const candidate of candidates) {
    const name = getName(candidate).toLowerCase()
    // Exact match short-circuit
    if (name === queryLower) return { item: candidate, score: 1 }
    const score = similarity(queryLower, name)
    if (score >= threshold && (!best || score > best.score)) {
      best = { item: candidate, score }
    }
  }

  return best
}
