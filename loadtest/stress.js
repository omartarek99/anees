// Grafana k6 load / stress test for the Anees API. See loadtest/README.md for how to run it.
//
// What it does: signs in ONCE (setup), then every virtual user behaves like a student browsing --
// feed, map, leaderboard, news, profile -- with a short think-time between pages. Read-only by default.
// What it deliberately does NOT touch: signup / OTP / password reset (they send real emails and create
// Firebase users) and the AI worksheet / quiz generators (they spend Gemini quota).

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const USERNAME = __ENV.TEST_USER || 'dev_student';
const PASSWORD = __ENV.TEST_PASS || 'devpass123';
const PROFILE = __ENV.PROFILE || 'stress';
const WRITES = __ENV.WRITES === '1';

// "Real" failures: 5xx, timeouts, wrong body. A 429 from the rate limiter is counted separately
// because it means "the protection worked", not "the app broke".
const failures = new Rate('app_failures');
const rateLimited = new Rate('rate_limited');
const feedTime = new Trend('feed_duration', true);
const mapTime = new Trend('map_duration', true);
const leaderboardTime = new Trend('leaderboard_duration', true);

const PROFILES = {
  // 1 user, 30 s: does the script work at all?
  smoke: { executor: 'constant-vus', vus: 1, duration: '30s' },
  // Normal busy day: ~50 students at once for 3 minutes.
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 50 },
      { duration: '2m', target: 50 },
      { duration: '30s', target: 0 },
    ],
  },
  // Push until it hurts: climb to 300 concurrent users, hold, then drop and see if it recovers.
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 200 },
      { duration: '1m', target: 300 },
      { duration: '1m', target: 300 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '15s',
  },
  // --- For the DEPLOYED site (needs -e ALLOW_REMOTE=1). The API allows 200 requests/minute per IP and
  // production can't switch that off, so one computer can't push real capacity: these two profiles are sized
  // around that limit instead.
  // Real latency on the live site: ~2 users, roughly 120 requests/minute, under the limit.
  live: { executor: 'constant-vus', vus: 2, duration: '2m' },
  // 100 concurrent users on the live site (~7 minutes). Needs the API limit raised on the server first
  // (API_RATE_LIMIT_PER_MIN, see README), otherwise nearly everything is answered with 429.
  'live-100': {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '1m', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '3m', target: 100 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '15s',
  },
  // Pushes past the limit on purpose, to see that the site stays up, keeps answering fast (with 429) and
  // recovers once the load drops. Expect a high rate_limited share; app_failures should still stay low.
  'live-stress': {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 2 },
      { duration: '1m', target: 10 },
      { duration: '1m', target: 25 },
      { duration: '1m', target: 25 },
      { duration: '1m', target: 2 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '15s',
  },
  // Sudden burst (e.g. a whole school opens the site in the same minute).
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: 10 },
      { duration: '10s', target: 250 },
      { duration: '1m', target: 250 },
      { duration: '10s', target: 10 },
      { duration: '30s', target: 10 },
      { duration: '10s', target: 0 },
    ],
  },
};

export const options = {
  scenarios: { [PROFILE]: PROFILES[PROFILE] || PROFILES.stress },
  thresholds: {
    app_failures: ['rate<0.01'], // under 1% real errors
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1 s
    feed_duration: ['p(95)<1200'],
    map_duration: ['p(95)<1000'],
    leaderboard_duration: ['p(95)<1000'],
  },
  // 429s are expected when pointing at an environment that has its rate limiter on.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function isLocal(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
}

export function setup() {
  // Safety net: a stress test against a live site can exhaust the free hosting plan, Firebase / Resend
  // / Gemini quotas and lock out real users. Remote targets need an explicit opt-in.
  if (!isLocal(BASE_URL) && __ENV.ALLOW_REMOTE !== '1') {
    fail(`BASE_URL ${BASE_URL} is not local. Re-run with -e ALLOW_REMOTE=1 only if you really mean to load-test it.`);
  }

  const health = http.get(`${BASE_URL}/api/health`);
  if (health.status !== 200) fail(`Backend not reachable at ${BASE_URL} (health returned ${health.status}).`);

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' } }
  );
  if (res.status !== 200) fail(`Login as "${USERNAME}" failed (${res.status}): ${res.body}`);
  const cookie = res.cookies.anees_session && res.cookies.anees_session[0];
  if (!cookie) fail('Login worked but no anees_session cookie came back.');
  return { token: cookie.value };
}

function get(path, name, data, extraTrend) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: `anees_session=${data.token}`, 'X-Requested-With': 'anees' },
    tags: { name },
  });
  const limited = res.status === 429;
  rateLimited.add(limited);
  if (!limited) {
    const ok = check(res, { [`${name} 200`]: (r) => r.status === 200 });
    failures.add(!ok);
    if (extraTrend) extraTrend.add(res.timings.duration);
  }
  return res;
}

export default function (data) {
  group('open the app', () => {
    get('/api/auth/me', 'GET /api/auth/me', data);
    get('/api/reels/feed', 'GET /api/reels/feed', data, feedTime);
  });
  sleep(Math.random() * 1.5 + 0.5);

  group('browse', () => {
    get('/api/map', 'GET /api/map', data, mapTime);
    sleep(Math.random() + 0.3);
    get('/api/leaderboard', 'GET /api/leaderboard', data, leaderboardTime);
    sleep(Math.random() + 0.3);
    get('/api/news', 'GET /api/news', data);
  });

  if (WRITES) {
    // Writes a row into page_views per call, so it is opt-in (it would pollute real analytics).
    const res = http.post(`${BASE_URL}/api/analytics/pageview`, JSON.stringify({ path: '/reels' }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/analytics/pageview' },
    });
    failures.add(res.status !== 204 && res.status !== 429);
  }
  sleep(Math.random() * 2 + 1);
}
