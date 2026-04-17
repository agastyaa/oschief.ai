import { useState, useEffect } from 'react'
import { ExternalLink, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'
import { useCalendar, GOOGLE_CALENDAR_FEED_ID } from '@/contexts/CalendarContext'
import { JiraConnectDialog, type JiraConfig } from '@/components/JiraConnectDialog'
import { SlackConnectDialog, type SlackConfig } from '@/components/SlackConnectDialog'
import { AsanaConnectDialog, type AsanaConfig } from '@/components/AsanaConnectDialog'
import { TeamsConnectDialog, type TeamsConfig } from '@/components/TeamsConnectDialog'

/**
 * All 7 integration row components for the Connections settings tab.
 * Extracted from SettingsPage.tsx (v2.10 decomposition). Co-located here
 * because they share a common pattern (keychain-backed connect/disconnect +
 * connection-status badge) and are small enough to fit in one file.
 */

export function JiraIntegrationRow() {
  const api = getElectronAPI()
  const [connected, setConnected] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    api?.keychain?.get('jira-config').then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as JiraConfig
          setConnected(true)
          setDisplayName(config.displayName || config.email || 'Connected')
        } catch { /* ignore */ }
      }
    })
  }, [api])

  const handleDisconnect = async () => {
    await api?.keychain?.delete('jira-config')
    setConnected(false)
    setDisplayName('')
    toast.success('Jira disconnected')
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M11.53 2L3 10.53V14.47L11.53 22L14.47 22L22 14.47V10.53L11.53 2Z" fill="#2684FF" />
          </svg>
          <div>
            <span className="text-body-sm font-medium text-foreground">Jira</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected as ${displayName}` : 'Create tickets from action items'}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <JiraConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(config) => {
          setConnected(true)
          setDisplayName(config.displayName || config.email || 'Connected')
          setShowDialog(false)
          toast.success('Jira connected successfully')
        }}
      />
    </>
  )
}

export function SlackIntegrationRow() {
  const api = getElectronAPI()
  const [connected, setConnected] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    api?.keychain?.get('slack-config').then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as SlackConfig
          setConnected(true)
          setChannelName(config.channelName || 'Webhook')
        } catch { /* ignore */ }
      }
    })
  }, [api])

  const handleDisconnect = async () => {
    await api?.keychain?.delete('slack-config')
    setConnected(false)
    setChannelName('')
    toast.success('Slack disconnected')
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D"/>
            <path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.522h2.521zm0-1.27a2.527 2.527 0 0 1-2.521-2.522 2.527 2.527 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E"/>
          </svg>
          <div>
            <span className="text-body-sm font-medium text-foreground">Slack</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${channelName}` : 'Share summaries to channels'}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <SlackConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(_webhookUrl, channel) => {
          setConnected(true)
          setChannelName(channel || 'Webhook')
          setShowDialog(false)
          toast.success('Slack connected successfully')
        }}
      />
    </>
  )
}

export function AppleCalendarIntegrationRow() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('syag_apple_calendar_enabled') === 'true')
  const { refreshCalendarConnections } = useCalendar()

  const toggle = async () => {
    const next = !enabled
    localStorage.setItem('syag_apple_calendar_enabled', next ? 'true' : 'false')
    setEnabled(next)
    if (next) {
      const api = getElectronAPI()
      const result = await (api as any)?.apple?.calendarCheck?.()
      if (!result?.ok) {
        toast.error('Calendar access denied. Allow OSChief in System Settings → Privacy & Security → Calendars.')
        localStorage.setItem('syag_apple_calendar_enabled', 'false')
        setEnabled(false)
        return
      }
      toast.success('Apple Calendar connected')
    } else {
      toast.success('Apple Calendar disconnected')
    }
    await refreshCalendarConnections()
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="19" rx="2" fill="#FF3B30"/>
          <rect x="2" y="3" width="20" height="5" fill="#D32D26"/>
          <text x="12" y="17" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">31</text>
        </svg>
        <div>
          <span className="text-body-sm font-medium text-foreground">Apple Calendar</span>
          <p className="text-[11px] text-muted-foreground">
            {enabled ? 'Reading events from macOS Calendar.app' : 'Sync with all calendars on your Mac'}
          </p>
        </div>
      </div>
      {enabled ? (
        <button
          onClick={toggle}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={toggle}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Connect
        </button>
      )}
    </div>
  )
}

