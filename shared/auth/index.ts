import { jwt } from 'hono/jwt'
import { createMiddleware } from 'hono/factory'

export const jwtMiddleware = jwt({ secret: process.env.JWT_SECRET ?? '', alg: 'HS256' })

export function requireRole(role: string) {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload') as { role?: string } | undefined
    if (payload?.role !== role) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}
