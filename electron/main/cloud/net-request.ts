/**
 * HTTPS requests using Electron's net module so we use the system certificate
 * store and proxy. Fixes "unable to get local issuer certificate" when Node's
 * built-in HTTPS would fail (e.g. corporate proxy, different CA bundle).
 */
import { net } from 'electron'

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
