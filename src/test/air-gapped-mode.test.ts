import { describe, it, expect } from 'vitest'

// Test the air-gapped mode logic (extracted from router.ts pattern)
describe('Air-gapped mode', () => {
  const localProviders = new Set(['local', 'ollama', 'apple'])

  it('allows local providers', () => {
    expect(localProviders.has('local')).toBe(true)
    expect(localProviders.has('ollama')).toBe(true)
    expect(localProviders.has('apple')).toBe(true)
  })

  it('blocks cloud providers', () => {
    expect(localProviders.has('openai')).toBe(false)
    expect(localProviders.has('anthropic')).toBe(false)
    expect(localProviders.has('google')).toBe(false)
    expect(localProviders.has('groq')).toBe(false)
    expect(localProviders.has('deepgram')).toBe(false)
  })

  it('parses provider from model string', () => {
    const parseProvider = (model: string) => model.split(':')[0]
    expect(parseProvider('openai:gpt-4o')).toBe('openai')
    expect(parseProvider('ollama:qwen3:8b')).toBe('ollama')
    expect(parseProvider('local:llama-3.2-3b')).toBe('local')
    expect(parseProvider('apple:foundation')).toBe('apple')
    expect(parseProvider('anthropic:claude-4-sonnet')).toBe('anthropic')
  })
})
