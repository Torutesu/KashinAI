/**
 * Stripe Checkout session creation (subscribe flow). Calls the Stripe REST API directly with an
 * injectable fetch so it is contract-testable without the Stripe SDK or a live account. The app's
 * paywall opens the returned URL in the browser; on completion Stripe fires the webhook this server
 * already handles (see stripe.ts / app.ts).
 */

export type CheckoutConfig = {
  secretKey: string
  priceId: string
  successUrl: string
  cancelUrl: string
  fetchImpl?: typeof fetch
}

export interface Billing {
  createCheckoutSession(userId: string): Promise<{ url: string }>
}

export function createStripeBilling(config: CheckoutConfig): Billing {
  const doFetch = config.fetchImpl ?? fetch
  return {
    async createCheckoutSession(userId: string): Promise<{ url: string }> {
      const body = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': config.priceId,
        'line_items[0][quantity]': '1',
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        client_reference_id: userId,
        'subscription_data[metadata][userId]': userId
      })

      const response = await doFetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      })

      if (!response.ok) {
        throw new Error(`stripe_checkout_failed:${response.status}`)
      }
      const json = (await response.json()) as { url?: string }
      if (!json.url) throw new Error('stripe_checkout_no_url')
      return { url: json.url }
    }
  }
}
