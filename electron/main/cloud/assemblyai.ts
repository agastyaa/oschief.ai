import { netFetch } from './net-request'

async function apiRequest(
  path: string,
  apiKey: string,
  method: string,
  body?: any
): Promise<any> {
  const url = `https://api.assemblyai.com${path}`
  const { statusCode, data } = await netFetch(url, {
    method,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (statusCode >= 400) throw new Error(`AssemblyAI API error (${statusCode}): ${data.slice(0, 200)}`)
  return JSON.parse(data)
}

async function uploadAudio(wavBuffer: Buffer, apiKey: string): Promise<string> {
  const url = 'https://api.assemblyai.com/v2/upload'
  const { statusCode, data } = await netFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: wavBuffer,
  })
  if (statusCode >= 400) throw new Error('Failed to upload audio to AssemblyAI')
  const json = JSON.parse(data)
  return json.upload_url
}

export async function sttAssemblyAI(wavBuffer: Buffer, apiKey: string): Promise<string> {
  const uploadUrl = await uploadAudio(wavBuffer, apiKey)

  const transcript = await apiRequest('/v2/transcript', apiKey, 'POST', {
    audio_url: uploadUrl,
    language_code: 'en',
  })

  const transcriptId = transcript.id

  // Poll for completion
  const maxAttempts = 30
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000))

    const result = await apiRequest(`/v2/transcript/${transcriptId}`, apiKey, 'GET')

    if (result.status === 'completed') {
      return result.text || ''
    }

    if (result.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${result.error}`)
    }
  }

  throw new Error('AssemblyAI transcription timed out')
}
