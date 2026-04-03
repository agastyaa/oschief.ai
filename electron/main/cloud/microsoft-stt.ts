/**
 * Microsoft Azure Speech Service STT — supports MAI-Transcribe-1 and standard models.
 *
 * API key format stored in keychain: "region:apikey" (e.g. "eastus:abc123...")
 * The region is extracted at call time.
 *
 * Short-audio REST API: up to 60 seconds per request (fine for chunked meeting audio).
 * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short
 */

import { netFetch } from './net-request'

function parseRegionKey(combined: string): { region: string; apiKey: string } {
  const colonIdx = combined.indexOf(':')
  if (colonIdx <= 0) {
    throw new Error(
      'Microsoft STT API key must be in "region:key" format (e.g. "eastus:abc123..."). ' +
      'Set this in Settings > AI Models.'
    )
  }
  return {
    region: combined.slice(0, colonIdx).trim(),
    apiKey: combined.slice(colonIdx + 1).trim(),
  }
}

export async function sttMicrosoft(
  wavBuffer: Buffer,
  modelName: string,
  combinedKey: string,
  prompt?: string
): Promise<string> {
  const { region, apiKey } = parseRegionKey(combinedKey)

  // Recognition mode: "conversation" is best for meetings
  const mode = 'conversation'
  const language = 'en-US'
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/${mode}/cognitiveservices/v1?language=${language}&format=detailed`

  const { statusCode, data } = await netFetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Accept': 'application/json',
    },
    body: wavBuffer,
  })

  if (statusCode === 401) {
    throw new Error('Invalid Microsoft Speech API key. Check your key and region in Settings > AI Models.')
  }
  if (statusCode === 403) {
    throw new Error('Microsoft Speech access denied. Check your subscription and region.')
  }
  if (statusCode >= 400) {
    throw new Error(`Microsoft Speech error (${statusCode}): ${data.slice(0, 300)}`)
  }

  try {
    const json = JSON.parse(data)

    if (json.RecognitionStatus === 'Success') {
      // Prefer detailed NBest when available
      if (json.NBest?.length > 0) {
        return (json.NBest[0].Display || json.NBest[0].Lexical || '').trim()
      }
      return (json.DisplayText || '').trim()
    }

    if (json.RecognitionStatus === 'NoMatch') {
      return '' // No speech detected — not an error
    }

    if (json.RecognitionStatus === 'InitialSilenceTimeout') {
      return '' // Only silence — not an error
    }

    // Other statuses (Error, BabbleTimeout, etc.)
    throw new Error(`Microsoft Speech: ${json.RecognitionStatus}`)
  } catch (err: any) {
    if (err.message?.includes('Microsoft Speech')) throw err
    // Parse failure
    return (data || '').trim()
  }
}
