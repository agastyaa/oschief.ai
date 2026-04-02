/**
 * Asana API client — Personal Access Token (PAT) auth.
 * Follows the same pattern as jira-api.ts.
 */

import { net } from 'electron'

const BASE_URL = 'https://app.asana.com/api/1.0'

interface AsanaRequestOptions {
  method?: string
  body?: any
}

async function asanaFetch(path: string, token: string, options: AsanaRequestOptions = {}): Promise<{ statusCode: number; data: string }> {
  const url = `${BASE_URL}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }

  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: options.method || 'GET',
      headers,
    })

    let responseData = ''
    let statusCode = 0

    req.on('response', (response) => {
      statusCode = response.statusCode
      response.on('data', (chunk) => { responseData += chunk.toString() })
      response.on('end', () => resolve({ statusCode, data: responseData }))
      response.on('error', reject)
    })

    req.on('error', reject)

    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    req.end()
  })
}

// ── Verify Token ────────────────────────────────────────────

export async function testAsanaConnection(token: string): Promise<{ ok: boolean; name?: string; email?: string; error?: string }> {
  try {
    const { statusCode, data } = await asanaFetch('/users/me', token)
    if (statusCode !== 200) {
      return { ok: false, error: `Authentication failed (${statusCode})` }
    }
    const result = JSON.parse(data)
    return {
      ok: true,
      name: result.data?.name,
      email: result.data?.email,
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' }
  }
}

// ── Workspaces ──────────────────────────────────────────────

export async function getAsanaWorkspaces(token: string): Promise<{ gid: string; name: string }[]> {
  try {
    const { statusCode, data } = await asanaFetch('/workspaces?opt_fields=name', token)
    if (statusCode !== 200) return []
    const result = JSON.parse(data)
    return (result.data || []).map((w: any) => ({ gid: w.gid, name: w.name }))
  } catch {
    return []
  }
}

// ── Projects ────────────────────────────────────────────────

export async function getAsanaProjects(token: string, workspaceGid: string): Promise<{ gid: string; name: string }[]> {
  try {
    const { statusCode, data } = await asanaFetch(
      `/projects?workspace=${workspaceGid}&opt_fields=name&limit=100&archived=false`,
      token
    )
    if (statusCode !== 200) return []
    const result = JSON.parse(data)
    return (result.data || []).map((p: any) => ({ gid: p.gid, name: p.name }))
  } catch {
    return []
  }
}

// ── Sections (within a project) ─────────────────────────────

export async function getAsanaSections(token: string, projectGid: string): Promise<{ gid: string; name: string }[]> {
  try {
    const { statusCode, data } = await asanaFetch(`/projects/${projectGid}/sections?opt_fields=name`, token)
    if (statusCode !== 200) return []
    const result = JSON.parse(data)
    return (result.data || []).map((s: any) => ({ gid: s.gid, name: s.name }))
  } catch {
    return []
  }
}

// ── Create Task ─────────────────────────────────────────────

export interface AsanaTaskInput {
  name: string
  notes?: string
  due_on?: string  // YYYY-MM-DD
  projects?: string[]  // project GIDs
  workspace: string  // workspace GID
}

export async function createAsanaTask(token: string, task: AsanaTaskInput): Promise<{ ok: boolean; task?: { gid: string; permalink_url: string }; error?: string }> {
  try {
    const { statusCode, data } = await asanaFetch('/tasks', token, {
      method: 'POST',
      body: { data: task },
    })
    if (statusCode !== 201 && statusCode !== 200) {
      const err = JSON.parse(data)
      return { ok: false, error: err.errors?.[0]?.message || `Failed (${statusCode})` }
    }
    const result = JSON.parse(data)
    return {
      ok: true,
      task: {
        gid: result.data?.gid,
        permalink_url: result.data?.permalink_url || `https://app.asana.com/0/${task.projects?.[0] || '0'}/${result.data?.gid}`,
      },
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Task creation failed' }
  }
}

// ── Get Task ────────────────────────────────────────────────

export async function getAsanaTask(token: string, taskGid: string): Promise<{ gid: string; name: string; completed: boolean; permalink_url: string } | null> {
  try {
    const { statusCode, data } = await asanaFetch(`/tasks/${taskGid}?opt_fields=name,completed,permalink_url`, token)
    if (statusCode !== 200) return null
    const result = JSON.parse(data)
    return result.data
  } catch {
    return null
  }
}
