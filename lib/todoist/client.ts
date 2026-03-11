/**
 * Todoist REST API v1 client.
 *
 * Per-user API keys stored in the `users` table (`todoist_api_key`).
 * Docs: https://developer.todoist.com/api/v1/
 */

const BASE_URL = 'https://api.todoist.com/api/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TodoistDue {
  date: string; // YYYY-MM-DD
  timezone: string | null;
  string: string; // human-readable e.g. "every Monday"
  lang: string;
  is_recurring: boolean;
}

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  checked: boolean;
  priority: number; // 1 (normal) – 4 (urgent)
  due: TodoistDue | null;
  labels: string[];
  project_id: string;
  added_at: string;
  updated_at: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  is_favorite: boolean;
}

/** Paginated response wrapper */
interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

async function todoistFetch<T>(
  apiKey: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Todoist API ${res.status}: ${text}`);
  }

  // 204 No Content (close/reopen/delete)
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function getTodoistTasks(
  apiKey: string,
  projectId?: string,
): Promise<TodoistTask[]> {
  const all: TodoistTask[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();

    const page = await todoistFetch<PaginatedResponse<TodoistTask>>(
      apiKey,
      `/tasks${qs ? `?${qs}` : ''}`,
    );
    all.push(...page.results);
    cursor = page.next_cursor;
  } while (cursor);

  return all;
}

export async function getTodoistTask(
  apiKey: string,
  taskId: string,
): Promise<TodoistTask> {
  return todoistFetch<TodoistTask>(apiKey, `/tasks/${taskId}`);
}

export async function createTodoistTask(
  apiKey: string,
  data: {
    content: string;
    description?: string;
    priority?: number;
    due_string?: string;
    due_date?: string;
    project_id?: string;
    labels?: string[];
  },
): Promise<TodoistTask> {
  return todoistFetch<TodoistTask>(apiKey, '/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTodoistTask(
  apiKey: string,
  taskId: string,
  data: {
    content?: string;
    description?: string;
    priority?: number;
    due_string?: string;
    due_date?: string;
    labels?: string[];
  },
): Promise<TodoistTask> {
  return todoistFetch<TodoistTask>(apiKey, `/tasks/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function closeTodoistTask(
  apiKey: string,
  taskId: string,
): Promise<void> {
  await todoistFetch<void>(apiKey, `/tasks/${taskId}/close`, {
    method: 'POST',
  });
}

export async function reopenTodoistTask(
  apiKey: string,
  taskId: string,
): Promise<void> {
  await todoistFetch<void>(apiKey, `/tasks/${taskId}/reopen`, {
    method: 'POST',
  });
}

export async function deleteTodoistTask(
  apiKey: string,
  taskId: string,
): Promise<void> {
  await todoistFetch<void>(apiKey, `/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function getTodoistProjects(
  apiKey: string,
): Promise<TodoistProject[]> {
  const page = await todoistFetch<PaginatedResponse<TodoistProject>>(apiKey, '/projects');
  return page.results;
}

export async function createTodoistProject(
  apiKey: string,
  name: string,
): Promise<TodoistProject> {
  return todoistFetch<TodoistProject>(apiKey, '/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateTodoistKey(apiKey: string): Promise<boolean> {
  try {
    await getTodoistProjects(apiKey);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Priority mapping: Cortex ↔ Todoist
// Todoist: 1=normal, 2=medium, 3=high, 4=urgent
// Cortex: low, medium, high, urgent
// ---------------------------------------------------------------------------

export function cortexPriorityToTodoist(
  priority: string,
): number {
  switch (priority) {
    case 'urgent': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    default: return 1;
  }
}

export function todoistPriorityToCortex(
  priority: number,
): 'low' | 'medium' | 'high' | 'urgent' {
  switch (priority) {
    case 4: return 'urgent';
    case 3: return 'high';
    case 2: return 'medium';
    default: return 'low';
  }
}
