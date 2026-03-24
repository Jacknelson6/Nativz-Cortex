import type { PostingService } from './types';
import { ZernioPostingService } from './zernio';

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

export {
  ZernioPostingService,
  createZernioProfile,
  createLateProfile,
  getZernioApiKey,
  getZernioApiBase,
} from './zernio';

let _instance: PostingService | null = null;

export function getPostingService(): PostingService {
  if (_instance) return _instance;

  const provider = process.env.POSTING_PROVIDER ?? 'zernio';

  switch (provider) {
    case 'zernio':
    case 'late':
      _instance = new ZernioPostingService();
      break;
    default:
      throw new Error(`Unknown posting provider: ${provider}. Supported: zernio (late alias)`);
  }

  return _instance;
}
