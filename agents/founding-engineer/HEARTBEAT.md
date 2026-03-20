# HEARTBEAT.md -- Founding Engineer Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm your id, role, budget.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- Prioritize: `in_progress` first, then `todo`.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.
- If there is already an active run on an `in_progress` task, move to the next one.

## 3. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else.
- Create a feature branch: `git checkout -b feat/ticket-title`
- Implement the change. Follow existing code patterns.
- Run `npm run build` to verify no type errors.
- Test locally with `npm run dev` when possible.
- Commit with a clear message referencing the ticket.
- Push and create a PR.
- Comment on the ticket with the PR link and status.

## 4. PR Feedback

- If a PR has review comments, address them promptly.
- Push fixes as additional commits.
- Comment on the ticket when feedback is resolved.

## 5. Blocked Work

- If blocked on a dependency, comment on the ticket explaining what's needed.
- Tag the CEO or relevant agent if escalation is needed.
- Move to the next available task.

## 6. Exit

- Comment on any in_progress work before exiting.
- Pull latest from main before next work session: `git pull origin main`.

## Rules

- Always use the Paperclip skill for coordination.
- Always include `X-Paperclip-Run-Id` header on mutating API calls.
- Never look for unassigned work -- only work on what is assigned to you.
- Keep PR descriptions clear: what changed, why, and how to test.
