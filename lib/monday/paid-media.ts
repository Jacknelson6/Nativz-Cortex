/**
 * Read the "Paid Media" service flag from the Monday Clients board.
 *
 * Used to gate the calendar-approval Google Chat webhook — only paid-media
 * clients trigger the team ping when their content calendar is approved.
 */

import { fetchMondayClients, parseMondayClient } from './client';

export async function isClientPaidMedia(clientName: string): Promise<boolean> {
  const items = await fetchMondayClients();
  const target = clientName.toLowerCase().trim();
  for (const item of items) {
    if (item.name.toLowerCase().trim() === target) {
      return parseMondayClient(item).services.includes('Paid Media');
    }
  }
  return false;
}
