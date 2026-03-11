# PRD: The Nerd — Agentic AI Actions

## Introduction

Transform The Nerd from a text-only chat into a full agentic AI that can take any action a user can take in the Cortex UI. Instead of a client picker dropdown, users @mention clients and team members Discord-style. The Nerd executes actions via existing API routes, confirms dangerous operations before executing, and renders results inline as rich cards or text summaries with links.

## Goals

- Enable The Nerd to execute every action available in the Cortex admin UI via chat
- Replace the client picker with an @mention system for clients and team members
- Provide tiered action safety: auto-execute reads, confirm writes, block destructive actions
- Show action results as rich inline cards for key actions, text+link for simple ones
- User must explicitly specify context (no auto-detection of current page)

## User Stories

### US-001: @mention autocomplete system
**Description:** As a user, I want to @mention clients and team members in chat so I can reference them naturally without a dropdown picker.

**Acceptance Criteria:**
- [ ] Typing `@` in the chat input triggers an autocomplete popup
- [ ] Popup lists clients (name + agency) and team members (name + role)
- [ ] Filtering narrows results as user types after `@`
- [ ] Selecting an item inserts `@ClientName` or `@TeamMemberName` as a styled tag
- [ ] Multiple @mentions supported in a single message
- [ ] Mentions are parsed and sent to the API as structured metadata (not just text)
- [ ] Remove the existing client picker dropdown from header and input area
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Tool/function definitions registry
**Description:** As a developer, I need a registry of all actions The Nerd can invoke so the AI knows what tools are available.

**Acceptance Criteria:**
- [ ] Create `lib/nerd/tools.ts` with typed tool definitions
- [ ] Each tool has: `name`, `description`, `parameters` (Zod schema), `riskLevel` ('read' | 'write' | 'destructive'), `handler` function
- [ ] Tools organized by domain: scheduler, tasks, clients, shoots, moodboard, calendar, analytics, search, team
- [ ] Tool registry exports a flat array and a lookup map
- [ ] Typecheck passes

### US-003: Scheduler tools
**Description:** As a user, I want The Nerd to manage my scheduled posts so I can create, edit, and publish posts via chat.

**Acceptance Criteria:**
- [ ] `list_scheduled_posts` — list upcoming posts, optionally filtered by @client (read)
- [ ] `create_post` — create a draft post with caption, platform, scheduled time (write, confirm)
- [ ] `update_post` — edit caption, time, or platform of an existing post (write, confirm)
- [ ] `delete_post` — delete a scheduled post (destructive, blocked — tells user to do it manually)
- [ ] `publish_post_now` — immediately publish a draft post (write, confirm)
- [ ] `suggest_best_times` — get AI-recommended posting times for a client (read)
- [ ] Typecheck passes

### US-004: Task management tools
**Description:** As a user, I want The Nerd to manage tasks so I can create, assign, and update tasks via chat.

**Acceptance Criteria:**
- [ ] `list_tasks` — list tasks, filterable by @client, @team_member, status (read)
- [ ] `create_task` — create a task with title, description, assignee, client, due date (write, confirm)
- [ ] `update_task` — change status, assignee, due date, or description (write, confirm)
- [ ] `assign_task` — assign a task to an @team_member (write, confirm)
- [ ] Typecheck passes

### US-005: Client management tools
**Description:** As a user, I want The Nerd to read and update client information via chat.

**Acceptance Criteria:**
- [ ] `get_client_details` — get full client profile, preferences, strategy, social accounts (read)
- [ ] `update_client_settings` — update brand voice, preferences, posting frequency (write, confirm)
- [ ] `list_client_contacts` — list contacts for a client (read)
- [ ] `add_client_contact` — add a contact to a client (write, confirm)
- [ ] `get_client_analytics` — pull analytics summary for a client (read)
- [ ] Typecheck passes

### US-006: Shoot management tools
**Description:** As a user, I want The Nerd to manage shoots so I can schedule and plan shoots via chat.

**Acceptance Criteria:**
- [ ] `list_shoots` — list upcoming shoots, filterable by @client (read)
- [ ] `create_shoot` — schedule a new shoot with client, date, location (write, confirm)
- [ ] `generate_shoot_plan` — generate AI shoot plan for an existing shoot (write, confirm)
- [ ] `reschedule_shoot` — change shoot date/time (write, confirm)
- [ ] Typecheck passes

### US-007: Search and content tools
**Description:** As a user, I want The Nerd to run topic research and generate content ideas via chat.

**Acceptance Criteria:**
- [ ] `run_topic_search` — start a new topic search for a client (write, confirm)
- [ ] `get_search_results` — retrieve results of a completed search (read)
- [ ] `generate_content_pillars` — create content pillar framework for @client (read, returns inline)
- [ ] `generate_hooks` — create scroll-stopping hooks for @client (read, returns inline)
- [ ] `generate_captions` — create caption templates for @client (read, returns inline)
- [ ] Typecheck passes

### US-008: Calendar and team tools
**Description:** As a user, I want The Nerd to check calendars and team availability via chat.

**Acceptance Criteria:**
- [ ] `list_calendar_events` — list upcoming events, filterable by date range (read)
- [ ] `list_team_members` — list all team members and their roles (read)
- [ ] `get_team_member_workload` — show tasks/shoots assigned to @team_member (read)
- [ ] Typecheck passes

### US-009: Analytics and reporting tools
**Description:** As a user, I want The Nerd to pull and summarize analytics so I can get performance insights via chat.

**Acceptance Criteria:**
- [ ] `get_analytics_summary` — overall analytics across all clients or for @client (read)
- [ ] `get_top_posts` — top performing posts for @client (read)
- [ ] `compare_client_performance` — compare metrics between two @clients (read)
- [ ] Results rendered as rich cards with key metrics highlighted
- [ ] Typecheck passes

