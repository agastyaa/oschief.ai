import { netFetch } from './net-request'

/** Compare adjacent Deepgram tokens (handles trailing punctuation on words). */
function dgWordKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^['"([{]+/g, '')
    .replace(/['"})\].,!?;:]+$/g, '')
    .trim()
}

/**
 * Prefer word-level array when present — avoids some duplicate tokens in `transcript` string
 * from Nova models; fall back to transcript.
 */
function extractDeepgramText(json: {
  results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: Array<{ word?: string; punctuated_word?: string }> }> }> }
}): string {
  const alt = json.results?.channels?.[0]?.alternatives?.[0]
  if (!alt) return ''
  const words = alt.words
  if (Array.isArray(words) && words.length > 0) {
    const parts: string[] = []
    let prevKey = ''
    for (const w of words) {
      const raw = (w.punctuated_word || w.word || '').trim()
      if (!raw) continue
      const key = dgWordKey(raw)
      if (key.length > 0 && key === prevKey) continue
      parts.push(raw)
      prevKey = key
    }
    const joined = parts.join(' ').trim()
    if (joined) return joined
  }
  return (alt.transcript || '').trim()
}

const MODEL_MAP: Record<string, string> = {
  'Nova-2': 'nova-2',
  'Nova-2 Medical': 'nova-2-medical',
  'Nova-2 Meeting': 'nova-2-meeting',
}

export async function sttDeepgram(
  wavBuffer: Buffer,
  modelName: string,
  apiKey: string,
  vocabulary?: string[]
): Promise<string> {
  const model = MODEL_MAP[modelName] || 'nova-2'
  const params = new URLSearchParams({ model, language: 'en', smart_format: 'true' })
  if (vocabulary?.length) {
    const keywords = vocabulary.slice(0, 100).map(t => `${encodeURIComponent(t)}:3`).join(',')
    params.set('keywords', keywords)
  }
  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`

  try {
    const { statusCode, data } = await netFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: wavBuffer,
    })

    if (statusCode === 401) {
      throw new Error('Invalid Deepgram API key. Check your key in Settings > AI Models.')
    }
    if (statusCode === 403) {
      throw new Error('Deepgram access denied. Check your API key and plan in Settings > AI Models.')
    }
    if (statusCode >= 400) {
      try {
        const json = JSON.parse(data)
        const msg = json.err_msg || json.message || data.slice(0, 200)
        throw new Error(`Deepgram error (${statusCode}): ${msg}`)
      } catch (err: any) {
        if (err.message?.startsWith('Deepgram error')) throw err
        throw new Error(`Deepgram request failed (HTTP ${statusCode}). Check Settings > AI Models.`)
      }
    }
    const json = JSON.parse(data)
    const text = extractDeepgramText(json)
    if (text) return text
    if (json.err_msg) throw new Error(`Deepgram error: ${json.err_msg}`)
    return ''
  } catch (err: any) {
    if (err.message?.includes('Deepgram') || err.message?.includes('API key')) throw err
    throw err
  }
}
