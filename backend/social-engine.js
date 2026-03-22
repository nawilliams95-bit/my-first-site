/**
 * RealtyDataLabs — Social Auto-Posting Engine
 *
 * Runs as a Node.js service. Every 30 minutes:
 *  1. Fetches all RSS feeds in parallel
 *  2. Compares each article URL against Firestore to avoid reposts
 *  3. Filters: blacklisted domains, articles >48h old, already-posted
 *  4. Scores by recency + relevance, selects top article per schedule rules
 *  5. Sends headline + category to OpenAI GPT-4o-mini for commentary
 *  6. Posts to Twitter/X via API v2
 *  7. Logs completed post to Firestore
 *
 * SETUP:
 *  1. Copy .env.example to .env and fill in all values
 *  2. Run: npm install
 *  3. Run: node social-engine.js
 *
 * WORTH VERIFYING:
 *  - Twitter/X developer account with v2 read+write access
 *  - OpenAI API key
 *  - Firebase project with Firestore enabled
 *  - Firebase service account JSON path
 *  - Instagram Graph API requires a Facebook Business account and approved app
 */

'use strict';

require('dotenv').config();
const cron       = require('node-cron');
const fetch      = require('node-fetch');
const Parser     = require('rss-parser');
const { OpenAI } = require('openai');
const { TwitterApi } = require('twitter-api-v2');
const admin      = require('firebase-admin');

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================
const REQUIRED_ENV = [
  'OPENAI_API_KEY',
  'TWITTER_APP_KEY',
  'TWITTER_APP_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_DATABASE_URL',
];

REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`[ERROR] Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// ============================================================
// CLIENT INITIALIZATION
// ============================================================

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Twitter/X API v2
const twitterClient = new TwitterApi({
  appKey:            process.env.TWITTER_APP_KEY,
  appSecret:         process.env.TWITTER_APP_SECRET,
  accessToken:       process.env.TWITTER_ACCESS_TOKEN,
  accessSecret:      process.env.TWITTER_ACCESS_SECRET,
});
const rwClient = twitterClient.readWrite;

// Firebase
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
const db = admin.firestore();
const COLLECTION = 'posted-articles';

// RSS Parser
const parser = new Parser({
  customFields: {
    item: [['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail']],
  },
});

// ============================================================
// CONSTANTS
// ============================================================

// Blacklisted paywall domains — never post from these
const BLACKLIST = [
  'wsj.com', 'bloomberg.com', 'nytimes.com',
  'barrons.com', 'ft.com', 'theinformation.com',
];

// All RSS feeds by category
const CATEGORY_FEEDS = {
  market: [
    { url: 'https://www.zillow.com/research/feed/',                         label: 'Zillow Research' },
    { url: 'https://www.redfin.com/blog/feed/',                            label: 'Redfin News' },
    { url: 'https://www.realtor.com/news/feed/',                           label: 'Realtor.com' },
    { url: 'https://www.fhfa.gov/rss',                                     label: 'FHFA' },
    { url: 'https://www.calculatedriskblog.com/feeds/posts/default',       label: 'Calculated Risk' },
    { url: 'https://www.census.gov/newsroom/rss.xml',                      label: 'Census Bureau' },
  ],
  mortgage: [
    { url: 'https://www.freddiemac.com/blog/feed',                         label: 'Freddie Mac' },
    { url: 'https://www.mba.org/news-and-research/newsroom/rss.xml',       label: 'MBA' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml',           label: 'Federal Reserve' },
  ],
  economic: [
    { url: 'https://fredblog.stlouisfed.org/feed/',                        label: 'FRED Blog' },
    { url: 'https://www.bls.gov/feed/bls_latest.rss',                     label: 'BLS' },
    { url: 'https://home.treasury.gov/news/press-releases/rss.xml',       label: 'U.S. Treasury' },
  ],
  investment: [
    { url: 'https://www.biggerpockets.com/blog/feed/',                     label: 'BiggerPockets' },
    { url: 'https://www.apartmentlist.com/research/rss.xml',              label: 'Apartment List' },
  ],
  industry: [
    { url: 'https://www.housingwire.com/feed/',                           label: 'HousingWire' },
    { url: 'https://www.inman.com/feed/',                                 label: 'Inman' },
    { url: 'https://www.nar.realtor/rss',                                 label: 'NAR' },
  ],
  regional: [
    { url: 'https://www.stlouisfed.org/on-the-economy/rss',              label: 'St. Louis Fed' },
    { url: 'https://www.newyorkfed.org/research/rss',                    label: 'NY Fed' },
  ],
};

// Hashtags by category
const HASHTAGS = {
  mortgage:   '#MortgageRates #HomeLoans #RealEstate',
  market:     '#HousingMarket #RealEstate #HomeValues',
  economic:   '#Economy #FederalReserve #Inflation',
  investment: '#RealEstateInvesting #REI #Cashflow',
  industry:   '#RealEstateAgent #Realtor #PropTech',
  regional:   '#RealEstate #HousingMarket #LocalMarket',
};

// Priority posting hours (EST) — must be in this list to post
const PRIORITY_HOURS_EST = [8, 9, 12, 17, 18, 19];

// Max posts per day
const MAX_DAILY_POSTS = 8;

// Minimum minutes between posts
const MIN_MINUTES_BETWEEN_POSTS = 45;

// Breaking news keywords — bypass schedule if matched
const BREAKING_KEYWORDS = [
  'federal reserve', 'fed funds', 'rate hike', 'rate cut', 'fomc',
  'emergency', 'breaking', 'just released', 'just announced',
];

// TTL for Firestore records (30 days in ms)
const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================
// HELPERS
// ============================================================

function isBlacklisted(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return BLACKLIST.some(b => domain.includes(b));
  } catch {
    return false;
  }
}

function isRecent(pubDate) {
  if (!pubDate) return true;
  const age = Date.now() - new Date(pubDate).getTime();
  return age < 48 * 60 * 60 * 1000;
}

function isBreaking(title) {
  const lower = title.toLowerCase();
  return BREAKING_KEYWORDS.some(kw => lower.includes(kw));
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim().slice(0, 300);
}

function getCurrentHourEST() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }) | 0;
}

function log(msg, level = 'INFO') {
  console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}

// ============================================================
// FIRESTORE HELPERS
// ============================================================

async function hasBeenPosted(url) {
  try {
    const doc = await db.collection(COLLECTION).doc(encodeURIComponent(url)).get();
    return doc.exists;
  } catch (err) {
    log(`Firestore read error: ${err.message}`, 'WARN');
    return false;
  }
}

async function markAsPosted(article, platforms, tweetId = null) {
  try {
    await db.collection(COLLECTION).doc(encodeURIComponent(article.link)).set({
      url:       article.link,
      headline:  article.title,
      category:  article.category,
      source:    article.source,
      postedAt:  admin.firestore.FieldValue.serverTimestamp(),
      platforms,
      tweetId:   tweetId || null,
      engagement: { likes: 0, shares: 0, clicks: 0 },
      ttl:       new Date(Date.now() + RECORD_TTL_MS),
    });
  } catch (err) {
    log(`Firestore write error: ${err.message}`, 'ERROR');
  }
}

async function getPostCountToday() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const snap = await db.collection(COLLECTION)
      .where('postedAt', '>=', startOfDay)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function getLastPostTime() {
  try {
    const snap = await db.collection(COLLECTION)
      .orderBy('postedAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data().postedAt?.toDate() || null;
  } catch {
    return null;
  }
}

// ============================================================
// RSS FETCHING
// ============================================================

async function fetchFeed(feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    return (feed.items || []).map(item => ({
      title:    item.title || '',
      link:     item.link  || item.guid || '',
      pubDate:  item.pubDate || item.isoDate || '',
      source:   feedConfig.label,
      category: feedConfig._category,
    }));
  } catch {
    return [];
  }
}

async function fetchAllFeeds() {
  const allFeedConfigs = [];
  Object.entries(CATEGORY_FEEDS).forEach(([cat, feeds]) => {
    feeds.forEach(f => allFeedConfigs.push({ ...f, _category: cat }));
  });

  const results = await Promise.all(allFeedConfigs.map(f => fetchFeed(f)));
  const seen = new Set();

  return results
    .flat()
    .filter(a => a.title && a.link)
    .filter(a => !isBlacklisted(a.link))
    .filter(a => isRecent(a.pubDate))
    .filter(a => {
      if (seen.has(a.link)) return false;
      seen.add(a.link);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

// ============================================================
// OPENAI COMMENTARY GENERATION
// ============================================================

async function generateCommentary(headline, category) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are RealtyDataLabs, a professional real estate data platform. ' +
            'Write a Twitter post for the given article. ' +
            'Rules: Maximum 240 characters before the link. ' +
            'Lead with the key data point or insight. ' +
            'One relevant emoji maximum. ' +
            'Professional tone always. ' +
            'Never use exclamation points. ' +
            'Append relevant hashtags at end separated by a newline.',
        },
        {
          role: 'user',
          content: `Headline: ${headline}\nCategory: ${category}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    log(`OpenAI error: ${err.message}`, 'ERROR');
    return '';
  }
}

// ============================================================
// TWITTER POSTING
// ============================================================

async function postToTwitter(text, link) {
  try {
    const tweetText = `${text}\n${link}`;
    // Truncate if over 280 chars
    const finalText = tweetText.length > 280
      ? tweetText.slice(0, 276) + '...'
      : tweetText;

    const tweet = await rwClient.v2.tweet(finalText);
    log(`Posted to Twitter — ID: ${tweet.data.id}`);
    return tweet.data.id;
  } catch (err) {
    log(`Twitter post error: ${err.message}`, 'ERROR');
    return null;
  }
}