export function TeamsIntegrationRow() {
  const api = getElectronAPI()
  const [connected, setConnected] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    api?.keychain?.get('teams-config').then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as TeamsConfig
          setConnected(true)
          setChannelName(config.channelName || 'Webhook')
        } catch { /* ignore */ }
      }
    })
  }, [api])

  const handleDisconnect = async () => {
    await api?.keychain?.delete('teams-config')
    setConnected(false)
    setChannelName('')
    toast.success('Teams disconnected')
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M20.625 6.547h-3.516V4.36a2.11 2.11 0 0 0-2.11-2.11h-5.06A2.11 2.11 0 0 0 7.83 4.36v2.187H4.313a1.313 1.313 0 0 0-1.313 1.313v10.828A1.313 1.313 0 0 0 4.313 20h16.312A1.313 1.313 0 0 0 22 18.688V7.86a1.313 1.313 0 0 0-1.375-1.313zM9.89 4.36a.047.047 0 0 1 .047-.047h5.063a.047.047 0 0 1 .047.047v2.187H9.89V4.36z" fill="#5059C9"/>
            <circle cx="16.5" cy="3" r="2.5" fill="#7B83EB"/>
            <rect x="3" y="8" width="12" height="10" rx="1" fill="#4B53BC"/>
            <path d="M6 11h6v1H6zm0 2.5h6v1H6zm0 2.5h4v1H6z" fill="white"/>
          </svg>
          <div>
            <span className="text-body-sm font-medium text-foreground">Microsoft Teams</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${channelName}` : 'Share summaries to channels'}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <TeamsConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(_webhookUrl, channel) => {
          setConnected(true)
          setChannelName(channel || 'Webhook')
          setShowDialog(false)
          toast.success('Teams connected successfully')
        }}
      />
    </>
  )
}

export function GmailIntegrationRow() {
  const api = getElectronAPI() as any
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [threadCount, setThreadCount] = useState(0)

  useEffect(() => {
    api?.keychain?.get('google-calendar-config').then((raw: string | null) => {
      if (raw) {
        try {
          const config = JSON.parse(raw)
          setConnected(!!config.accessToken)
        } catch { /* ignore */ }
      }
    })
    api?.mail?.getStats?.().then((stats: any) => {
      if (stats?.threadCount) setThreadCount(stats.threadCount)
    }).catch(() => {})
  }, [api])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api?.mail?.syncNow?.()
      const stats = await api?.mail?.getStats?.()
      if (stats?.threadCount) setThreadCount(stats.threadCount)
      toast.success('Gmail synced')
    } catch {
      toast.error('Gmail sync failed')
    }
    setSyncing(false)
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M2 6l10 7 10-7v12H2V6z" fill="#EA4335" opacity="0.2"/>
          <path d="M22 6l-10 7L2 6" stroke="#EA4335" strokeWidth="2" strokeLinejoin="round"/>
          <rect x="2" y="6" width="20" height="12" rx="1" stroke="#EA4335" strokeWidth="1.5" fill="none"/>
        </svg>
        <div>
          <span className="text-body-sm font-medium text-foreground">Gmail</span>
          <p className="text-[11px] text-muted-foreground">
            {connected
              ? threadCount > 0
                ? `${threadCount} threads cached · syncs every 30 min`
                : 'Connected — syncs every 30 min'
              : 'Connect Google Calendar first to enable email context'}
          </p>
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-green">
            <Check className="h-3 w-3" /> Connected
          </span>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync now'}
          </button>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground">Requires Google Calendar</span>
      )}
    </div>
  )
}

export function AsanaIntegrationRow() {
  const api = getElectronAPI()
  const [connected, setConnected] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    api?.keychain?.get('asana-config').then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as AsanaConfig
          setConnected(true)
          setDisplayName(config.workspaceName || config.name || 'Connected')
        } catch { /* ignore */ }
      }
    })
  }, [api])

  const handleDisconnect = async () => {
    await api?.keychain?.delete('asana-config')
    setConnected(false)
    setDisplayName('')
    toast.success('Asana disconnected')
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="9" r="4" fill="#F06A6A"/>
            <circle cx="5" cy="17" r="3.5" fill="#F06A6A"/>
            <circle cx="19" cy="17" r="3.5" fill="#F06A6A"/>
          </svg>
          <div>
            <span className="text-body-sm font-medium text-foreground">Asana</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${displayName}` : 'Create tasks from action items'}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <AsanaConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(config) => {
          setConnected(true)
          setDisplayName(config.workspaceName || config.name || 'Connected')
          setShowDialog(false)
          toast.success('Asana connected successfully')
        }}
      />
    </>
  )
}

