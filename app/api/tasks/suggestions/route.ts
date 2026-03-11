import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isMondayConfigured,
  fetchContentCalendarItems,
  parseContentCalendarItem,
  fetchContentRequests,
  fetchBlogPipelineItems,
} from '@/lib/monday/client';

interface TaskSuggestion {
  monday_item_id: string;
  name: string;
  client: string;
  board_source: 'content_calendar' | 'content_request' | 'blog';
  status: string;
  due_date: string | null;
  details: Record<string, unknown>;
  already_imported: boolean;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // If Monday isn't configured, return empty with warning
    if (!isMondayConfigured()) {
      return NextResponse.json({
        suggestions: [],
        warning: 'Monday.com API token not configured',
      });
    }

    // Fetch from all 3 boards in parallel
    const [calendarResult, requestsResult, blogResult] = await Promise.allSettled([
      fetchContentCalendarItems(),
      fetchContentRequests(),
      fetchBlogPipelineItems(),
    ]);

    const suggestions: TaskSuggestion[] = [];
    const warnings: string[] = [];

    // --- Content Calendars ---
    if (calendarResult.status === 'fulfilled') {
      const { items } = calendarResult.value;
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const rawItem of items) {
        const item = parseContentCalendarItem(rawItem);

        // Filter: editing_status !== 'Done' and shoot date within 30 days
        if (item.editingStatus === 'Done') continue;
        if (!item.date) continue;

        const shootDate = new Date(item.date);
        if (shootDate > thirtyDaysFromNow) continue;

        suggestions.push({
          monday_item_id: item.mondayItemId,
          name: item.clientName,
          client: item.clientName,
          board_source: 'content_calendar',
          status: item.editingStatus || item.rawsStatus || 'Unknown',
          due_date: item.date,
          details: {
            abbreviation: item.abbreviation,
            group: item.groupTitle,
            raws_status: item.rawsStatus,
            editing_status: item.editingStatus,
            assignment_status: item.assignmentStatus,
            client_approval: item.clientApproval,
            agency: item.agency,
            boosting_status: item.boostingStatus,
            notes: item.notes,
          },
          already_imported: false, // set below
        });
      }
    } else {
      console.error('Failed to fetch Content Calendars:', calendarResult.reason);
      warnings.push('Failed to fetch Content Calendars board');
    }

    // --- Content Requests ---
    if (requestsResult.status === 'fulfilled') {
      for (const item of requestsResult.value) {
        // Filter: status !== 'Done'
        if (item.status === 'Done') continue;

        suggestions.push({
          monday_item_id: item.mondayItemId,
          name: item.name,
          client: item.client,
          board_source: 'content_request',
          status: item.status || 'Unknown',
          due_date: item.dueDate,
          details: {
            urgency: item.urgency,
            content_type: item.contentType,
            platform: item.platform,
            assigned_to: item.assignedTo,
            notes: item.notes,
          },
          already_imported: false,
        });
      }
    } else {
      console.error('Failed to fetch Content Requests:', requestsResult.reason);
      warnings.push('Failed to fetch Content Requests board');
    }

    // --- Blog Pipeline ---
    if (blogResult.status === 'fulfilled') {
      for (const item of blogResult.value) {
        // Filter: month_status !== 'Complete'
        if (item.monthStatus === 'Complete') continue;

        suggestions.push({
          monday_item_id: item.mondayItemId,
          name: item.name,
          client: '', // Blog Pipeline items don't have a dedicated client column
          board_source: 'blog',
          status: item.blogStatus || item.monthStatus || 'Unknown',
          due_date: item.dueDate,
          details: {
            month_status: item.monthStatus,
            blog_status: item.blogStatus,
            client_approved: item.clientApproved,
            word_count: item.wordCount,
            published_url: item.publishedUrl,
          },
          already_imported: false,
        });
      }
    } else {
      console.error('Failed to fetch Blog Pipeline:', blogResult.reason);
      warnings.push('Failed to fetch Blog Pipeline board');
    }

    // Mark already-imported items by checking tasks table for existing monday_item_id values
    if (suggestions.length > 0) {
      const mondayIds = suggestions.map((s) => s.monday_item_id);
      const { data: existingTasks } = await adminClient
        .from('tasks')
        .select('monday_item_id')
        .in('monday_item_id', mondayIds);

      if (existingTasks && existingTasks.length > 0) {
        const importedSet = new Set(existingTasks.map((t) => t.monday_item_id));
        for (const suggestion of suggestions) {
          if (importedSet.has(suggestion.monday_item_id)) {
            suggestion.already_imported = true;
          }
        }
      }
    }

    return NextResponse.json({
      suggestions,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    console.error('GET /api/tasks/suggestions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
