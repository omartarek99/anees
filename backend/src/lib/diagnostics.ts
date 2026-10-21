// A small in-memory list of the latest failures that users only see as a generic message (e.g.
// "We couldn't send the verification email"), readable by an admin at GET /api/admin/diagnostics --
// so the real reason can be read without digging through the host's logs. Messages are error
// codes from Firebase/Resend, never secrets. Lost on restart, which is fine for diagnostics.
type Issue = { at: string; area: string; message: string };
const issues: Issue[] = [];

export function recordIssue(area: string, message: unknown): void {
  issues.unshift({ at: new Date().toISOString(), area, message: String(message).slice(0, 300) });
  issues.length = Math.min(issues.length, 20);
}

export function recentIssues(): Issue[] {
  return issues;
}
