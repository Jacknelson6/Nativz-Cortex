# SRL Re-entry Prompt

Use this exact prompt when calling ScheduleWakeup to continue the loop.
It must be self-contained because the next wake-up may have no conversation
memory of the current iteration.

```
SRL iteration — continue the self-referential loop.

1. Read SRL.md → understand the goal and what was shipped in prior iterations
2. Read todo.md → understand the full task landscape
3. Run git log --oneline -5 and git status
4. Assess: what acceptance criteria are met vs. unmet
5. Pick the next highest-impact task that moves toward the goal
6. Build it, verify (tsc --noEmit minimum), commit, push
7. Log the iteration in SRL.md
8. If the goal is unmet, re-enter via ScheduleWakeup (90s delay, inside cache window)
9. If all acceptance criteria are met, terminate with completion summary in SRL.md

Design decisions: pick the simpler option, document why. Don't ask the user.
Port 3001. Push to main. Plans are always approved.
```