export function GoogleCalendarIntegrationRow() {
  const { removeCalendarFeed, refetchAllCalendars } = useCalendar()
  const api = getElectronAPI()
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [clientId, setClientId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api?.keychain?.get('google-calendar-config').then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw)
          setConnected(true)
          setEmail(config.email || 'Connected')
        } catch { /* ignore */ }
      }
    })
  }, [api])

  const handleConnect = async () => {
    if (!clientId.trim()) { setError('Client ID is required'); return }
    setConnecting(true); setError('')
    try {
      const result = await api?.google?.calendarAuth(clientId.trim())
      if (result?.ok) {
        const config = {
          clientId: clientId.trim(),
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: Date.now() + (result.expiresIn || 3600) * 1000,
          email: result.email,
        }
        await api?.keychain?.set('google-calendar-config', JSON.stringify(config))
        setConnected(true); setEmail(result.email || 'Connected')
        setShowSetup(false)
        toast.success('Google Calendar connected')
        void refetchAllCalendars()
      } else {
        setError(result?.error || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    await api?.keychain?.delete('google-calendar-config')
    removeCalendarFeed(GOOGLE_CALENDAR_FEED_ID)
    setConnected(false); setEmail('')
    toast.success('Google Calendar disconnected')
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="19" rx="2" fill="#4285F4"/>
            <rect x="2" y="3" width="20" height="5" fill="#1967D2"/>
            <rect x="6" y="10" width="4" height="4" rx="0.5" fill="white"/>
            <rect x="14" y="10" width="4" height="4" rx="0.5" fill="white"/>
            <rect x="6" y="15" width="4" height="4" rx="0.5" fill="white"/>
          </svg>
          <div>
            <span className="text-body-sm font-medium text-foreground">Google Calendar</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${email}` : 'Sync meetings and events via OAuth'}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Connect Google Calendar</h2>
              <button onClick={() => setShowSetup(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <span className="text-lg">&times;</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your Google OAuth Client ID to connect. You can create one in the{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                Google Cloud Console <ExternalLink className="h-2.5 w-2.5" />
              </a>
              . Enable the Google Calendar API and add a Desktop application OAuth client.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">OAuth Client ID</label>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789.apps.googleusercontent.com"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSetup(false)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !clientId.trim()}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  connecting ? 'bg-accent/50 text-accent-foreground cursor-wait' : 'bg-accent text-accent-foreground hover:bg-accent/90',
                  !clientId.trim() && 'opacity-50 cursor-not-allowed',
                )}
              >
                {connecting ? 'Connecting...' : 'Sign in with Google'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
