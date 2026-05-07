import type { PayloadHandler } from 'payload'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { ResolvedPluginConfig } from '../types'

const TicketRequestSchema = z.object({
  user_id: z.string(),
  agent_slug: z.string()
})

export function createEmbedTicketHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    try {
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
        return Response.json({ error: 'Missing or invalid Basic auth' }, { status: 401 })
      }

      const base64 = authHeader.substring(6)
      const decoded = Buffer.from(base64, 'base64').toString('utf8')
      const [customerId, apiKey] = decoded.split(':')

      if (!customerId || !apiKey) {
        return Response.json({ error: 'Malformed Basic auth' }, { status: 401 })
      }

      // Find the customer in the database
      const customersRes = await req.payload.find({
        collection: 'embed-customers' as any,
        where: {
          customerId: { equals: customerId }
        },
        limit: 1
      })

      const customer = customersRes.docs[0] as any
      if (!customer) {
        return Response.json({ error: 'Customer not found' }, { status: 401 })
      }

      if (customer.apiKey !== apiKey) {
        return Response.json({ error: 'Invalid API Key' }, { status: 401 })
      }

      // Check origin
      const origin = req.headers.get('origin')
      if (origin && customer.domain && customer.domain.length > 0) {
        const allowed = customer.domain.some((d: any) => origin === d.url || origin.endsWith(d.url))
        if (!allowed) {
          return Response.json({ error: 'Origin not allowed' }, { status: 403 })
        }
      }

      const body = await req.json().catch(() => ({}))
      const parsed = TicketRequestSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json({ error: 'Invalid body', details: parsed.error }, { status: 400 })
      }

      const { user_id, agent_slug } = parsed.data

      // Check allowed agents
      const isAllowedAgent = customer.allowedAgents?.some((a: any) => a.slug === agent_slug)
      if (!isAllowedAgent) {
        return Response.json({ error: 'Agent not allowed for this customer' }, { status: 403 })
      }

      // Issue JWT
      const payload = {
        iss: 'zetesis',
        customer_id: customerId,
        user_id,
        agent_slug,
        service_user_id: typeof customer.serviceUser === 'object' ? customer.serviceUser.id : customer.serviceUser
      }

      const ticket = jwt.sign(payload, customer.signingSecret, {
        expiresIn: '5m',
        jwtid: crypto.randomUUID()
      })

      return Response.json({ ticket })
    } catch (err) {
      console.error('[embed-ticket] Error issuing ticket:', err)
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