// ============================================================
// SCHEDULE CHECK
// ============================================================

async function shouldPost(article) {
  // Never exceed daily limit
  const todayCount = await getPostCountToday();
  if (todayCount >= MAX_DAILY_POSTS) {
    log(`Daily post limit reached (${MAX_DAILY_POSTS}). Skipping.`);
    return false;
  }

  // Enforce minimum gap between posts
  const lastPost = await getLastPostTime();
  if (lastPost) {
    const minutesSince = (Date.now() - lastPost.getTime()) / 60000;
    if (minutesSince < MIN_MINUTES_BETWEEN_POSTS) {
      log(`Last post was ${Math.round(minutesSince)}m ago. Minimum is ${MIN_MINUTES_BETWEEN_POSTS}m.`);
      return false;
    }
  }

  // Breaking news bypasses hour restriction
  if (isBreaking(article.title)) {
    log(`Breaking news detected — bypassing hour restriction: "${article.title}"`);
    return true;
  }

  // Check if current hour is a priority posting hour
  const currentHour = getCurrentHourEST();
  if (!PRIORITY_HOURS_EST.includes(currentHour)) {
    log(`Current hour (${currentHour} EST) is not a priority posting hour. Skipping.`);
    return false;
  }

  return true;
}

// ============================================================
// ARTICLE SCORING
// ============================================================

function scoreArticle(article) {
  let score = 0;

  // Recency score (newer = higher)
  const ageHours = (Date.now() - new Date(article.pubDate).getTime()) / 3600000;
  score += Math.max(0, 48 - ageHours); // up to 48 points for recency

  // Breaking news bonus
  if (isBreaking(article.title)) score += 25;

  // Government/authority sources get a bonus
  const authorityPatterns = ['fed', 'treasury', 'bls', 'census', 'fhfa', 'freddie'];
  if (authorityPatterns.some(p => article.source.toLowerCase().includes(p))) score += 10;

  return score;
}

// ============================================================
// MAIN ENGINE — runs every 30 minutes
// ============================================================

async function runEngine() {
  log('=== Engine run starting ===');

  // 1. Fetch all feeds in parallel
  log('Fetching RSS feeds...');
  let articles;
  try {
    articles = await fetchAllFeeds();
    log(`Fetched ${articles.length} total articles after filtering.`);
  } catch (err) {
    log(`Feed fetch failed: ${err.message}`, 'ERROR');
    return;
  }

  if (!articles.length) {
    log('No articles available. Exiting run.');
    return;
  }

  // 2. Filter out already-posted articles (check Firestore in parallel batches)
  log('Checking Firestore for already-posted articles...');
  const postedChecks = await Promise.all(
    articles.map(a => hasBeenPosted(a.link).then(posted => ({ article: a, posted })))
  );
  const unposted = postedChecks
    .filter(r => !r.posted)
    .map(r => r.article);

  log(`${unposted.length} unposted articles remain.`);

  if (!unposted.length) {
    log('All articles already posted. Exiting run.');
    return;
  }

  // 3. Score and sort
  unposted.sort((a, b) => scoreArticle(b) - scoreArticle(a));
  const topArticle = unposted[0];

  log(`Top article: "${topArticle.title}" [${topArticle.category}] from ${topArticle.source}`);

  // 4. Check schedule rules
  const ok = await shouldPost(topArticle);
  if (!ok) {
    log('Schedule rules blocked this run. No post made.');
    return;
  }

  // 5. Generate commentary with OpenAI
  log('Generating AI commentary...');
  const commentary = await generateCommentary(topArticle.title, topArticle.category);
  const hashtags   = HASHTAGS[topArticle.category] || '#RealEstate';

  // Build post text: commentary + hashtags (link appended in postToTwitter)
  const postText = commentary
    ? `${commentary}\n${hashtags}`
    : `${topArticle.title}\n${hashtags}`;

  log(`Post text:\n${postText}`);

  // 6. Post to Twitter/X
  const tweetId = await postToTwitter(postText, topArticle.link);

  // 7. Log to Firestore
  const platforms = tweetId ? ['twitter'] : [];
  await markAsPosted(topArticle, platforms, tweetId);

  log(`=== Engine run complete. Posted to: ${platforms.join(', ') || 'none (error)'} ===`);
}

// ============================================================
// CRON SCHEDULE — every 30 minutes
// ============================================================

log('RealtyDataLabs Social Engine starting...');
log(`Posting schedule: max ${MAX_DAILY_POSTS}/day, priority hours EST: ${PRIORITY_HOURS_EST.join(', ')}`);

// Run once on startup
runEngine().catch(err => log(`Startup run error: ${err.message}`, 'ERROR'));

// Then every 30 minutes
cron.schedule('*/30 * * * *', () => {
  runEngine().catch(err => log(`Scheduled run error: ${err.message}`, 'ERROR'));
});

log('Cron scheduled: every 30 minutes. Engine is live.');
