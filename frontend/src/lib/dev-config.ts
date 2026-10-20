// TEMPORARY DEV SWITCH — set to false (or delete this file's usage in auth-context.tsx)
// to restore the normal login/signup flow. While true, the app auto-logs-in as a
// real seeded test account on load so the login page is skipped entirely.
// `import.meta.env.DEV` is false in `vite build`, so a deployed site can never auto-login as the
// dev account no matter what this is set to -- only `npm run dev` honours it.
export const DEV_BYPASS_LOGIN = import.meta.env.DEV && true;
export const DEV_ACCOUNT = { username: 'dev_student', password: 'devpass123' };
