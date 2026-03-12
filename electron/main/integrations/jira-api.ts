/**
 * Jira REST API Client
 * Handles issue CRUD, project/user lookups via both OAuth (Cloud) and Token (Server/DC).
 * All HTTP via netFetch for corporate proxy/cert compatibility.
 */
import { netFetch } from '../cloud/net-request'
import type { JiraAuthConfig } from './jira-auth'

// ── Types ────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string
  key: string
  name: string
  avatarUrls?: Record<string, string>
}

export interface JiraIssueType {
  id: string
  name: string
  subtask: boolean
  iconUrl?: string
}

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress?: string
  avatarUrls?: Record<string, string>
}

export interface JiraIssueInput {
  projectKey: string
  issueTypeId: string
  summary: string
  description?: string
  assigneeId?: string
  priority?: string
  dueDate?: string        // "YYYY-MM-DD"
  labels?: string[]
}

export interface JiraIssueResult {
  id: string
  key: string
  self: string
}

export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    status: { name: string; statusCategory: { key: string; colorName: string } }
    assignee?: { displayName: string; accountId: string }
    priority?: { name: string; iconUrl: string }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildBaseUrl(config: JiraAuthConfig): string {
  if (config.mode === 'oauth' && config.cloudId) {
    return `https://api.atlassian.com/ex/jira/${config.cloudId}`
  }
  return (config.siteUrl || '').replace(/\/$/, '')
}

function buildHeaders(config: JiraAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (config.mode === 'oauth' && config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`
  } else if (config.mode === 'token' && config.email && config.apiToken) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
    headers.Authorization = `Basic ${auth}`
  }

  return headers
}

// ── API Functions ─────────────────────────────────────────────────────────

/**
 * Get all projects visible to the authenticated user.
 */
export async function getJiraProjects(config: JiraAuthConfig): Promise<JiraProject[]> {
  const base = buildBaseUrl(config)
  const headers = buildHeaders(config)

  const { statusCode, data } = await netFetch(`${base}/rest/api/3/project/search?maxResults=50`, { headers })
  if (statusCode !== 200) {
    console.error('[jira-api] getProjects failed:', statusCode)
    return []
  }

  const result = JSON.parse(data)
  return (result.values || []).map((p: any) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    avatarUrls: p.avatarUrls,
  }))
}

/**
 * Get issue types for a specific project.
 */
export async function getJiraIssueTypes(
  config: JiraAuthConfig,
  projectKey: string
): Promise<JiraIssueType[]> {
  const base = buildBaseUrl(config)
  const headers = buildHeaders(config)

  const { statusCode, data } = await netFetch(
    `${base}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    { headers }
  )

  if (statusCode !== 200) {
    // Fallback: try the older createmeta endpoint
    const fallback = await netFetch(
      `${base}/rest/api/3/issuetype`,
      { headers }
    )
    if (fallback.statusCode === 200) {
      return JSON.parse(fallback.data)
        .filter((t: any) => !t.subtask)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          subtask: t.subtask,
          iconUrl: t.iconUrl,
        }))
    }
    return []
  }

  const result = JSON.parse(data)
  return (result.values || result || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    subtask: t.subtask ?? false,
    iconUrl: t.iconUrl,
  }))
}

/**
 * Search for Jira users (assignee picker).
 */
export async function searchJiraUsers(
  config: JiraAuthConfig,
  query: string
): Promise<JiraUser[]> {
  const base = buildBaseUrl(config)
  const headers = buildHeaders(config)

  const { statusCode, data } = await netFetch(
    `${base}/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`,
    { headers }
  )

  if (statusCode !== 200) return []
  return JSON.parse(data).map((u: any) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress,
    avatarUrls: u.avatarUrls,
  }))
}

/**
 * Create a single Jira issue.
 */
export async function createJiraIssue(
  config: JiraAuthConfig,
  issue: JiraIssueInput
): Promise<{ ok: boolean; issue?: JiraIssueResult; error?: string }> {
  const base = buildBaseUrl(config)
  const headers = buildHeaders(config)

  // Build ADF description (Atlassian Document Format)
  const descriptionAdf = issue.description ? {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: issue.description }],
      },
    ],
  } : undefined

  const body: any = {
    fields: {
      project: { key: issue.projectKey },
      issuetype: { id: issue.issueTypeId },
      summary: issue.summary,
    },
  }

  if (descriptionAdf) body.fields.description = descriptionAdf
  if (issue.assigneeId) body.fields.assignee = { accountId: issue.assigneeId }
  if (issue.priority) body.fields.priority = { name: issue.priority }
  if (issue.dueDate) body.fields.duedate = issue.dueDate
  if (issue.labels?.length) body.fields.labels = issue.labels

  try {
    const { statusCode, data } = await netFetch(`${base}/rest/api/3/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (statusCode === 201) {
      const result = JSON.parse(data)
      return {
        ok: true,
        issue: { id: result.id, key: result.key, self: result.self },
      }
    }

    console.error('[jira-api] createIssue failed:', statusCode, data)
    const errBody = JSON.parse(data)
    const errorMsg = errBody.errors
      ? Object.values(errBody.errors).join(', ')
      : errBody.errorMessages?.join(', ') || `HTTP ${statusCode}`
    return { ok: false, error: errorMsg }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to create issue' }
  }
}

/**
 * Create multiple Jira issues in sequence.
 */
export async function bulkCreateJiraIssues(
  config: JiraAuthConfig,
  issues: JiraIssueInput[]
): Promise<{ results: { ok: boolean; issue?: JiraIssueResult; error?: string }[] }> {
  const results = []
  for (const issue of issues) {
    results.push(await createJiraIssue(config, issue))
  }
  return { results }
}

/**
 * Get a Jira issue by key (e.g. "PROJ-123").
 */
export async function getJiraIssue(
  config: JiraAuthConfig,
  issueKey: string
): Promise<JiraIssue | null> {
  const base = buildBaseUrl(config)
  const headers = buildHeaders(config)

  const { statusCode, data } = await netFetch(
    `${base}/rest/api/3/issue/${issueKey}?fields=summary,status,assignee,priority`,
    { headers }
  )

  if (statusCode !== 200) return null

  const result = JSON.parse(data)
  return {
    id: result.id,
    key: result.key,
    fields: {
      summary: result.fields.summary,
      status: result.fields.status,
      assignee: result.fields.assignee,
      priority: result.fields.priority,
    },
  }
}

/**
 * Build the browse URL for a Jira issue.
 */
export function getJiraBrowseUrl(config: JiraAuthConfig, issueKey: string): string {
  if (config.mode === 'oauth' && config.cloudId) {
    // For cloud, we need the site URL which we may not have cached.
    // Default to the generic Atlassian URL pattern.
    return `https://atlassian.net/browse/${issueKey}`
  }
  const base = (config.siteUrl || '').replace(/\/$/, '')
  return `${base}/browse/${issueKey}`
}
