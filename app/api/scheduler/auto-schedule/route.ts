import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { z } from 'zod';

const AutoScheduleSchema = z.object({
  client_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  posts_per_week: z.number().int().min(1).max(14).default(3),
  posting_time: z.string().regex(/^\d{2}:\d{2}$/).default('12:00'),
  platform_profile_ids: z.array(z.string()).min(1),
  /** Optional media IDs to schedule (defaults to all unused media) */
  media_ids: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = AutoScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const data = parsed.data;
    const adminClient = createAdminClient();

    // 1. Fetch unused media (or specific media if IDs provided)
    let mediaQuery = adminClient
      .from('scheduler_media')
      .select('*')
      .eq('client_id', data.client_id)
      .order('created_at', { ascending: true });

    if (data.media_ids?.length) {
      mediaQuery = mediaQuery.in('id', data.media_ids);
    } else {
      mediaQuery = mediaQuery.eq('is_used', false);
    }

    const { data: mediaItems, error: mediaError } = await mediaQuery;
    if (mediaError) {
      return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
    }
    if (!mediaItems || mediaItems.length === 0) {
      return NextResponse.json({ error: 'No unused media found for this client' }, { status: 400 });
    }

    // 2. Fetch client context + saved captions for AI generation
    const [{ data: client }, { data: savedCaptions }] = await Promise.all([
      adminClient
        .from('clients')
        .select('name, industry, brand_voice, target_audience, topic_keywords, description, services')
        .eq('id', data.client_id)
        .single(),
      adminClient
        .from('saved_captions')
        .select('title, caption_text, hashtags')
        .eq('client_id', data.client_id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Build brand context for AI
    let clientContext = '';
    if (client) {
      clientContext = `Brand: ${client.name}
Industry: ${client.industry ?? 'General'}
Brand voice: ${client.brand_voice ?? 'Professional and engaging'}
Target audience: ${client.target_audience ?? 'General audience'}
Keywords: ${(client.topic_keywords ?? []).join(', ')}
${client.description ? `About: ${client.description}` : ''}
${(client.services ?? []).length > 0 ? `Services: ${client.services.join(', ')}` : ''}`;
    }

    let savedCaptionsContext = '';
    if (savedCaptions && savedCaptions.length > 0) {
      const examples = savedCaptions.map((sc: { title: string; caption_text: string; hashtags: string[] }) => {
        const parts = [`- "${sc.title}": ${sc.caption_text}`];
        if (sc.hashtags?.length > 0) parts.push(`  Hashtags: ${sc.hashtags.map((h: string) => `#${h}`).join(' ')}`);
        return parts.join('\n');
      }).join('\n');
      savedCaptionsContext = `\n\nSaved CTAs & hashtag sets (match this exact style):
${examples}`;
    }

    // 3. Calculate evenly spaced dates
    const scheduleDates = calculateScheduleDates(
      data.start_date,
      data.end_date,
      data.posts_per_week,
      mediaItems.length,
      data.posting_time,
    );

    // 4. Generate captions + create posts for each media item
    const results: Array<{ media_id: string; post_id: string; scheduled_at: string; status: 'success' | 'error'; error?: string }> = [];

    for (let i = 0; i < mediaItems.length; i++) {
      const mediaItem = mediaItems[i];
      const scheduledAt = scheduleDates[i];
      if (!scheduledAt) break; // More media than available slots

      try {
        // Generate caption via AI
        const caption = await generateCaption(
          mediaItem.filename,
          i + 1,
          mediaItems.length,
          clientContext,
          savedCaptionsContext,
        );

        // Parse caption and hashtags
        const { captionText, hashtags } = parseCaptionAndHashtags(caption);

        // Create the post
        const { data: post, error: postError } = await adminClient
          .from('scheduled_posts')
          .insert({
            client_id: data.client_id,
            created_by: user.id,
            caption: captionText,
            hashtags,
            scheduled_at: scheduledAt,
            status: 'scheduled',
          })
          .select()
          .single();

        if (postError || !post) {
          results.push({ media_id: mediaItem.id, post_id: '', scheduled_at: scheduledAt, status: 'error', error: postError?.message ?? 'Failed to create post' });
          continue;
        }

        // Link platforms
        if (data.platform_profile_ids.length > 0) {
          await adminClient
            .from('scheduled_post_platforms')
            .insert(
              data.platform_profile_ids.map(profileId => ({
                post_id: post.id,
                social_profile_id: profileId,
                status: 'pending',
              }))
            );
        }

        // Link media
        await adminClient
          .from('scheduled_post_media')
          .insert({
            post_id: post.id,
            media_id: mediaItem.id,
            sort_order: 0,
          });

        // Mark media as used
        await adminClient
          .from('scheduler_media')
          .update({ is_used: true })
          .eq('id', mediaItem.id);

        results.push({ media_id: mediaItem.id, post_id: post.id, scheduled_at: scheduledAt, status: 'success' });
      } catch (err) {
        results.push({
          media_id: mediaItem.id,
          post_id: '',
          scheduled_at: scheduledAt,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      scheduled: successCount,
      errors: errorCount,
      results,
    });
  } catch (error) {
    console.error('POST /api/scheduler/auto-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Calculate evenly spaced dates within the range based on posts per week */
function calculateScheduleDates(
  startDate: string,
  endDate: string,
  postsPerWeek: number,
  maxPosts: number,
  postingTime: string,
): string[] {
  const start = new Date(`${startDate}T${postingTime}`);
  const end = new Date(`${endDate}T${postingTime}`);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (totalDays <= 0) return [start.toISOString()];

  // Calculate interval between posts in days
  const intervalDays = 7 / postsPerWeek;
  const dates: string[] = [];
  let current = new Date(start);

  while (current <= end && dates.length < maxPosts) {
    dates.push(current.toISOString());
    current = new Date(current.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }

  return dates;
}

/** Generate a caption for a media item using AI */
async function generateCaption(
  filename: string,
  index: number,
  total: number,
  clientContext: string,
  savedCaptionsContext: string,
): Promise<string> {
  const result = await createCompletion({
    messages: [
      {
        role: 'system',
        content: `You are a social media copywriter specializing in short-form video content (Instagram Reels, TikTok, YouTube Shorts, Facebook Reels).

Generate an engaging caption for a video post. Each caption must be UNIQUE and different from the others in this batch.

Caption structure (follow this EXACTLY):
1. Hook line — attention-grabbing first line that makes people stop scrolling
2. Body — 1-2 sentences about the content, value, or story
3. CTA — clear call to action (inspired by the saved CTAs below if available)
4. Hashtag wall — 15-25 relevant hashtags on the last lines

Rules:
- Strong hook in the first line
- Use line breaks for readability
- Keep under 2200 characters
- Match the brand voice exactly
- Do NOT use markdown formatting (no asterisks, no headers, no backticks)
- Use emojis sparingly (1-2 max in the body, appropriate to the brand)
- Return ONLY the caption text with hashtags, no explanation or labels

${clientContext ? `Client context:\n${clientContext}` : ''}${savedCaptionsContext}`,
      },
      {
        role: 'user',
        content: `Generate caption ${index} of ${total} for a video (file: "${filename}"). Make this caption unique and engaging. Write it exactly in the style of the saved captions above.`,
      },
    ],
    maxTokens: 600,
  });

  return result.text.trim()
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#+\s/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/`/g, '');
}

/** Separate caption text from hashtags */
function parseCaptionAndHashtags(fullCaption: string): { captionText: string; hashtags: string[] } {
  const lines = fullCaption.split('\n');
  const hashtagLines: string[] = [];
  const captionLines: string[] = [];

  // Find where hashtag wall starts (a line that's mostly hashtags)
  let inHashtags = false;
  for (const line of lines) {
    const hashCount = (line.match(/#\w+/g) ?? []).length;
    const wordCount = line.trim().split(/\s+/).length;

    if (hashCount >= 3 && hashCount / wordCount > 0.5) {
      inHashtags = true;
    }

    if (inHashtags) {
      hashtagLines.push(line);
    } else {
      captionLines.push(line);
    }
  }

  const hashtags = hashtagLines
    .join(' ')
    .match(/#(\w+)/g)
    ?.map(h => h.replace('#', '')) ?? [];

  return {
    captionText: captionLines.join('\n').trim(),
    hashtags: [...new Set(hashtags)],
  };
}
