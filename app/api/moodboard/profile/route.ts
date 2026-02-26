import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface TikWMPost {
  video_id: string;
  title: string;
  cover: string;
  play: number;
  digg_count: number;
  comment_count: number;
  share_count: number;
  duration: number;
  create_time: number;
}

interface TikWMUserInfo {
  user: {
    uniqueId: string;
    nickname: string;
    avatarLarger: string;
    signature: string;
  };
  stats: {
    followerCount: number;
    followingCount: number;
    heartCount: number;
    videoCount: number;
  };
}

interface PostData {
  url: string;
  title: string;
  thumbnail: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: number;
  hashtags: string[];
  engagement: number;
  formatGroup?: string;
}

function extractHandle(url: string): { platform: string; handle: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');

    if (host.includes('tiktok.com')) {
      const match = u.pathname.match(/\/@([^/?]+)/);
      if (match) return { platform: 'tiktok', handle: match[1] };
    }
    if (host.includes('instagram.com')) {
      const match = u.pathname.match(/\/([^/?]+)/);
      if (match && !['p', 'reel', 'stories', 'explore'].includes(match[1])) {
        return { platform: 'instagram', handle: match[1] };
      }
    }
    if (host.includes('youtube.com')) {
      const match = u.pathname.match(/\/@([^/?]+)/);
      if (match) return { platform: 'youtube', handle: match[1] };
    }
  } catch {
    // Try bare handle
  }
  return null;
}

function extractHashtags(title: string): string[] {
  const matches = title.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((h) => h.slice(1)) : [];
}

async function classifyFormats(posts: PostData[]): Promise<Record<string, string>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || posts.length === 0) return {};

  const postSummaries = posts.map((p, i) => `${i}: "${p.title}" [${p.hashtags.join(', ')}] (${p.duration}s)`).join('\n');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: 'You classify TikTok videos into format categories. Return ONLY valid JSON mapping index to category. Categories: "talking-head", "b-roll", "tutorial", "before-after", "vlog", "skit", "product-review", "story-time", "transition", "trend", "montage", "interview", "other". Example: {"0":"talking-head","1":"tutorial"}',
          },
          {
            role: 'user',
            content: `Classify these posts by format:\n${postSummaries}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // Classification failed, continue without
  }
  return {};
}

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

    const body = await request.json();
    const { url } = body;
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const parsed = extractHandle(url);
    if (!parsed) {
      return NextResponse.json({ error: 'Could not extract handle from URL. Supported: TikTok, Instagram, YouTube.' }, { status: 400 });
    }

    if (parsed.platform !== 'tiktok') {
      return NextResponse.json({ error: `${parsed.platform} extraction coming soon. Only TikTok is supported currently.` }, { status: 400 });
    }

    // Fetch profile info
    let profileInfo: TikWMUserInfo | null = null;
    try {
      const infoRes = await fetch(`https://www.tikwm.com/api/user/info?unique_id=${parsed.handle}`);
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        if (infoData.code === 0 && infoData.data) {
          profileInfo = infoData.data;
        }
      }
    } catch {
      // Profile info optional
    }

    // Fetch posts
    const postsRes = await fetch(`https://www.tikwm.com/api/user/posts?unique_id=${parsed.handle}&count=30`);
    if (!postsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch posts from TikTok' }, { status: 502 });
    }

    const postsData = await postsRes.json();
    if (postsData.code !== 0 || !postsData.data?.videos) {
      return NextResponse.json({ error: 'No posts found or profile is private' }, { status: 404 });
    }

    const videos: TikWMPost[] = postsData.data.videos;

    const posts: PostData[] = videos.map((v) => ({
      url: `https://www.tiktok.com/@${parsed.handle}/video/${v.video_id}`,
      title: v.title || '',
      thumbnail: v.cover || '',
      views: v.play || 0,
      likes: v.digg_count || 0,
      comments: v.comment_count || 0,
      shares: v.share_count || 0,
      duration: v.duration || 0,
      hashtags: extractHashtags(v.title || ''),
      engagement: (v.digg_count || 0) + (v.comment_count || 0) + (v.share_count || 0),
    }));

    // Sort by engagement
    posts.sort((a, b) => b.engagement - a.engagement);

    // Classify formats via AI
    const classifications = await classifyFormats(posts);
    posts.forEach((p, i) => {
      p.formatGroup = classifications[String(i)] || 'other';
    });

    // Build format groups with stats
    const formatGroups: Record<string, { posts: PostData[]; avgEngagement: number; avgViews: number }> = {};
    for (const post of posts) {
      const group = post.formatGroup || 'other';
      if (!formatGroups[group]) {
        formatGroups[group] = { posts: [], avgEngagement: 0, avgViews: 0 };
      }
      formatGroups[group].posts.push(post);
    }
    for (const group of Object.values(formatGroups)) {
      group.avgEngagement = Math.round(group.posts.reduce((s, p) => s + p.engagement, 0) / group.posts.length);
      group.avgViews = Math.round(group.posts.reduce((s, p) => s + p.views, 0) / group.posts.length);
    }

    return NextResponse.json({
      profile: profileInfo ? {
        name: profileInfo.user.nickname,
        handle: profileInfo.user.uniqueId,
        avatar: profileInfo.user.avatarLarger,
        bio: profileInfo.user.signature,
        followers: profileInfo.stats.followerCount,
        following: profileInfo.stats.followingCount,
        likes: profileInfo.stats.heartCount,
        videos: profileInfo.stats.videoCount,
      } : {
        handle: parsed.handle,
        name: parsed.handle,
        avatar: null,
        bio: null,
        followers: null,
        following: null,
        likes: null,
        videos: null,
      },
      posts,
      formatGroups,
      platform: parsed.platform,
    });
  } catch (err) {
    console.error('Profile extraction error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
