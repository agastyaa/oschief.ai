/**
 * Tests for ProjectDetailPage fixes:
 * - Link Meeting uses correct API path (api.db.notes.getAll, not api.notes.getAll)
 * - Add Person uses project_people table (not note_people with FK constraint)
 * - Add Action Item / Add Decision handlers work with correct params
 * - Delete buttons exist for decisions and commitments
 * - Unlink meeting button is visible (not opacity-0)
 * - TypeScript type definitions match preload API surface
 */
import { describe, it, expect } from 'vitest'

// ============================================================
// 1. API path correctness — verify ProjectDetailPage uses api.db.notes
// ============================================================
describe('ProjectDetailPage API paths', () => {
  it('should use api.db.notes.getAll() not api.notes.getAll()', async () => {
    // Read the actual source file to verify the fix
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Must NOT contain api.notes.getAll (wrong path)
    expect(source).not.toContain('api.notes.getAll()')

    // Must contain api.db.notes.getAll (correct path)
    expect(source).toContain('api.db.notes.getAll()')
  })
})

// ============================================================
// 2. Migration v14 — project_people table schema
// ============================================================
describe('project_people migration (v14)', () => {
  it('migration file contains project_people CREATE TABLE', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/storage/migrations.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain('CREATE TABLE IF NOT EXISTS project_people')
    expect(source).toContain('project_id TEXT NOT NULL REFERENCES projects(id)')
    expect(source).toContain('person_id TEXT NOT NULL REFERENCES people(id)')
    expect(source).toContain('PRIMARY KEY (project_id, person_id)')
  })

  it('migration v14 exists with correct version number', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/storage/migrations.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain('version: 14')
  })
})

// ============================================================
// 3. IPC handler uses project_people (not note_people)
// ============================================================
describe('linkPerson IPC handler', () => {
  it('should insert into project_people table, not note_people', async () => {
    const fs = await import('fs')
    const path = await import('path')
    // v2.10: handler moved from ipc-handlers.ts to ipc/memory.ts as part of
    // the IPC decomposition. Check the new home.
    const filePath = path.resolve(__dirname, '../../electron/main/ipc/memory.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Find the handler block
    const handlerStart = source.indexOf("'memory:projects-link-person'")
    expect(handlerStart).toBeGreaterThan(-1)

    // Extract the handler code (next ~200 chars after the handler name)
    const handlerBlock = source.slice(handlerStart, handlerStart + 300)

    // Must use project_people table
    expect(handlerBlock).toContain('project_people')

    // Must NOT use note_people table (old broken behavior)
    expect(handlerBlock).not.toContain('note_people')
  })
})

// ============================================================
// 4. Timeline query includes project_people
// ============================================================
describe('getProjectTimeline people query', () => {
  it('should query both note_people (via meetings) and project_people', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/memory/project-store.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Must include project_people in the people query
    expect(source).toContain('project_people')

    // Must UNION or join both sources
    expect(source).toContain('UNION')
  })

  it('commitments query should include project_id direct match', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/memory/project-store.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Commitments should be fetched by project_id directly (not just via note_projects)
    expect(source).toContain('c.project_id = ?')
  })
})

// ============================================================
// 5. Delete buttons exist in ProjectDetailPage
// ============================================================
describe('ProjectDetailPage delete functionality', () => {
  it('should have delete buttons for decisions', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Must have decision delete handler
    expect(source).toContain('decisions?.delete(decision.id)')
    expect(source).toContain('Decision deleted')
  })

  it('should have delete buttons for commitments/action items', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Must have commitment delete handler
    expect(source).toContain('commitments?.delete(c.id)')
    expect(source).toContain('Action item deleted')
  })
})

// ============================================================
// 6. Unlink button is always visible (not hidden behind opacity-0)
// ============================================================
describe('Meeting unlink button visibility', () => {
  it('unlink button should NOT have opacity-0 class', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Find the Unlink button area
    const unlinkIdx = source.indexOf('Unlink from project')
    expect(unlinkIdx).toBeGreaterThan(-1)

    // The button around the Unlink icon should NOT have opacity-0
    // (which made it invisible until hover)
    const buttonBlock = source.slice(Math.max(0, unlinkIdx - 300), unlinkIdx)
    expect(buttonBlock).not.toContain('opacity-0 group-hover:opacity-100')
  })
})

// ============================================================
// 7. Error handling exists on async handlers
// ============================================================
describe('Error handling on ProjectDetailPage handlers', () => {
  // v2.10: error messages rewritten for friendliness ("Couldn't" instead of "Failed to").
  // Tests assert presence of recovery-oriented error copy.
  it('Add Action Item handler has error catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("Couldn't add action item")
  })

  it('Add Decision handler has error catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("Couldn't add decision")
  })

  it('Unlink meeting handler has error catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("Couldn't unlink meeting")
  })

  it('Delete decision handler has error catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("Couldn't delete decision")
  })

  it('Delete action item handler has error catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../pages/ProjectDetailPage.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("Couldn't delete action item")
  })
})

