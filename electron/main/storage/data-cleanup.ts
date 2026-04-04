/**
 * Data Cleanup — prunes stale rows from accumulation tables to keep
 * the database small. Runs once daily via the central scheduler.
 *
 * Retention policy:
 *  - mail_threads: 30 days
 *  - routine_runs: 90 days
 *  - pipeline_quality_log: 30 days
 */

import { getDb } from './database'

export function runDataCleanup(): void {
  const db = getDb()

  try {
    // Mail threads older than 30 days
    const mailDeleted = db.prepare(`
      DELETE FROM mail_threads WHERE date < date('now', '-30 days')
    `).run()

    // Routine runs older than 90 days (keep recent history for UI)
    const runsDeleted = db.prepare(`
      DELETE FROM routine_runs WHERE started_at < datetime('now', '-90 days')
    `).run()

    // Pipeline quality logs older than 30 days
    const pqlDeleted = db.prepare(`
      DELETE FROM pipeline_quality_log WHERE timestamp < datetime('now', '-30 days')
    `).run()

    const total = (mailDeleted as any).changes + (runsDeleted as any).changes + (pqlDeleted as any).changes
    if (total > 0) {
      console.log(`[data-cleanup] Pruned ${total} stale rows (mail: ${(mailDeleted as any).changes}, runs: ${(runsDeleted as any).changes}, pql: ${(pqlDeleted as any).changes})`)
    }
  } catch (err) {
    // Tables may not exist yet — safe to ignore
    console.warn('[data-cleanup]', err)
  }
}