### US-010: Action confirmation UI
**Description:** As a user, I want to see a confirmation card before The Nerd executes write actions so I can approve or reject them.

**Acceptance Criteria:**
- [ ] Write-level actions show a confirmation card in chat with action summary
- [ ] Card has "Confirm" and "Cancel" buttons
- [ ] Confirming executes the action and shows result
- [ ] Cancelling shows "Action cancelled" message
- [ ] Destructive actions show a warning card explaining the user must do it manually, with a link to the relevant page
- [ ] Read actions auto-execute without confirmation
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Rich result cards
**Description:** As a user, I want action results displayed as rich cards in chat so I can see the output at a glance.

**Acceptance Criteria:**
- [ ] Task results show: title, status badge, assignee, due date, link to task
- [ ] Post results show: platform icon, caption preview, scheduled time, link to scheduler
- [ ] Client results show: name, logo, health score, link to client page
- [ ] Shoot results show: client, date, location, status, link to shoot
- [ ] Analytics results show: key metrics (followers, engagement rate, top post) in a mini dashboard card
- [ ] Simple actions show text confirmation + link to relevant page
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: OpenRouter tool-use integration
**Description:** As a developer, I need to wire the tool registry into the OpenRouter streaming API so the AI can invoke tools during conversation.

**Acceptance Criteria:**
- [ ] Convert tool registry to OpenAI-compatible function definitions for the API call
- [ ] Handle `tool_calls` in the streaming response
- [ ] Execute the matching tool handler with parsed arguments
- [ ] Feed tool results back into the conversation for the AI to summarize
- [ ] Support multiple sequential tool calls in a single response
- [ ] @mentions in user message are resolved to IDs before sending to AI
- [ ] System prompt updated to explain available tools, @mention syntax, and safety tiers
- [ ] Typecheck passes

### US-013: Moodboard tools
**Description:** As a user, I want The Nerd to interact with moodboards so I can manage boards and items via chat.

**Acceptance Criteria:**
- [ ] `list_moodboards` — list moodboards, filterable by @client (read)
- [ ] `get_moodboard_items` — list items on a specific board (read)
- [ ] `add_moodboard_item` — add a URL/image to a board (write, confirm)
- [ ] `analyze_moodboard_item` — trigger AI analysis on an item (write, confirm)
- [ ] Typecheck passes

### US-014: Notification tools
**Description:** As a user, I want The Nerd to manage my notifications via chat.

**Acceptance Criteria:**
- [ ] `list_notifications` — list unread notifications (read)
- [ ] `mark_notifications_read` — mark all or specific notifications as read (write, auto-execute)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The @mention system must support both clients and team members, differentiated by icon/color in the autocomplete
- FR-2: @mentions must resolve to database IDs (client.slug, team_member.id) before being sent to the AI
- FR-3: Tool definitions must include Zod schemas for parameter validation
- FR-4: Each tool must declare a risk level: `read` (auto-execute), `write` (confirm first), `destructive` (block + link)
- FR-5: The AI must receive tool results and synthesize a natural language response (not just dump raw JSON)
- FR-6: Confirmation cards must timeout after 5 minutes (action cancelled if not confirmed)
- FR-7: Tool execution must use the authenticated user's session (no privilege escalation)
- FR-8: The streaming response must handle interleaved text + tool_calls chunks
- FR-9: If a tool call fails, the AI must explain the error and suggest alternatives
- FR-10: The Nerd page must work without any client picker — @mentions are the only way to reference entities
- FR-11: When The Nerd references a page in the app, it must provide a clickable link

## Non-Goals

- No auto-detection of user's current page context — user specifies via @mentions or description
- No floating widget or command palette integration — stays on `/admin/nerd` only
- No multi-step wizards or forms within chat — single-action tool calls only
- No file uploads through chat (images, videos) — point user to the relevant page
- No real-time data streaming (e.g., live analytics dashboard in chat)
- No tool calls from the client portal — admin only

## Design Considerations

- @mention autocomplete should match Discord's UX: popup above cursor, keyboard navigable, avatar/icon for each entity type
- Confirmation cards should be visually distinct from regular messages — use a bordered card with action buttons
- Rich result cards should reuse existing component patterns (same badges, status colors, etc.)
- Destructive action warnings should use a red/amber accent to signal danger
- Tool execution should show a subtle loading state (e.g., "Scheduling post..." with a spinner)

## Technical Considerations

- OpenRouter supports tool/function calling via the OpenAI-compatible API — use `tools` parameter in the request
- Tool handlers should call existing API route logic directly (import the handler functions) rather than making HTTP requests to self
- @mention resolution happens client-side before sending the message — the API receives structured mention data
- Streaming with tool calls: the response may contain `delta.tool_calls` chunks that need to be accumulated before execution
- Tool results are injected as `tool` role messages and the conversation continues for the AI to summarize
- Rate limiting: tool calls should be capped at 5 per message to prevent runaway loops
- Consider a `lib/nerd/tools/` directory with one file per domain (scheduler.ts, tasks.ts, clients.ts, etc.)

## Success Metrics

- Users can complete common actions (create task, schedule post, check analytics) without leaving the chat
- 90%+ of tool calls execute successfully on first attempt
- Confirmation flow adds < 1 second overhead to write actions
- @mention autocomplete responds within 100ms of keystroke

## Open Questions

- Should The Nerd remember conversation history across page refreshes (persist to DB)?
- Should tool calls be logged to an activity feed for audit purposes?
- Should The Nerd be able to chain multiple tools automatically (e.g., "create a task and assign it to @Jack")?
- What's the token budget for tool-heavy conversations (system prompt + tools + history)?
