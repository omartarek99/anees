# Load / stress testing with Grafana k6

`stress.js` simulates students using the API. It signs in once, then each virtual user loops through the
feed, map, leaderboard and news pages with think-time in between. Read-only by default.

## 1. Install k6 (once)

```powershell
winget install k6 --source winget
```

Open a **new** terminal afterwards so `k6` is on the PATH, then check with `k6 version`.

## 2. Start the backend with the rate limiter off (local only)

One machine making hundreds of requests a minute would otherwise hit the API limit (200 requests/minute
per IP) and you would be measuring the limiter instead of the app. The switch is ignored when
`NODE_ENV=production`.

```powershell
cd backend
$env:DISABLE_RATE_LIMITS = "1"
npm run dev
```

## 3. Run it

From the project root, in a second terminal:

```powershell
k6 run -e PROFILE=smoke loadtest/stress.js
k6 run -e PROFILE=load loadtest/stress.js
k6 run -e PROFILE=stress loadtest/stress.js
k6 run -e PROFILE=spike loadtest/stress.js
```

| Profile | What it does |
| --- | --- |
| `smoke` | 1 user for 30 s. Run this first to check the script works. |
| `load` | 50 users for 3 minutes: a normal busy day. |
| `stress` | Climbs 50 → 100 → 200 → 300 users, holds, then drops to see whether it recovers. |
| `spike` | Jumps from 10 to 250 users in 10 seconds: a whole class opening the site at once. |

Options: `-e TEST_USER=... -e TEST_PASS=...` (default `dev_student` / `devpass123`, the local seed account),
`-e WRITES=1` to also post page-view analytics.

## 4. Read the result

- `http_req_duration` p(95): 95% of requests finished faster than this. The threshold is 1 s.
- `app_failures`: share of real errors (5xx, timeouts). The threshold is under 1%.
- `rate_limited`: 429 responses, which are the protection working, not failures.
- A red cross next to a threshold means that limit was exceeded.
- Find the user count at which p(95) starts to climb or errors appear: that is the practical capacity.

## Testing the live site

Blocked by default, because stress-testing production can exhaust the free hosting plans and lock out real
users. If you really want to, run a gentle `load` profile against the live API with an existing test
account, and expect 429s from the rate limiter:

```powershell
k6 run -e PROFILE=load -e ALLOW_REMOTE=1 -e BASE_URL=https://aneesv2.vercel.app -e TEST_USER=... -e TEST_PASS=... loadtest/stress.js
```

Never point the stress or spike profile at the live site, and never load-test signup, OTP or the AI
worksheet endpoints: they send real emails and spend Gemini quota.
