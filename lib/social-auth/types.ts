export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  /** Facebook/Instagram page-scoped token (long-lived, ~60 days or never expires) */
  pageAccessToken?: string;
  pageId?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SocialProfile {
  platformUserId: string;
  username: string;
  avatarUrl?: string;
}

export interface OAuthResult {
  tokens: OAuthTokens;
  profile: SocialProfile;
}
