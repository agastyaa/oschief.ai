import Anthropic from '@anthropic-ai/sdk'

const COPART_BASE_URL = 'https://genie.copart.com/api'

// Map UI labels to Copart Genie model IDs (from env: ANTHROPIC_*)
const MODEL_MAP: Record<string, string> = {
  'Opus Plan': 'opusplan',
  'Claude Sonnet 4': 'anthropic/claude-sonnet-4-6',
  'Claude Haiku 4': 'anthropic/claude-haiku-4-5-20251001',
  'Claude Opus 4': 'anthropic/claude-opus-4-6',
}

export async function chatCopart(
  messages: { role: string; content: string }[],
  modelName: string,
  apiKey: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  // Copart Genie expects Authorization: Bearer (ANTHROPIC_AUTH_TOKEN); SDK authToken sends that
  const client = new Anthropic({
    authToken: apiKey,
    baseURL: COPART_BASE_URL,
  })
  const model = MODEL_MAP[modelName] || modelName

  const systemMessage = messages.find(m => m.role === 'system')
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  if (onChunk) {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: chatMessages,
    })

    let fullResponse = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text
        fullResponse += text
        onChunk({ text, done: false })
      }
    }
    onChunk({ text: '', done: true })
    return fullResponse
  }

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemMessage?.content,
    messages: chatMessages,
  })

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}
