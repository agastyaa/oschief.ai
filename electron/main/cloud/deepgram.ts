import { netFetch } from './net-request'

const MODEL_MAP: Record<string, string> = {
  'Nova-2': 'nova-2',
  'Nova-2 Medical': 'nova-2-medical',
  'Nova-2 Meeting': 'nova-2-meeting',
}

export async function sttDeepgram(
  wavBuffer: Buffer,
  modelName: string,
  apiKey: string
): Promise<string> {
  const model = MODEL_MAP[modelName] || 'nova-2'
  const url = `https://api.deepgram.com/v1/listen?model=${model}&language=en&smart_format=true`

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
    if (json.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
      return json.results.channels[0].alternatives[0].transcript
    }
    if (json.err_msg) throw new Error(`Deepgram error: ${json.err_msg}`)
    return ''
  } catch (err: any) {
    if (err.message?.includes('Deepgram') || err.message?.includes('API key')) throw err
    throw err
  }
}
