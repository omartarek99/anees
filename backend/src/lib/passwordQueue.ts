import bcrypt from 'bcryptjs';

// bcrypt (cost 12) is slow on purpose, and bcryptjs runs it on the same thread as every request. When hundreds of people log in at the same moment, hundreds
// of these run side by side and every other request waits behind all of them (a 250-login rush made other pages wait 5-50 seconds). So only a few run at a
// time and the rest wait in line (first come, first served): the other requests stay fast, and the logins are served in order. If the line gets absurdly
// long the site says "busy" instead of piling up.
const RUNNING_AT_ONCE = Math.max(1, Number.parseInt(process.env.BCRYPT_CONCURRENCY ?? '', 10) || 2);
const MAX_WAITING = Math.max(1, Number.parseInt(process.env.BCRYPT_MAX_WAITING ?? '', 10) || 200);

export class PasswordBusyError extends Error {
  constructor() {
    super('password line is full');
  }
}

let running = 0;
const waiting: (() => void)[] = [];

async function inLine<T>(job: () => Promise<T>): Promise<T> {
  if (running >= RUNNING_AT_ONCE) {
    if (waiting.length >= MAX_WAITING) throw new PasswordBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over to us when someone finishes
  } else {
    running++;
  }
  try {
    return await job();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

export const comparePassword = (password: string, hash: string): Promise<boolean> => inLine(() => bcrypt.compare(password, hash));
export const hashPassword = (password: string, cost: number): Promise<string> => inLine(() => bcrypt.hash(password, cost));
