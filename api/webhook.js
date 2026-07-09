const Stripe = require('stripe');
const { Redis } = require('@upstash/redis');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amountTotalCents = typeof session.amount_total === 'number' ? session.amount_total : 0;

    // Stored in cents to keep Redis increments as integers; api/total.js converts back to dollars.
    await redis.incrby('raised', amountTotalCents);
    await redis.incr('backers');
  }

  res.status(200).json({ received: true });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
