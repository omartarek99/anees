const s = require('./full-summary.json').metrics;
const g = (k) => s[k] || {};
console.log('TOTAL requests', g('http_reqs').count, 'rate/s', (g('http_reqs').rate||0).toFixed(1));
console.log('http_req_duration avg/med/p90/p95/p99/max', ['avg','med','p(90)','p(95)','p(99)','max'].map(k=>Math.round(g('http_req_duration')[k])).join(' / '));
console.log('app_failures', g('app_failures').count, '| unexpected_4xx', g('unexpected_4xx').count, '| checks', JSON.stringify(g('checks')));
console.log('iterations', g('iterations').count, 'iteration_duration avg', Math.round(g('iteration_duration').avg), 'vus_max', g('vus_max').value, 'data_recv MB', ((g('data_received').count||0)/1e6).toFixed(1), 'sent MB', ((g('data_sent').count||0)/1e6).toFixed(1));
const rows = [];
for (const k of Object.keys(s)) {
  const m = /^http_req_duration\{name:(.+)\}$/.exec(k);
  if (!m) continue;
  const n = m[1];
  rows.push({ n, count: (s[`http_reqs{name:${n}}`]||{}).count||0, fail: (s[`app_failures{name:${n}}`]||{}).count||0, u4: (s[`unexpected_4xx{name:${n}}`]||{}).count||0, avg: s[k].avg, med: s[k].med, p90: s[k]['p(90)'], p95: s[k]['p(95)'], p99: s[k]['p(99)'], max: s[k].max });
}
rows.sort((a,b)=>b.p95-a.p95);
console.log('name'.padEnd(18),'count','fail','4xx'.padStart(5),'avg','med','p90','p95','p99','max');
for (const r of rows) console.log(r.n.padEnd(18), String(r.count).padStart(5), String(r.fail).padStart(4), String(r.u4).padStart(5), [r.avg,r.med,r.p90,r.p95,r.p99,r.max].map(x=>String(Math.round(x)).padStart(6)).join(''));
