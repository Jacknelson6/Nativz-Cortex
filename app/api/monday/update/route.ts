import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mondayQuery, isMondayConfigured } from '@/lib/monday/client';

const CLIENTS_BOARD_ID = process.env.MONDAY_CLIENTS_BOARD_ID || '9432491336';

const updateSchema = z.object({
  monday_item_id: z.string().regex(/^\d+$/, 'Must be a numeric ID'),
  services: z.array(z.string()).optional(),
  agency: z.string().optional(),
  poc_name: z.string().optional(),
  poc_email: z.string().optional(),
  abbreviation: z.string().optional(),
});

export async function POST(request: NextRequest) {
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

    if (!isMondayConfigured()) {
      return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const columnValues: Record<string, unknown> = {};

    // Service columns
    if (data.services !== undefined) {
      const allServices = ['SMM', 'Paid Media', 'Affiliates', 'Editing'];
      const serviceColumns: Record<string, string> = {
        'SMM': 'color_mktsd6y7',
        'Paid Media': 'color_mkwz9cwd',
        'Affiliates': 'color_mktsmz4y',
        'Editing': 'color_mkwqhwx',
      };
      for (const svc of allServices) {
        columnValues[serviceColumns[svc]] = {
          label: data.services.includes(svc) ? 'Yes' : 'No',
        };
      }
    }

    // Agency column
    if (data.agency !== undefined) {
      columnValues.color_mkrw743r = { label: data.agency || '' };
    }

    // POC column
    if (data.poc_name !== undefined || data.poc_email !== undefined) {
      const pocText = data.poc_email
        ? `${data.poc_name || ''} <${data.poc_email}>`
        : data.poc_name || '';
      columnValues.long_text_mkxm4whr = { text: pocText };
    }

    // Abbreviation column
    if (data.abbreviation !== undefined) {
      columnValues.text_mkt467rn = data.abbreviation;
    }

    if (Object.keys(columnValues).length === 0) {
      return NextResponse.json({ success: true, message: 'No fields to update' });
    }

    const valuesJson = JSON.stringify(JSON.stringify(columnValues));

    await mondayQuery(`
      mutation {
        change_multiple_column_values(
          board_id: ${CLIENTS_BOARD_ID},
          item_id: ${data.monday_item_id},
          column_values: ${valuesJson}
        ) {
          id
        }
      }
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/monday/update error:', error);
    return NextResponse.json({ error: 'Failed to update Monday.com' }, { status: 500 });
  }
}
