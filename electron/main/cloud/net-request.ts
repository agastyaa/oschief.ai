/**
 * HTTPS requests using Electron's net module so we use the system certificate
 * store and proxy. Fixes "unable to get local issuer certificate" when Node's
 * built-in HTTPS would fail (e.g. corporate proxy, different CA bundle).
 */
import { net } from 'electron'
import { createWriteStream } from 'fs'

export async function netFetch(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: Buffer | string
  } = {}
): Promise<{ statusCode: number; data: string }> {
  const { method = 'GET', headers = {}, body } = options
  const res = await net.fetch(url, {
    method,
    headers: headers as HeadersInit,
    body: body ? (typeof body === 'string' ? body : new Uint8Array(body)) : undefined,
  })
  const data = await res.text()
  return { statusCode: res.status, data }
}

/** Stream a URL to a file with progress (uses system certs). Optional signal to cancel. */
export async function netFetchStream(
  url: string,
  destPath: string,
  onProgress: (bytesDownloaded: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await net.fetch(url, { method: 'GET', signal: signal as any })
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading`)
  const totalBytes = parseInt(res.headers.get('content-length') || '0', 10) || 0
  const body = res.body
  if (!body) throw new Error('No response body')
  const reader = body.getReader()
  const out = createWriteStream(destPath)
  let bytesDownloaded = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        out.write(Buffer.from(value))
        bytesDownloaded += value.length
        onProgress(bytesDownloaded, totalBytes)
      }
    }
    out.end()
    await new Promise<void>((resolve, reject) => {
      out.on('finish', () => resolve())
      out.on('error', reject)
    })
  } finally {
    reader.releaseLock()
  }
}
