export interface TaskClient {
  id: string;
  name: string;
  slug: string;
}

export interface TaskAssignee {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  client_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  task_type: string;
  tags: string[];
  recurrence?: string | null;
  recurrence_from_completion?: boolean;
  created_at: string;
  monday_item_id?: string | null;
  monday_board_id?: string | null;
  todoist_task_id?: string | null;
  clients: TaskClient | null;
  team_members: TaskAssignee | null;
}
