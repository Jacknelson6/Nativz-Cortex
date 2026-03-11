/**
 * Google Chat API client — read-only operations.
 */

import { getValidToken } from './auth';

const CHAT_API = 'https://chat.googleapis.com/v1';

export interface ChatSpace {
  name: string;
  displayName: string;
  type: 'ROOM' | 'DM' | 'GROUP_CHAT';
  spaceThreadingState?: string;
}

export interface ChatMessage {
  name: string;
  sender: {
    name: string;
    displayName: string;
    avatarUrl?: string;
    type: 'HUMAN' | 'BOT';
  };
  createTime: string;
  text?: string;
  formattedText?: string;
  thread?: { name: string };
}

interface ChatListResponse<T> {
  items: T[];
  nextPageToken?: string;
}

async function chatRequest(userId: string, path: string, params?: Record<string, string>) {
  const token = await getValidToken(userId);
  if (!token) throw new Error('Google account not connected');

  const url = new URL(`${CHAT_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Chat API error: ${err.error?.message || res.statusText}`);
  }

  return res.json();
}

/**
 * List all Chat spaces the user is a member of.
 */
export async function listSpaces(
  userId: string,
  pageToken?: string,
): Promise<ChatListResponse<ChatSpace>> {
  const data = await chatRequest(userId, '/spaces', {
    pageSize: '100',
    ...(pageToken ? { pageToken } : {}),
  });

  return {
    items: data.spaces || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * List messages in a Chat space.
 */
export async function listMessages(
  userId: string,
  spaceName: string,
  opts?: { pageSize?: number; pageToken?: string },
): Promise<ChatListResponse<ChatMessage>> {
  const data = await chatRequest(userId, `/${spaceName}/messages`, {
    pageSize: String(opts?.pageSize ?? 50),
    orderBy: 'createTime desc',
    ...(opts?.pageToken ? { pageToken: opts.pageToken } : {}),
  });

  return {
    items: data.messages || [],
    nextPageToken: data.nextPageToken,
  };
}
