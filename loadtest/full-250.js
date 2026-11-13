// 250 people at the same time: 200 students and 50 teachers, each with their own account, doing everything the site offers:
// login, the home page, lessons (reels: watch, like, quiz), points, worksheets, the adventure map, the Quarry game, friends and challenges,
// profile, page-view analytics. Teachers: their lessons and reports, creating / editing / deleting a lesson, worksheets (make + send),
// the leaderboard and the same lesson feed.
//
// Local use only (the accounts come from backend/scripts/loadtest-seed.ts). Start the backend with DISABLE_RATE_LIMITS=1 and no Gemini key.
//   k6 run -e BASE_URL=http://localhost:4100 -e PROFILE=full loadtest/full-250.js
// THE REAL SITE (SHARED LOGINS): one computer cannot make 250 different real logins (login is limited to 20 per 15 minutes per address, and
// sign-up needs real e-mails), so SHARED=1 logs in ONE test student and ONE test teacher in setup(), and the 250 virtual users all use those two
// sessions. It tests the server's real load (every call, 250 at a time) but not 250 different accounts. See loadtest/README.md "250 users on the real site".
// Not tested on purpose: video upload (real storage), sign-up / password reset (real emails), AI-written questions (paid quota).

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:4100').replace(/\/+$/, '');
const PASSWORD = __ENV.LT_PASSWORD || 'LoadTest#2026';
const PROFILE = __ENV.PROFILE || 'full';
const STUDENTS = 200;
const TEACHERS = 50;
const SHARED = __ENV.SHARED === '1';
const STUDENT_VUS = PROFILE === 'smoke' || PROFILE === 'live-smoke' ? 10 : STUDENTS; // how many VUs the students scenario has (teachers' VU numbers start after them)

const failures = new Counter('app_failures'); // 5xx or no answer
const unexpected = new Counter('unexpected_4xx'); // a 4xx we did not expect for that call

const SCENARIOS = {
  // everything at once: 250 users arrive within 20 s, stay 3 minutes, leave
  full: {
    students: { executor: 'ramping-vus', exec: 'student', startVUs: 0, stages: [{ duration: '20s', target: STUDENTS }, { duration: '3m', target: STUDENTS }, { duration: '20s', target: 0 }], gracefulRampDown: '20s' },
    teachers: { executor: 'ramping-vus', exec: 'teacher', startVUs: 0, stages: [{ duration: '20s', target: TEACHERS }, { duration: '3m', target: TEACHERS }, { duration: '20s', target: 0 }], gracefulRampDown: '20s' },
  },
  // the real site: 250 users reach full strength in 2 minutes (gentler than the local spike), stay 3 minutes, leave in 30 s
  live250: {
    students: { executor: 'ramping-vus', exec: 'student', startVUs: 0, stages: [{ duration: '2m', target: STUDENTS }, { duration: '3m', target: STUDENTS }, { duration: '30s', target: 0 }], gracefulRampDown: '20s' },
    teachers: { executor: 'ramping-vus', exec: 'teacher', startVUs: 0, stages: [{ duration: '2m', target: TEACHERS }, { duration: '3m', target: TEACHERS }, { duration: '30s', target: 0 }], gracefulRampDown: '20s' },
  },
  // the real site, first look: 10 students + 2 teachers for 60 s (run this before live250)
  'live-smoke': {
    students: { executor: 'constant-vus', exec: 'student', vus: 10, duration: '60s' },
    teachers: { executor: 'constant-vus', exec: 'teacher', vus: 2, duration: '60s' },
  },
  // 10 students + 2 teachers, 30 s: does the script work?
  smoke: {
    students: { executor: 'constant-vus', exec: 'student', vus: 10, duration: '30s' },
    teachers: { executor: 'constant-vus', exec: 'teacher', vus: 2, duration: '30s' },
  },
};

// every named call (so the summary lists each one separately)
const NAMES = [
  'login', 'me', 'profile', 'guide', 'double-points', 'points-notices', 'feed', 'watch', 'like', 'quiz-submit', 'leaderboard',
  'ws-videos', 'ws-generate', 'ws-submit', 'ws-send', 'ws-sent', 'map', 'map-quiz', 'map-quiz-submit', 'boss', 'craft-load', 'craft-save', 'craft-puzzle', 'craft-answer',
  'friends', 'friend-requests', 'challenge-current', 'challenge-create', 'challenge-accept', 'challenge-answers', 'challenge-submit', 'profile-view', 'profile-edit', 'pageview',
  't-options', 't-lessons', 't-watch-report', 't-messages', 't-create', 't-update', 't-get', 't-delete',
];
const thresholds = {};
for (const n of NAMES) thresholds[`http_req_duration{name:${n}}`] = ['p(95)<600000']; // never fails: only here so the summary lists each call
thresholds['app_failures'] = SHARED ? [{ threshold: 'count<300', abortOnFail: true, delayAbortEval: '20s' }] : ['count<100000']; // on the real site the run stops itself after 300 server errors
for (const n of NAMES) {
  thresholds[`http_reqs{name:${n}}`] = ['count>=0'];
  thresholds[`app_failures{name:${n}}`] = ['count>=0'];
  thresholds[`unexpected_4xx{name:${n}}`] = ['count>=0'];
}

