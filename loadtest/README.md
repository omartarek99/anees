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

Blocked by default (it needs `-e ALLOW_REMOTE=1`), because load on production can slow the free hosting
plans for real users. Use a normal test student account, never the admin, and pass the password on the
command line yourself rather than pasting it anywhere.

Aim at the Render backend directly (`BASE_URL=https://anees-01h6.onrender.com`): that tests the app itself
and does not burn Vercel's request quota. The site's own `/api` path on Vercel forwards to the same place.

```powershell
k6 run -e PROFILE=live -e ALLOW_REMOTE=1 -e BASE_URL=https://anees-01h6.onrender.com -e TEST_USER=... -e TEST_PASS=... loadtest/stress.js
k6 run -e PROFILE=live-stress -e ALLOW_REMOTE=1 -e BASE_URL=https://anees-01h6.onrender.com -e TEST_USER=... -e TEST_PASS=... loadtest/stress.js
```

| Profile | What it does |
| --- | --- |
| `live` | 2 users for 2 minutes (under the 200 requests/minute/IP limit): the real speed of the live pages. |
| `live-stress` | Ramps to 25 users for 6 minutes, past the limit on purpose: does the site stay up, keep answering and recover? |

### 100 users on the live site

From one computer the API limit (200 requests/minute per IP) would answer almost everything with 429, so
raise it for the length of the test only:

1. Render > the backend service > Environment > add `API_RATE_LIMIT_PER_MIN` = `20000` > Save (Render restarts).
2. Run: `k6 run -e PROFILE=live-100 -e ALLOW_REMOTE=1 -e BASE_URL=https://anees-01h6.onrender.com -e TEST_USER=... -e TEST_PASS=... loadtest/stress.js`
3. **Delete the variable again** and save, so the normal 200/minute protection is back.

Reading the live results: from one computer everything above ~3 users is rejected with 429 (`rate_limited`).
That is the protection working. What matters is that `app_failures` stays low, requests keep answering
quickly, and the site is normal again after the ramp-down. Run it when few real students are online.

Never load-test signup, OTP or the AI worksheet endpoints: they send real emails and spend Gemini quota.

## 250 users on the real site (200 students + 50 teachers) — full-250.js with shared logins

One computer cannot make 250 different real logins: login is limited to 20 per 15 minutes per address and sign-up needs real e-mails.
So `SHARED=1` logs in ONE test student and ONE test teacher, and all 250 virtual users use those two sessions. It measures the server under
the real load of every call (login is the only thing it does not repeat 250 times). Use test accounts (for example `dev_student` and
`dev_teacher`), never the admin and never a real student. Type the passwords into your own terminal (Read-Host), not into chat or a file.

1. Render > the backend service > Environment > add `API_RATE_LIMIT_PER_MIN` = `20000` > Save (it restarts, wait for "Live").
   Check `TRUST_PROXY_HOPS` too (2 behind Vercel). Do the test at night, when students are not using the site.
2. First look (60 s, 10 students + 2 teachers):
   ```powershell
   cd C:\Mahmoud_Emad\TFQ_Project_v1\anees
   $sp = Read-Host "Test STUDENT password"; $tp = Read-Host "Test TEACHER password"
   & "C:\Program Files\k6\k6.exe" run -e PROFILE=live-smoke -e SHARED=1 -e ALLOW_REMOTE=1 -e BASE_URL=https://anees-01h6.onrender.com -e TEST_STUDENT=dev_student -e TEST_STUDENT_PASS=$sp -e TEST_TEACHER=dev_teacher -e TEST_TEACHER_PASS=$tp loadtest/full-250.js
   ```
3. The real run (about 5.5 minutes, 250 at full strength for 3 minutes; stops by itself after 300 server errors):
   ```powershell
   & "C:\Program Files\k6\k6.exe" run -e PROFILE=live250 -e SHARED=1 -e ALLOW_REMOTE=1 -e BASE_URL=https://anees-01h6.onrender.com -e TEST_STUDENT=dev_student -e TEST_STUDENT_PASS=$sp -e TEST_TEACHER=dev_teacher -e TEST_TEACHER_PASS=$tp --summary-export loadtest/live250-summary.json loadtest/full-250.js
   ```
   Keep Render > Metrics open (CPU and memory) while it runs.
4. Afterwards: remove `API_RATE_LIMIT_PER_MIN` on Render (the limit is the protection), and in the admin Users page take the extra points back from the
   test student (Manage > remove points), because the test earns a lot of them.
5. Send the file `loadtest/live250-summary.json` (no passwords are in it) and the numbers get turned into a report like the local one.
