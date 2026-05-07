import jwt from 'jsonwebtoken'
import type { PayloadRequest } from 'payload'

/**
 * Checks for a Bearer JWT in the Authorization header.
 * If present and valid, finds the EmbedCustomer and returns the associated service user.
 * This effectively acts as alternative auth for embed endpoints.
 */
export async function authenticateEmbedTicket(req: PayloadRequest): Promise<{ user: any; customerUserId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null

  const token = authHeader.substring(7)
  const decoded = jwt.decode(token) as any
  if (!decoded || !decoded.customer_id) return null

  // Find the customer to get the signing secret
  const customersRes = await req.payload.find({
    collection: 'embed-customers' as any,
    where: {
      customerId: { equals: decoded.customer_id }
    },
    limit: 1,
    depth: 1 // Fetch the service user as well
  })

  const customer = customersRes.docs[0] as any
  if (!customer) return null

  try {
    const verified = jwt.verify(token, customer.signingSecret) as any
    if (verified) {
      // Return the populated service user and the original customer user id
      return {
        user: typeof customer.serviceUser === 'object' ? customer.serviceUser : { id: customer.serviceUser },
        customerUserId: verified.user_id
      }
    }
  } catch (err) {
    console.error('[embed-auth] JWT verification failed:', err)
  }

  return null
}