export const options = {
  scenarios: SCENARIOS[PROFILE] || SCENARIOS.full,
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: false,
  noCookiesReset: true, // each virtual user keeps its login between rounds, like a real browser
};

const JSON_H = { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' };
const pad = (n, w) => String(n).padStart(w, '0');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (a = 0.4, b = 1.6) => sleep(rnd(a, b));

/** One call. `ok` lists the statuses that are fine for this call besides 2xx. */
function call(method, path, name, body, ok = []) {
  const res = http.request(method, BASE + path, body === undefined ? null : JSON.stringify(body), { headers: JSON_H, tags: { name }, timeout: '60s' });
  const s = res.status;
  if (s === 0 || s >= 500) failures.add(1, { name });
  else if (s >= 400 && !ok.includes(s)) unexpected.add(1, { name, status: String(s) });
  return res;
}
const json = (res) => {
  try {
    return res.json();
  } catch (_e) {
    return null;
  }
};
const randomAnswers = (questions) => (questions || []).map((q) => ({ questionId: q.id, choiceIndex: Math.floor(Math.random() * 4) }));

function isLocal(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
}

// SHARED mode: log in one student and one teacher once; every virtual user then uses their session.
export function setup() {
  if (!SHARED) return {};
  if (!isLocal(BASE) && __ENV.ALLOW_REMOTE !== '1') throw new Error('BASE_URL is not local. Add -e ALLOW_REMOTE=1 only if you really mean to load-test the real site.');
  const h = http.get(BASE + '/api/health');
  if (h.status !== 200) throw new Error('The backend did not answer /api/health (' + h.status + ').');
  const one = (user, pass) => {
    const r = http.post(BASE + '/api/auth/login', JSON.stringify({ username: user, password: pass }), { headers: JSON_H });
    const c = r.cookies.anees_session && r.cookies.anees_session[0];
    if (r.status !== 200 || !c) throw new Error('Login as ' + user + ' failed (' + r.status + '): ' + String(r.body).slice(0, 120));
    return c.value;
  };
  return { student: one(__ENV.TEST_STUDENT, __ENV.TEST_STUDENT_PASS), teacher: one(__ENV.TEST_TEACHER, __ENV.TEST_TEACHER_PASS) };
}

let loggedIn = false;
function useShared(token) {
  if (!loggedIn) {
    http.cookieJar().set(BASE, 'anees_session', token, { path: '/' });
    loggedIn = true;
  }
}
function login(username) {
  const res = call('POST', '/api/auth/login', 'login', { username, password: PASSWORD });
  check(res, { 'login 200': (r) => r.status === 200 });
  loggedIn = res.status === 200;
  return loggedIn;
}

function pageviews(paths) {
  for (const p of paths) call('POST', '/api/analytics/pageview', 'pageview', { path: p }, [204, 400]);
}

// ------------------------------------------------------------------------------------------------------------------ a student
export function student(data) {
  const idx = ((__VU - 1) % STUDENTS) + 1;
  const username = `lt_s${pad(idx, 3)}`;
  if (SHARED) useShared(data.student);
  if (!loggedIn && !login(username)) {
    sleep(3);
    return;
  }

  group('open the app', () => {
    call('GET', '/api/auth/me', 'me');
    call('GET', '/api/users/me', 'profile');
    call('GET', '/api/guide', 'guide');
    call('GET', '/api/reels/double-points-status', 'double-points');
    call('GET', '/api/users/me/points-notices', 'points-notices');
    pageviews(['/']);
  });
  think();

  group('lessons (reels) and quizzes', () => {
    pageviews(['/reels']);
    const feed = json(call('GET', '/api/reels/feed', 'feed'));
    const lessons = Array.isArray(feed) ? feed : [];
    for (let i = 0; i < 2 && lessons.length > 0; i++) {
      const item = pick(lessons);
      const reel = item.reel || item;
      if (!reel || !reel.id) continue;
      call('POST', `/api/reels/${reel.id}/watch`, 'watch', { seconds: 15 }, [409, 429]);
      think(0.3, 1);
      call('POST', `/api/reels/${reel.id}/watch`, 'watch', { seconds: 15 }, [409, 429]);
      call('POST', `/api/reels/${reel.id}/like`, 'like', { liked: Math.random() < 0.5 }, [409]);
      const qs = reel.questions || item.questions || [];
      if (qs.length > 0) call('POST', `/api/reels/${reel.id}/submit`, 'quiz-submit', { answers: randomAnswers(qs) }, [409]);
      think();
    }
    call('GET', '/api/leaderboard', 'leaderboard');
  });
  think();

  group('worksheets', () => {
    pageviews(['/worksheets']);
    call('GET', '/api/worksheets/videos', 'ws-videos');
    const ws = json(call('POST', '/api/worksheets/generate', 'ws-generate', { subject: pick(['math', 'science']), difficulty: pick(['easy', 'medium', 'hard']) }, [429]));
    if (ws && ws.worksheetId) {
      think(0.5, 1.5);
      call('POST', `/api/worksheets/${ws.worksheetId}/submit`, 'ws-submit', { answers: randomAnswers(ws.questions) }, [409]);
    }
    // a worksheet about a typed lesson name: the AI path (no Gemini key here, so it takes the fall-back to the fixed question bank)
    if (idx % 3 === 0) {
      const ws2 = json(call('POST', '/api/worksheets/generate', 'ws-generate', { subject: 'math', difficulty: 'easy', topic: 'الكسور', grade: 5 }, [429]));
      if (ws2 && ws2.worksheetId) call('POST', `/api/worksheets/${ws2.worksheetId}/submit`, 'ws-submit', { answers: randomAnswers(ws2.questions) }, [409]);
    }
  });
  think();

  group('adventure map', () => {
    pageviews(['/map']);
    const map = json(call('GET', '/api/map', 'map'));
    const levels = (map && map.levels) || [];
    const open = levels.filter((l) => l.progress && l.progress.status !== 'locked').slice(0, 3);
    const lv = open.length ? pick(open) : { levelNumber: 1 };
    const quiz = json(call('GET', `/api/map/quiz/${lv.levelNumber}`, 'map-quiz', undefined, [403, 404]));
    if (quiz && quiz.questions && quiz.questions.length) {
      think(0.5, 1.5);
      call('POST', `/api/map/quiz/${lv.levelNumber}/submit`, 'map-quiz-submit', { answers: randomAnswers(quiz.questions).slice(0, 8) }, [403, 404, 409]);
    }
    call('GET', '/api/map/boss/5', 'boss', undefined, [403, 404]);
  });
  think();

  group('the Quarry game', () => {
    pageviews(['/craft']);
    call('GET', '/api/craft', 'craft-load');
    // a small world edit most of the time, a big one (a long play session) for one student in five
    const big = idx % 5 === 0;
    const worldDiff = {};
    const n = big ? 4000 : 300;
    for (let i = 0; i < n; i++) worldDiff[`${i % 64},${Math.floor(i / 64)},${i % 7}`] = i % 60;
    call('POST', '/api/craft/save', 'craft-save', { version: 3, seed: 1000 + idx, worldDiff, inventory: { 1: 10, 2: 5, 7: 3 }, playerX: rnd(0, 50), playerY: 20, playerZ: rnd(0, 50), hp: 20, food: 18 }, [409]);
    const pz = json(call('POST', '/api/craft/puzzle', 'craft-puzzle', {}, [429]));
    if (pz && pz.puzzleId) call('POST', `/api/craft/puzzle/${pz.puzzleId}/answer`, 'craft-answer', { choice: Math.floor(Math.random() * ((pz.choices || [0, 1, 2, 3]).length)) }, [409]);
  });
  think();

  group('friends and challenges', () => {
    pageviews(['/friends']);
    call('GET', '/api/friends', 'friends');
    call('GET', '/api/friends/requests', 'friend-requests');
    const partner = `lt_s${pad(idx % 2 === 1 ? idx + 1 : idx - 1, 3)}`;
    const cur = json(call('GET', '/api/challenges/current', 'challenge-current'));
    const ch = cur && cur.challenge;
    if (SHARED) {
      // one shared account: nobody to challenge
    } else if (!ch && idx % 2 === 1) {
      call('POST', '/api/challenges', 'challenge-create', { username: partner, subject: 'math', difficulty: 'easy', count: 5 }, [404, 409, 429]);
    } else if (ch && ch.status === 'pending' && ch.role === 'challenged') {
      call('POST', `/api/challenges/${ch.id}/accept`, 'challenge-accept', {}, [409]);
    } else if (ch && ch.status === 'active' && ch.questions) {
      const answers = {};
      for (const q of ch.questions) answers[String(q.id)] = Math.floor(Math.random() * 4);
      call('PATCH', `/api/challenges/${ch.id}/answers`, 'challenge-answers', { answers }, [409]);
      if (Math.random() < 0.5) call('POST', `/api/challenges/${ch.id}/submit`, 'challenge-submit', {}, [400, 409]);
    }
    call('GET', `/api/users/${SHARED ? username : partner}`, 'profile-view', undefined, [404]);
  });
  think();

  group('profile', () => {
    pageviews(['/profile']);
    if (idx % 4 === 0) call('PATCH', '/api/users/me', 'profile-edit', { bio: `hello from student ${idx}` });
  });
  sleep(rnd(1, 3));
}

// ------------------------------------------------------------------------------------------------------------------ a teacher
export function teacher(data) {
  const idx = ((((__VU - STUDENT_VUS - 1) % TEACHERS) + TEACHERS) % TEACHERS) + 1;
  const username = `lt_t${pad(idx, 2)}`;
  if (SHARED) useShared(data.teacher);
  if (!loggedIn && !login(username)) {
    sleep(3);
    return;
  }

  group('open the app', () => {
    call('GET', '/api/auth/me', 'me');
    call('GET', '/api/users/me', 'profile');
    call('GET', '/api/guide', 'guide');
    call('GET', '/api/users/me/points-notices', 'points-notices');
    pageviews(['/']);
  });
  think();

  group('my lessons and reports', () => {
    pageviews(['/teacher/reels']);
    const opts = json(call('GET', '/api/teacher-reels/options', 't-options'));
    call('GET', '/api/teacher-reels', 't-lessons');
    call('GET', '/api/teacher-reels/reports/watch-time', 't-watch-report');
    call('GET', '/api/teacher-reels/messages', 't-messages');
    const subjectId = opts && opts.subjects && opts.subjects.length ? opts.subjects[0].id : 1;
    const payload = (title) => ({
      subjectId,
      grade: 5,
      title,
      titleAr: '',
      scriptText: 'Lesson text written during the load test.',
      scriptTextAr: '',
      questions: [
        { questionText: 'What is 2 + 2?', questionTextAr: '', choices: ['3', '4', '5', '6'], choicesAr: ['', '', '', ''], correctIndex: 1, explanation: 'Because it is four.', explanationAr: '' },
      ],
    });
    // create, look at, edit and delete a lesson (no video: uploads are not part of this test)
    const created = json(call('POST', '/api/teacher-reels', 't-create', payload(`LT temp ${username} ${Date.now()}`), [429]));
    if (created && created.id) {
      think(0.3, 1);
      call('GET', `/api/teacher-reels/${created.id}`, 't-get');
      call('PATCH', `/api/teacher-reels/${created.id}`, 't-update', payload(`LT temp edited ${Date.now()}`));
      call('DELETE', `/api/teacher-reels/${created.id}`, 't-delete');
    }
  });
  think();

  group('lessons feed and leaderboard', () => {
    pageviews(['/reels']);
    const feed = json(call('GET', '/api/reels/feed', 'feed'));
    const lessons = Array.isArray(feed) ? feed : [];
    if (lessons.length) {
      const item = pick(lessons);
      const reel = item.reel || item;
      if (reel && reel.id) call('POST', `/api/reels/${reel.id}/like`, 'like', { liked: Math.random() < 0.5 }, [403, 409]);
    }
    call('GET', '/api/leaderboard', 'leaderboard');
  });
  think();

  group('worksheets', () => {
    pageviews(['/worksheets']);
    call('GET', '/api/worksheets/videos', 'ws-videos');
    const ws = json(call('POST', '/api/worksheets/generate', 'ws-generate', { subject: pick(['math', 'science']), difficulty: pick(['easy', 'medium', 'hard']) }, [429]));
    if (ws && ws.worksheetId) {
      think(0.3, 1);
      call('POST', `/api/worksheets/${ws.worksheetId}/send`, 'ws-send', {}, [409]);
    }
    call('GET', '/api/worksheets/sent', 'ws-sent');
  });
  think();

  group('profile', () => {
    pageviews(['/profile']);
    call('GET', SHARED ? '/api/users/me' : `/api/users/lt_s${pad(((idx * 3) % STUDENTS) + 1, 3)}`, 'profile-view', undefined, [404]);
  });
  sleep(rnd(1, 3));
}
