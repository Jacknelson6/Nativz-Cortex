import type { PostingService } from './types';
import { LatePostingService } from './late';

export type { PostingService } from './types';
export type {
  SocialPlatform,
  SocialProfile,
  PublishPostInput,
  PublishResult,
  PlatformResult,
  PostStatusResult,
  ConnectProfileInput,
  ConnectProfileResult,
  PostAnalytics,
  AnalyticsQuery,
  ListPostsQuery,
  LatePost,
} from './types';

let _instance: PostingService | null = null;

export function getPostingService(): PostingService {
  if (_instance) return _instance;

  const provider = process.env.POSTING_PROVIDER ?? 'late';

  switch (provider) {
    case 'late':
      _instance = new LatePostingService();
      break;
    default:
      throw new Error(`Unknown posting provider: ${provider}. Supported: late`);
  }

  return _instance;
}
