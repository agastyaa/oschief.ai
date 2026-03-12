/**
 * Jira Authentication Module
 * Supports two modes:
 *   - OAuth 2.0 (Jira Cloud) — BrowserWindow → Atlassian consent → exchange code
 *   - API Token (Jira Server / Data Center) — manual entry
 *
 * Secrets stored via safeStorage keychain. Config in SQLite integrations table.
 */
import { BrowserWindow } from 'electron'
import { netFetch } from '../cloud/net-request'
import crypto from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────

export interface JiraAuthConfig {
  mode: 'oauth' | 'token'
  // OAuth fields
  cloudId?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number      // epoch ms
  // Token fields (Server/DC)
  siteUrl?: string
  email?: string
  apiToken?: string
}

export interface JiraCloudSite {
  id: string
  url: string
  name: string
  scopes: string[]
  avatarUrl: string
}

// ── OAuth 2.0 Constants ──────────────────────────────────────────────────

// NOTE: These are Jira's public OAuth endpoints. The client_id must be
// configured in the Atlassian Developer Console for this app.
const OAUTH_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize'
const OAUTH_TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
const OAUTH_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources'
const OAUTH_REDIRECT_URI = 'http://localhost:17832/jira/callback'
const OAUTH_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'offline_access',
].join(' ')

// In-memory state for OAuth flow
let pendingOAuthState: string | null = null
let oauthWindow: BrowserWindow | null = null

// ── OAuth Flow ───────────────────────────────────────────────────────────

/**
 * Start Jira Cloud OAuth 2.0 flow.
 * Opens a BrowserWindow for user to authorize.
 * Returns the authorization code or null if cancelled.
 */
export async function startJiraOAuth(
  clientId: string
): Promise<{ code: string; state: string } | null> {
  return new Promise((resolve) => {
    pendingOAuthState = crypto.randomBytes(16).toString('hex')

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: OAUTH_SCOPES,
      redirect_uri: OAUTH_REDIRECT_URI,
      state: pendingOAuthState,
      response_type: 'code',
      prompt: 'consent',
    })

    const authUrl = `${OAUTH_AUTHORIZE_URL}?${params.toString()}`

    oauthWindow = new BrowserWindow({
      width: 600,
      height: 700,
      title: 'Connect to Jira',
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    oauthWindow.loadURL(authUrl)

    // Listen for redirect
    oauthWindow.webContents.on('will-redirect', (_event, url) => {
      handleOAuthRedirect(url, resolve)
    })

    oauthWindow.webContents.on('will-navigate', (_event, url) => {
      handleOAuthRedirect(url, resolve)
    })

    oauthWindow.on('closed', () => {
      oauthWindow = null
      resolve(null) // User closed window
    })
  })
}

function handleOAuthRedirect(
  url: string,
  resolve: (value: { code: string; state: string } | null) => void
) {
  if (!url.startsWith(OAUTH_REDIRECT_URI)) return

  const parsed = new URL(url)
  const code = parsed.searchParams.get('code')
  const state = parsed.searchParams.get('state')

  if (oauthWindow) {
    oauthWindow.close()
    oauthWindow = null
  }

  if (code && state === pendingOAuthState) {
    resolve({ code, state })
  } else {
    resolve(null)
  }
  pendingOAuthState = null
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeJiraCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
} | null> {
  try {
    const { statusCode, data } = await netFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
      }),
    })

    if (statusCode !== 200) {
      console.error('[jira-auth] Token exchange failed:', statusCode, data)
      return null
    }

    const result = JSON.parse(data)
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresIn: result.expires_in,
    }
  } catch (err: any) {
    console.error('[jira-auth] Token exchange error:', err.message)
    return null
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshJiraToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
} | null> {
  try {
    const { statusCode, data } = await netFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (statusCode !== 200) {
      console.error('[jira-auth] Token refresh failed:', statusCode, data)
      return null
    }

    const result = JSON.parse(data)
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token || refreshToken,
      expiresIn: result.expires_in,
    }
  } catch (err: any) {
    console.error('[jira-auth] Token refresh error:', err.message)
    return null
  }
}

/**
 * Get accessible Jira Cloud sites for the authenticated user.
 */
export async function getAccessibleResources(
  accessToken: string
): Promise<JiraCloudSite[]> {
  try {
    const { statusCode, data } = await netFetch(OAUTH_RESOURCES_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (statusCode !== 200) return []
    return JSON.parse(data)
  } catch {
    return []
  }
}

// ── API Token Auth (Server / Data Center) ────────────────────────────────

/**
 * Test a Jira API token connection.
 */
export async function testJiraTokenConnection(
  siteUrl: string,
  email: string,
  apiToken: string
): Promise<{ ok: boolean; displayName?: string; error?: string }> {
  try {
    const base = siteUrl.replace(/\/$/, '')
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
    const { statusCode, data } = await netFetch(`${base}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })

    if (statusCode === 200) {
      const user = JSON.parse(data)
      return { ok: true, displayName: user.displayName }
    }

    return { ok: false, error: `HTTP ${statusCode}` }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' }
  }
}

/**
 * Test an OAuth connection by calling /myself.
 */
export async function testJiraOAuthConnection(
  cloudId: string,
  accessToken: string
): Promise<{ ok: boolean; displayName?: string; error?: string }> {
  try {
    const { statusCode, data } = await netFetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    )

    if (statusCode === 200) {
      const user = JSON.parse(data)
      return { ok: true, displayName: user.displayName }
    }

    return { ok: false, error: `HTTP ${statusCode}` }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' }
  }
}
