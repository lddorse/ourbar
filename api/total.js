const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (req, res) => {
  const [raisedCents, backers] = await Promise.all([
    redis.get('raised'),
    redis.get('backers'),
  ]);

  res.status(200).json({
    raised: (raisedCents || 0) / 100,
    backers: backers || 0,
  });
};
