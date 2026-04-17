import { ipcMain, BrowserWindow } from 'electron'
import { netFetch } from '../cloud/net-request'

/**
 * Third-party integrations: Jira, Slack, Teams, Mail cache, Gmail, Notifications.
 * jira (7) + slack (2) + teams (2) + mail (4) + gmail (2) + notify (1) = 18 channels.
 */
export function registerIntegrationsHandlers(): void {
  // Slack
  ipcMain.handle('slack:test-webhook', async (_e, webhookUrl: string) => {
    try {
      const { statusCode } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ OSChief Note connected successfully!' }),
      })
      return { ok: statusCode === 200 }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' }
    }
  })
  ipcMain.handle('slack:send-summary', async (_e, webhookUrl: string, payload: any) => {
    try {
      const { statusCode, data } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode === 200, error: statusCode !== 200 ? data : undefined }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Send failed' }
    }
  })

  // Microsoft Teams
  ipcMain.handle('teams:test-webhook', async (_e, webhookUrl: string) => {
    try {
      const payload = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [{ type: 'TextBlock', text: '✅ OSChief Note connected successfully!', weight: 'Bolder', wrap: true }],
          },
        }],
      }
      const { statusCode } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode >= 200 && statusCode < 300 }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' }
    }
  })
  ipcMain.handle('teams:send-summary', async (_e, webhookUrl: string, payload: any) => {
    try {
      const { statusCode, data } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode >= 200 && statusCode < 300, error: statusCode >= 300 ? data : undefined }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Send failed' }
    }
  })

  // Jira
  ipcMain.handle('jira:test-token', async (_e, siteUrl: string, email: string, apiToken: string) => {
    const { testJiraTokenConnection } = await import('../integrations/jira-auth')
    return testJiraTokenConnection(siteUrl, email, apiToken)
  })
  ipcMain.handle('jira:get-projects', async (_e, configJson: string) => {
    const { getJiraProjects } = await import('../integrations/jira-api')
    return getJiraProjects(JSON.parse(configJson))
  })
  ipcMain.handle('jira:get-issue-types', async (_e, configJson: string, projectKey: string) => {
    const { getJiraIssueTypes } = await import('../integrations/jira-api')
    return getJiraIssueTypes(JSON.parse(configJson), projectKey)
  })
  ipcMain.handle('jira:search-users', async (_e, configJson: string, query: string) => {
    const { searchJiraUsers } = await import('../integrations/jira-api')
    return searchJiraUsers(JSON.parse(configJson), query)
  })
  ipcMain.handle('jira:create-issue', async (_e, configJson: string, issueData: any) => {
    const { createJiraIssue } = await import('../integrations/jira-api')
    return createJiraIssue(JSON.parse(configJson), issueData)
  })
  ipcMain.handle('jira:bulk-create', async (_e, configJson: string, issues: any[]) => {
    const { bulkCreateJiraIssues } = await import('../integrations/jira-api')
    return bulkCreateJiraIssues(JSON.parse(configJson), issues)
  })
  ipcMain.handle('jira:get-issue', async (_e, configJson: string, issueKey: string) => {
    const { getJiraIssue } = await import('../integrations/jira-api')
    return getJiraIssue(JSON.parse(configJson), issueKey)
  })

  // Gmail
  ipcMain.handle('gmail:fetch-threads', async (_e, accessToken: string, emailAddresses: string[], maxResults?: number) => {
    const { fetchGmailThreads } = await import('../integrations/google-gmail')
    return fetchGmailThreads(accessToken, emailAddresses, maxResults)
  })
  ipcMain.handle('gmail:context-for-people', async (_e, accessToken: string, emailAddresses: string[]) => {
    const { fetchGmailContextForPeople } = await import('../integrations/google-gmail')
    return fetchGmailContextForPeople(accessToken, emailAddresses)
  })

  // Mail cache
  ipcMain.handle('mail:sync-now', async () => {
    try {
      const { syncGmailThreads } = await import('../integrations/mail-store')
      return await syncGmailThreads()
    } catch (err: any) {
      return { ok: false, synced: 0, error: err.message }
    }
  })
  ipcMain.handle('mail:get-threads-for-person', async (_e, personId: string, limit?: number) => {
    const { getMailThreadsForPerson } = await import('../integrations/mail-store')
    return getMailThreadsForPerson(personId, limit ?? 5)
  })
  ipcMain.handle('mail:get-recent', async (_e, daysPast?: number) => {
    const { getRecentMailThreads } = await import('../integrations/mail-store')
    return getRecentMailThreads(daysPast ?? 7)
  })
  ipcMain.handle('mail:get-stats', async (_e, since: string) => {
    const { getMailStats } = await import('../integrations/mail-store')
    return getMailStats(since)
  })

  // Notification
  ipcMain.handle('notify:meeting-prep', async (_e, data: { title: string; body: string }) => {
    try {
      const { Notification } = await import('electron')
      if (!Notification.isSupported()) return false
      const notif = new Notification({ title: data.title, body: data.body, silent: false })
      notif.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) { win.show(); win.focus() }
      })
      notif.show()
      return true
    } catch (err: any) {
      console.error('[notify:meeting-prep]', err)
      return false
    }
  })
}
