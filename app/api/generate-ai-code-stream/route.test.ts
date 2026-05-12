import { describe, it, expect } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/generate-ai-code-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function collectSSE(res: Response): Promise<Array<{ type: string; key?: string }>> {
  const text = await res.text()
  const events: Array<{ type: string; key?: string }> = []
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      events.push(JSON.parse(line.slice(5).trim()))
    }
  }
  return events
}

describe('POST /api/generate-ai-code-stream', () => {
  it('returns 400 for unknown module', async () => {
    const res = await POST(makeRequest({ modules: ['crm'] }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; name: string }
    expect(body.error).toBe('unknown_module')
    expect(body.name).toBe('crm')
  })

  it('streams all 5 step events for modules: ["store"]', async () => {
    const res = await POST(makeRequest({ modules: ['store'], instanceConfig: {} }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')

    const events = await collectSSE(res)
    expect(events).toHaveLength(5)

    const stepEvents = events.filter(e => e.type === 'step')
    const doneEvents = events.filter(e => e.type === 'done')
    expect(stepEvents).toHaveLength(4)
    expect(doneEvents).toHaveLength(1)
    expect(doneEvents[0].key).toBe('done')
  })

  it('streams events for multiple modules', async () => {
    const res = await POST(makeRequest({ modules: ['store', 'warehouse'] }))
    expect(res.status).toBe(200)
    const events = await collectSSE(res)
    expect(events.at(-1)?.type).toBe('done')
  })
})
