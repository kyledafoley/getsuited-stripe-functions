// netlify/functions/refund.js  (CommonJS version)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/**
 * Expected POST body from Adalo:
 * {
 *   "payment_intent_id": "pi_123",     // required
 *   "amount": 2500,                    // cents, optional (omit for full remaining)
 *   "platform_fee_policy": "keep",     // "keep" (default) or "return"
 *   "reason": "requested_by_customer", // optional
 *   "idempotency_key": "order_123_refund_1" // optional
 * }
 *
 * Assumes Stripe Connect DESTINATION charges.
 * - reverse_transfer: true          (claws back the lister’s portion)
 * - refund_application_fee: false   (keeps your platform fee by default)
 */
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Simple admin auth (must set ADMIN_TOKEN in Netlify env)
    const headerToken = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    if (!ADMIN_TOKEN || headerToken !== ADMIN_TOKEN) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    const body = JSON.parse(event.body || '{}');
    const {
      payment_intent_id,
      amount,
      platform_fee_policy = 'keep',
      reason = 'requested_by_customer',
      idempotency_key,
    } = body;

    if (!payment_intent_id) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'payment_intent_id required' }) };
    }

    // Look up the PaymentIntent to validate and compute max refundable
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.status !== 'succeeded') {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: `PaymentIntent not succeeded (status=${pi.status})` }) };
    }

    const amountReceived = pi.amount_received ?? pi.amount; // cents
    const alreadyRefunded = pi.amount_refunded || 0;        // cents
    const maxRefundable = Math.max(0, amountReceived - alreadyRefunded);
    if (maxRefundable <= 0) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Nothing left to refund' }) };
    }

    // Determine refund amount
    let refundAmount = amount == null ? maxRefundable : amount;
    if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'amount must be a positive integer (cents)' }) };
    }
    if (refundAmount > maxRefundable) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: `amount exceeds max refundable (${maxRefundable} cents)` }) };
    }

    // Keep vs return platform fee
    const refundApplicationFee = String(platform_fee_policy).toLowerCase() === 'return';

    const params = {
      payment_intent: payment_intent_id,
      amount: refundAmount,
      reason,
      reverse_transfer: true,                 // pull lister’s portion back
      refund_application_fee: refundApplicationFee, // keep/return your fee
      metadata: { app: 'GetSuited', platform_fee_policy: refundApplicationFee ? 'return' : 'keep' },
    };

    const options = {};
    if (idempotency_key) options.idempotencyKey = idempotency_key;

    const refund = await stripe.refunds.create(params, options);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        refund_id: refund.id,
        status: refund.status,
        amount: refund.amount,
        payment_intent_id,
        platform_fee_policy: refundApplicationFee ? 'return' : 'keep',
        max_refundable_cents: maxRefundable,
        amount_already_refunded_cents: alreadyRefunded + refund.amount,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
