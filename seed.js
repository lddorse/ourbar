// One-time script to seed Upstash KV with the real historical totals from Stripe.
// Run manually with: node seed.js
const Stripe = require('stripe');
const { Redis } = require('@upstash/redis');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function main() {
  let raised = 0;
  let backers = 0;

  for await (const session of stripe.checkout.sessions.list({ status: 'complete', limit: 100 })) {
    const amountTotalCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
    raised += amountTotalCents / 100;
    backers += 1;
  }

  raised = Math.round(raised * 100) / 100;

  await redis.set('raised', raised);
  await redis.set('backers', backers);

  console.log(`Seeded 'raised' = ${raised}, 'backers' = ${backers}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
