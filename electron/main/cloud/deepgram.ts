import https from 'https'

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

  return new Promise((resolve, reject) => {
    const url = `https://api.deepgram.com/v1/listen?model=${model}&language=en&smart_format=true`

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk.toString() })
      res.on('end', () => {
        const code = res.statusCode ?? 0
        if (code === 401) {
          reject(new Error('Invalid Deepgram API key. Check your key in Settings > AI Models.'))
          return
        }
        if (code === 403) {
          reject(new Error('Deepgram access denied. Check your API key and plan in Settings > AI Models.'))
          return
        }
        if (code >= 400) {
          try {
            const json = JSON.parse(data)
            const msg = json.err_msg || json.message || data.slice(0, 200)
            reject(new Error(`Deepgram error (${code}): ${msg}`))
          } catch {
            reject(new Error(`Deepgram request failed (HTTP ${code}). Check Settings > AI Models.`))
          }
          return
        }
        try {
          const json = JSON.parse(data)
          if (json.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
            resolve(json.results.channels[0].alternatives[0].transcript)
          } else if (json.err_msg) {
            reject(new Error(`Deepgram error: ${json.err_msg}`))
          } else {
            resolve('')
          }
        } catch (err) {
          reject(new Error(`Failed to parse Deepgram response: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    req.write(wavBuffer)
    req.end()
  })
}