// ============================================================
// 8. TypeScript type definitions match preload
// ============================================================
describe('TypeScript type definitions match preload', () => {
  let electronApiSource: string
  let preloadSource: string

  beforeAll(async () => {
    const fs = await import('fs')
    const path = await import('path')
    electronApiSource = fs.readFileSync(
      path.resolve(__dirname, '../lib/electron-api.ts'), 'utf-8'
    )
    preloadSource = fs.readFileSync(
      path.resolve(__dirname, '../../electron/preload/index.ts'), 'utf-8'
    )
  })

  it('projects type includes linkToNote', () => {
    expect(electronApiSource).toContain('linkToNote:')
  })

  it('projects type includes unlinkFromNote', () => {
    expect(electronApiSource).toContain('unlinkFromNote:')
  })

  it('projects type includes linkPerson', () => {
    expect(electronApiSource).toContain('linkPerson:')
  })

  it('decisions type includes create', () => {
    // Check that decisions section has create method
    const decisionsStart = electronApiSource.indexOf('decisions: {', electronApiSource.indexOf('memory'))
    const decisionsBlock = electronApiSource.slice(decisionsStart, decisionsStart + 500)
    expect(decisionsBlock).toContain('create:')
  })

  it('decisions type includes delete', () => {
    const decisionsStart = electronApiSource.indexOf('decisions: {', electronApiSource.indexOf('memory'))
    const decisionsBlock = electronApiSource.slice(decisionsStart, decisionsStart + 500)
    expect(decisionsBlock).toContain('delete:')
  })

  it('decisions type includes update', () => {
    const decisionsStart = electronApiSource.indexOf('decisions: {', electronApiSource.indexOf('memory'))
    const decisionsBlock = electronApiSource.slice(decisionsStart, decisionsStart + 500)
    expect(decisionsBlock).toContain('update:')
  })

  it('decisions type includes getUnassigned', () => {
    const decisionsStart = electronApiSource.indexOf('decisions: {', electronApiSource.indexOf('memory'))
    const decisionsBlock = electronApiSource.slice(decisionsStart, decisionsStart + 800)
    expect(decisionsBlock).toContain('getUnassigned:')
  })

  it('commitments type includes delete', () => {
    const commitmentsStart = electronApiSource.indexOf('commitments: {')
    const commitmentsBlock = electronApiSource.slice(commitmentsStart, commitmentsStart + 500)
    expect(commitmentsBlock).toContain('delete:')
  })

  it('commitments type includes snooze', () => {
    const commitmentsStart = electronApiSource.indexOf('commitments: {')
    const commitmentsBlock = electronApiSource.slice(commitmentsStart, commitmentsStart + 500)
    expect(commitmentsBlock).toContain('snooze:')
  })

  // Verify preload has matching methods
  it('preload has all decisions methods that type declares', () => {
    expect(preloadSource).toContain("'memory:decisions-create'")
    expect(preloadSource).toContain("'memory:decisions-delete'")
    expect(preloadSource).toContain("'memory:decisions-update'")
    expect(preloadSource).toContain("'memory:decisions-unassigned'")
  })

  it('preload has all commitments methods that type declares', () => {
    expect(preloadSource).toContain("'memory:commitments-delete'")
    expect(preloadSource).toContain("'memory:commitments-snooze'")
  })

  it('preload has all projects methods that type declares', () => {
    expect(preloadSource).toContain("'memory:projects-link-note'")
    expect(preloadSource).toContain("'memory:projects-unlink-note'")
    expect(preloadSource).toContain("'memory:projects-link-person'")
  })
})

// ============================================================
// 9. Auto-updater reads GitHub token from settings
// ============================================================
describe('Auto-updater GitHub token', () => {
  it('reads token from shell profile as fallback', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/auto-updater.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).toContain("readTokenFromShellProfile")

    const tokenLine = source.match(/const ghToken\s*=\s*(.+)/)
    expect(tokenLine).not.toBeNull()
    expect(tokenLine![1]).toContain('process.env')
    expect(tokenLine![1]).toContain('readTokenFromShellProfile')
  })
})

// ============================================================
// 10. addCommitment accepts projectId parameter
// ============================================================
describe('addCommitment function signature', () => {
  it('accepts projectId parameter', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../../electron/main/memory/commitment-store.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // The function should accept projectId
    const funcStart = source.indexOf('export function addCommitment')
    expect(funcStart).toBeGreaterThan(-1)
    const funcBlock = source.slice(funcStart, funcStart + 300)
    expect(funcBlock).toContain('projectId?:')
  })
})
