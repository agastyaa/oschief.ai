import https from 'https'
import { netFetch } from './net-request'

const LLM_MODEL_MAP: Record<string, string> = {
  'Llama 3.3 70B': 'llama-3.3-70b-versatile',
  'Mixtral 8x7B': 'mixtral-8x7b-32768',
  'Whisper Large V3': 'whisper-large-v3',
}

function groqRequest(
  path: string,
  apiKey: string,
  method: string,
  body?: any,
  contentType = 'application/json'
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error(`Failed to parse Groq response: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body)
      } else {
        req.write(typeof body === 'string' ? body : JSON.stringify(body))
      }
    }
    req.end()
  })
}

export async function chatGroq(
  messages: { role: string; content: string }[],
  modelName: string,
  apiKey: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const model = LLM_MODEL_MAP[modelName] || modelName.toLowerCase().replace(/\s+/g, '-')

  if (onChunk) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages,
        stream: true,
      })

      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }, (res) => {
        let fullResponse = ''
        let buffer = ''

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              onChunk({ text: '', done: true })
              resolve(fullResponse)
              return
            }
            try {
              const json = JSON.parse(data)
              const text = json.choices?.[0]?.delta?.content || ''
              if (text) {
                fullResponse += text
                onChunk({ text, done: false })
              }
            } catch { /* ignore chunk parse */ }
          }
        })

        res.on('end', () => resolve(fullResponse))
      })

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  const response = await groqRequest('/openai/v1/chat/completions', apiKey, 'POST', {
    model,
    messages,
  })

  return response.choices?.[0]?.message?.content || ''
}

export async function sttGroq(wavBuffer: Buffer, apiKey: string): Promise<string> {
  const boundary = `----FormBoundary${Date.now()}`

  const parts: Buffer[] = []

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  ))
  parts.push(wavBuffer)
  parts.push(Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-large-v3-turbo\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `en\r\n` +
    `--${boundary}--\r\n`
  ))

  const body = Buffer.concat(parts)

  const { statusCode, data } = await netFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })
  if (statusCode >= 400) throw new Error(`Groq STT error (${statusCode}): ${data.slice(0, 200)}`)
  try {
    const json = JSON.parse(data)
    return json.text || ''
  } catch {
    return data.trim()
  }
}
