/**
 * POST /api/monday/webhook
 *
 * Monday.com webhook receiver. When a client is created or updated
 * on the Clients board, the profile is synced to the Obsidian vault.
 *
 * Monday.com webhooks send a challenge on first registration — we echo it back.
 *
 * Events handled:
 *   - create_item: New client added
 *   - change_column_values: Client info updated
 */

import { NextRequest, NextResponse } from 'next/server';
import { isVaultConfigured } from '@/lib/vault/github';
import { isMondayConfigured, mondayQuery, type MondayItem } from '@/lib/monday/client';
import { syncMondayClientToVault } from '@/lib/monday/sync';

const CLIENTS_BOARD_ID = process.env.MONDAY_CLIENTS_BOARD_ID || '9432491336';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Monday.com sends a challenge on webhook registration — echo it back
    if (body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    if (!isVaultConfigured() || !isMondayConfigured()) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }

    const event = body.event;
    if (!event) {
      return NextResponse.json({ message: 'No event' });
    }

    const boardId = String(event.boardId);
    if (boardId !== CLIENTS_BOARD_ID) {
      return NextResponse.json({ message: 'Ignored: different board' });
    }

    const itemId = String(event.pulseId || event.itemId);
    if (!itemId) {
      return NextResponse.json({ message: 'No item ID' });
    }

    // Fetch the full item from Monday.com
    const data = await mondayQuery<{
      items: MondayItem[];
    }>(`
      query {
        items(ids: [${itemId}]) {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    `);

    const item = data.items?.[0];
    if (!item) {
      return NextResponse.json({ message: 'Item not found' });
    }

    // Skip test clients
    if (item.name.toLowerCase().includes('test client')) {
      return NextResponse.json({ message: 'Skipped test client' });
    }

    const result = await syncMondayClientToVault(item);
    console.log(`[monday-webhook] ${result.action}: ${result.name}`);

    return NextResponse.json({
      message: `${result.action}: ${result.name}`,
      ...result,
    });
  } catch (error) {
    console.error('POST /api/monday/webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
