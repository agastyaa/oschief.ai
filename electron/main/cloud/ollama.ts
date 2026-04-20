const OLLAMA_BASE = 'http://localhost:11434'

/**
 * Chat with an Ollama model via POST /api/chat.
 * Used for both summarization and chat — unified endpoint.
 */
export async function chatOllama(
  messages: { role: string; content: string }[],
  modelName: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const url = `${OLLAMA_BASE}/api/chat`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        keep_alive: '30m', // Keep model loaded 30 min (was 5m — too aggressive, caused cold loads)
      }),
      signal: AbortSignal.timeout(180_000), // 3 min total timeout (model loading can take 60s+)
    })
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      throw new Error('Cannot reach Ollama at localhost:11434. Start it with `ollama serve` or open the Ollama app.')
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`Ollama timed out loading model "${modelName}". The model may be too large for your system, or Ollama is overloaded. Try a smaller model or restart Ollama.`)
    }
    throw new Error(`Ollama connection failed: ${err?.message ?? err}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 404 || body.includes('not found')) {
      throw new Error(`Model "${modelName}" not found in Ollama. Pull it first: ollama pull ${modelName}`)
    }
    throw new Error(`Ollama error (${res.status}): ${body.slice(0, 200)}`)
  }

  // Ollama streams newline-delimited JSON
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Ollama returned no response body')
  }

  const decoder = new TextDecoder()
  let fullResponse = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        const text = parsed.message?.content ?? ''
        if (text) {
          fullResponse += text
          onChunk?.({ text, done: false })
        }
        if (parsed.done) {
          onChunk?.({ text: '', done: true })
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer)
      const text = parsed.message?.content ?? ''
      if (text) {
        fullResponse += text
        onChunk?.({ text, done: false })
      }
    } catch {
      // skip
    }
  }

  if (!fullResponse && onChunk) {
    onChunk({ text: '', done: true })
  }

  return fullResponse
}

/** Check if Ollama is running and reachable. */
/**
 * R6 — pre-warm Ollama on app launch.
 *
 * Fires a tiny /api/generate with keep_alive=30m so the user's default model
 * is resident in RAM before the first real summary/coaching call. Without
 * this the first coaching run pays the cold-load tax (often 5-15s on 8B+
 * models) right when the user is waiting for the meeting summary.
 *
 * Silent on any failure — Ollama may not be running, may not have the model,
 * may be on a different host. This is an optimization, not a correctness
 * requirement. Emits an observability event via onEvent if provided.
 */
export async function prewarmOllama(
  modelName: string,
  opts: { onEvent?: (e: { type: 'ollama.prewarm'; model: string; ok: boolean; duration_ms: number }) => void } = {},
): Promise<boolean> {
  const start = Date.now()
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        // Empty prompt with keep_alive loads the model without generating tokens.
        // Ollama treats this as "just load and keep resident."
        prompt: '',
        keep_alive: '30m',
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000), // model load can take ~30s on cold disk
    })
    const ok = res.ok
    opts.onEvent?.({ type: 'ollama.prewarm', model: modelName, ok, duration_ms: Date.now() - start })
    return ok
  } catch {
    opts.onEvent?.({ type: 'ollama.prewarm', model: modelName, ok: false, duration_ms: Date.now() - start })
    return false
  }
}

export async function ollamaHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** List models available in the local Ollama instance. */
export async function ollamaListModels(): Promise<{ name: string; size: number; modifiedAt: string }[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.models ?? []).map((m: any) => ({
      name: m.name ?? m.model ?? '',
      size: m.size ?? 0,
      modifiedAt: m.modified_at ?? '',
    }))
  } catch {
    return []
  }
}

/** Get model info (context length, parameter count, etc.) */
export async function ollamaShowModel(modelName: string): Promise<{ contextLength: number; parameterSize: string } | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Extract from modelinfo or parameters
    const params = data.model_info ?? {}
    const contextLength = params['context_length'] ??
      Object.values(params).find((v: any) => typeof v === 'number' && v > 1000) ??
      8192
    const parameterSize = data.details?.parameter_size ?? ''
    return { contextLength: Number(contextLength), parameterSize }
  } catch {
    return null
  }
}

/**
 * Pull a model from the Ollama registry.
 * Streams progress events to the callback.
 */
export async function ollamaPullModel(
  modelName: string,
  onProgress?: (progress: { status: string; completed: number; total: number; percent: number }) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to pull model "${modelName}": ${body.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        const completed = parsed.completed ?? 0
        const total = parsed.total ?? 0
        onProgress?.({
          status: parsed.status ?? '',
          completed,
          total,
          percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        })
      } catch {
        // skip
      }
    }
  }
}
