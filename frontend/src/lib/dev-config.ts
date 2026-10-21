// DEV SWITCH, off by default so a visitor who isn't signed in lands on the landing page first --
// the same as on the deployed site. Change `false` to `true` to have `npm run dev` auto-log-in as
// the seeded dev_student account on load (skipping the landing and login pages).
// `import.meta.env.DEV` is false in `vite build`, so a deployed site can never auto-login as the
// dev account no matter what this is set to -- only `npm run dev` honours it.
export const DEV_BYPASS_LOGIN = import.meta.env.DEV && false;
export const DEV_ACCOUNT = { username: 'dev_student', password: 'devpass123' };
