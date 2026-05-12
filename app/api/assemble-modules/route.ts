import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_MODULES = ['store', 'warehouse'] as const

interface AssembleRequest {
  modules: string[]
  instanceConfig?: Record<string, unknown>
}

const ASSEMBLY_STEPS = [
  { key: 'validate_modules', message: 'Validating modules…' },
  { key: 'copy_module_files', message: 'Copying module files…' },
  { key: 'generate_navigation', message: 'Generating navigation…' },
  { key: 'apply_theme', message: 'Applying theme configuration…' },
  { key: 'done', message: 'Assembly complete' },
] as const

export async function POST(req: NextRequest) {
  const body = await req.json() as AssembleRequest
  const { modules = [], instanceConfig = {} } = body

  for (const name of modules) {
    if (!(ALLOWED_MODULES as readonly string[]).includes(name)) {
      return Response.json({ error: 'unknown_module', name }, { status: 400 })
    }
  }

  const encoder = new TextEncoder()
  const total = ASSEMBLY_STEPS.length

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`))
      }

      for (let i = 0; i < ASSEMBLY_STEPS.length - 1; i++) {
        const step = ASSEMBLY_STEPS[i]
        send('step', { step: i + 1, total, key: step.key, message: step.message, modules })
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      send('done', {
        step: total,
        total,
        key: 'done',
        message: ASSEMBLY_STEPS[ASSEMBLY_STEPS.length - 1].message,
        modules,
        instanceId: (instanceConfig.instanceId as string) ?? `instance-${Date.now()}`,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
