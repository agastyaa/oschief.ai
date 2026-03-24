/**
 * Google OAuth 2.0 for Desktop Apps (PKCE flow)
 * Opens a BrowserWindow for consent, captures auth code via loopback redirect.
 */
import { BrowserWindow } from 'electron'
import { netFetch } from '../cloud/net-request'
import { createServer, type Server } from 'http'
import { randomBytes, createHash } from 'crypto'
import { URL } from 'url'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ')

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Start Google OAuth flow — opens a BrowserWindow, returns tokens.
 */
export async function startGoogleOAuth(clientId: string): Promise<{
  ok: boolean
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  email?: string
  error?: string
}> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  return new Promise((resolve) => {
    let server: Server | null = null
    let authWindow: BrowserWindow | null = null

    // Start a local server to capture the redirect
    server = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      if (code) {
        res.end('<html><body><h2>✅ Authorization successful!</h2><p>You can close this window.</p></body></html>')
      } else {
        res.end('<html><body><h2>❌ Authorization failed</h2><p>You can close this window.</p></body></html>')
      }

      setTimeout(() => {
        server?.close()
        authWindow?.close()
      }, 500)

      if (error) {
        resolve({ ok: false, error: `OAuth error: ${error}` })
        return
      }
      if (!code) {
        resolve({ ok: false, error: 'No authorization code received' })
        return
      }

      // Exchange code for tokens
      const port = (server?.address() as any)?.port
      const redirectUri = `http://localhost:${port}`

      const body = new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }).toString()

      netFetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }).then(async ({ statusCode, data }) => {
        if (statusCode !== 200) {
          resolve({ ok: false, error: `Token exchange failed: ${data}` })
          return
        }
        const tokens = JSON.parse(data)

        // Fetch user email
        let email: string | undefined
        try {
          const { statusCode: sc, data: uData } = await netFetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          )
          if (sc === 200) email = JSON.parse(uData).email
        } catch { /* optional */ }

        resolve({
          ok: true,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          email,
        })
      }).catch((err: any) => {
        resolve({ ok: false, error: err.message })
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server!.address() as any).port
      const redirectUri = `http://localhost:${port}`

      const authUrl = new URL(GOOGLE_AUTH_URL)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      authWindow = new BrowserWindow({
        width: 520,
        height: 700,
        title: 'Sign in with Google',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })

      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        authWindow = null
        server?.close()
        resolve({ ok: false, error: 'Window closed by user' })
      })
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      server?.close()
      authWindow?.close()
      resolve({ ok: false, error: 'OAuth timed out' })
    }, 5 * 60 * 1000)
  })
}

/**
 * Refresh an expired access token.
 */
export async function refreshGoogleToken(
  clientId: string,
  refreshToken: string
): Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString()

  const { statusCode, data } = await netFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (statusCode !== 200) {
    return { ok: false, error: `Refresh failed: ${data}` }
  }

  const tokens = JSON.parse(data)
  return {
    ok: true,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  }
}
