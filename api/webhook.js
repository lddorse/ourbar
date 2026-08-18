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
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  console.log('Received Stripe event:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amountTotalCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
    const amountTotalDollars = amountTotalCents / 100;

    console.log(
      'checkout.session.completed - payment_status:',
      session.payment_status,
      'amount_total (cents):',
      session.amount_total,
      '-> dollars:',
      amountTotalDollars
    );

    try {
      // 'raised' is stored in dollars; incrbyfloat keeps cent-precision amounts intact.
      const newRaised = await redis.incrbyfloat('raised', amountTotalDollars);
      const newBackers = await redis.incr('backers');
      console.log('Updated KV - raised:', newRaised, 'backers:', newBackers);
    } catch (err) {
      console.error('Failed to update KV:', err);
      res.status(500).json({ error: 'Failed to update KV' });
      return;
    }
  }

  res.status(200).json({ received: true });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
