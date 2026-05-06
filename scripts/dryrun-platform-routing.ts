/**
 * Dry-run the per-platform auto-routers from lib/posting/zernio.ts.
 *
 * Builds the exact JSON body Zernio would receive for each scenario and
 * prints it. No network call, no API key needed beyond what's already in
 * .env.local. This validates the routing logic without touching any
 * connected account.
 *
 * Run: npx tsx scripts/dryrun-platform-routing.ts
 *
 * Each scenario's expected output is documented inline so the diff is
 * obvious on a behavior-changing edit.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

// buildPublishBody is module-private; hoist it via a re-export shim.
// We don't want to make it part of the public API, so import the file
// directly and reach into it the cheap way: cast the module.
import * as zernio from '@/lib/posting/zernio';
import type { PublishPostInput, SocialPlatform } from '@/lib/posting/types';

type Builder = (input: PublishPostInput) => Record<string, unknown>;
const buildPublishBody = (zernio as unknown as { buildPublishBody?: Builder })
  .buildPublishBody;

if (!buildPublishBody) {
  console.error(
    'buildPublishBody is not exported from lib/posting/zernio.ts. ' +
      'Add `export { buildPublishBody };` at the bottom of the file (or ' +
      'change the script to import an exported wrapper).',
  );
  process.exit(1);
}

const FAKE = {
  IG: 'fake_ig_account_001',
  FB: 'fake_fb_account_001',
  LI: 'fake_li_account_001',
  YT: 'fake_yt_account_001',
  TT: 'fake_tt_account_001',
  GB: 'fake_gb_account_001',
};

const HINTS: Record<string, SocialPlatform> = {
  [FAKE.IG]: 'instagram',
  [FAKE.FB]: 'facebook',
  [FAKE.LI]: 'linkedin',
  [FAKE.YT]: 'youtube',
  [FAKE.TT]: 'tiktok',
  [FAKE.GB]: 'googlebusiness',
};

const VIDEO_URL = 'https://example.com/test-video.mp4';
const IMAGE_URL = 'https://example.com/test-image.jpg';

interface Scenario {
  name: string;
  expect: string;
  input: PublishPostInput;
}

const scenarios: Scenario[] = [
  {
    name: 'IG single video → Reels (default)',
    expect:
      'platformSpecificData.contentType="reels", shareToFeed=true, no story override',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'Sample reel caption',
      hashtags: ['shorts', 'reel'],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
    },
  },
  {
    name: 'IG single image → feed (no contentType)',
    expect: 'no platformSpecificData.contentType, no shareToFeed',
    input: {
      mediaItems: [{ type: 'image', url: IMAGE_URL }],
      caption: 'Single image post',
      hashtags: ['feed'],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
    },
  },
  {
    name: 'IG carousel (3 images) → feed carousel',
    expect: 'no contentType, mediaItems.length=3',
    input: {
      mediaItems: [
        { type: 'image', url: `${IMAGE_URL}?n=1` },
        { type: 'image', url: `${IMAGE_URL}?n=2` },
        { type: 'image', url: `${IMAGE_URL}?n=3` },
      ],
      caption: 'Carousel',
      hashtags: [],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
    },
  },
  {
    name: 'IG 9:16 image with story override (Landshark scenario)',
    expect:
      'platformSpecificData.contentType="story", no shareToFeed, no firstComment',
    input: {
      mediaItems: [{ type: 'image', url: IMAGE_URL }],
      caption: 'Story image',
      hashtags: [],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
      instagramContentType: 'story',
      firstComment: 'this should be DROPPED for stories',
    },
  },
  {
    name: 'IG video with collaborators + tags + first comment',
    expect:
      'platformSpecificData has contentType=reels, shareToFeed=true, collaborators, firstComment. ' +
      'taggedPeople is intentionally NOT in PSD — Zernio expects userTags as objects with x,y coords ' +
      '(see docs/zernio-platform-shapes.md), bare-string send was silently dropped, so we stop sending it.',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'Cap',
      hashtags: [],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
      taggedPeople: ['@friend1', '@friend2'],
      collaboratorHandles: ['@brand'],
      firstComment: 'Link in bio: https://example.com',
    },
  },

  {
    name: 'FB video → no platformSpecificData (Zernio routes feed-video automatically)',
    expect: 'platforms[0] has no platformSpecificData key',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'FB feed video',
      hashtags: [],
      platformProfileIds: [FAKE.FB],
      platformHints: HINTS,
    },
  },
  {
    name: 'FB video with reel override',
    expect: 'platformSpecificData.contentType="reel"',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'FB reel',
      hashtags: [],
      platformProfileIds: [FAKE.FB],
      platformHints: HINTS,
      facebookContentType: 'reel',
      firstComment: 'Comment after publish',
    },
  },
  {
    name: 'FB image with story override',
    expect:
      'platformSpecificData.contentType="story", no firstComment (stories drop it)',
    input: {
      mediaItems: [{ type: 'image', url: IMAGE_URL }],
      caption: 'FB story',
      hashtags: [],
      platformProfileIds: [FAKE.FB],
      platformHints: HINTS,
      facebookContentType: 'story',
      firstComment: 'this should be DROPPED for stories',
      facebookPageId: 'page_123',
    },
  },

  {
    name: 'LinkedIn video → no contentType discriminator (variant inferred)',
    expect: 'no contentType key at all; variant inferred from mediaItems',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'LinkedIn vid',
      hashtags: [],
      platformProfileIds: [FAKE.LI],
      platformHints: HINTS,
    },
  },
  {
    name: 'LinkedIn video with org URN + first comment',
    expect:
      'platformSpecificData.organizationUrn + firstComment, no contentType',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'LI vid for company page',
      hashtags: [],
      platformProfileIds: [FAKE.LI],
      platformHints: HINTS,
      linkedinOrganizationUrn: 'urn:li:organization:123456',
      firstComment: 'Read more here: https://example.com/article',
    },
  },
  {
    name: 'LinkedIn carousel (3 images) → multi-image variant',
    expect: 'mediaItems.length=3, no contentType',
    input: {
      mediaItems: [
        { type: 'image', url: `${IMAGE_URL}?n=1` },
        { type: 'image', url: `${IMAGE_URL}?n=2` },
        { type: 'image', url: `${IMAGE_URL}?n=3` },
      ],
      caption: 'LI multi-image',
      hashtags: [],
      platformProfileIds: [FAKE.LI],
      platformHints: HINTS,
    },
  },

  {
    name: 'YouTube video → title falls back to first caption line',
    expect:
      'platformSpecificData.title="My amazing short" (first line), visibility=public',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'My amazing short\n\nLong description below',
      hashtags: ['shorts', 'youtube'],
      platformProfileIds: [FAKE.YT],
      platformHints: HINTS,
    },
  },
  {
    name: 'YouTube video with full overrides',
    expect:
      'title=override, description=override, tags=youtubeTags, visibility=unlisted, madeForKids=true, firstComment present',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'shared caption',
      hashtags: ['shared'],
      platformProfileIds: [FAKE.YT],
      platformHints: HINTS,
      youtubeTitle: 'Custom title',
      youtubeDescription: 'Custom description',
      youtubeTags: ['custom', 'tags'],
      youtubePrivacy: 'unlisted',
      youtubeMadeForKids: true,
      firstComment: 'pinned comment',
    },
  },

  {
    name: 'TikTok video → body.tiktokSettings populated, leg has no PSD',
    expect:
      'body has tiktokSettings with privacy_level + content_preview_confirmed=true; platforms[0] has only platform+accountId',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'TT post',
      hashtags: [],
      platformProfileIds: [FAKE.TT],
      platformHints: HINTS,
    },
  },

  {
    name: 'Google Business image → no platformSpecificData, in PLATFORM_MAP now',
    expect: 'platforms[0] has no platformSpecificData key',
    input: {
      mediaItems: [{ type: 'image', url: IMAGE_URL }],
      caption: 'GB update',
      hashtags: [],
      platformProfileIds: [FAKE.GB],
      platformHints: HINTS,
    },
  },

  {
    name: 'CROSS-PLATFORM fan-out: IG + FB + LI + YT all on one video',
    expect:
      '4 legs in platforms[]; each builder produces its own correct shape; firstComment fans out to FB/IG/LI/YT',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'Multi-platform launch',
      hashtags: ['launch', 'new'],
      platformProfileIds: [FAKE.IG, FAKE.FB, FAKE.LI, FAKE.YT],
      platformHints: HINTS,
      firstComment: 'Read more: https://example.com',
      facebookContentType: 'reel',
      linkedinOrganizationUrn: 'urn:li:organization:999',
      youtubePrivacy: 'public',
    },
  },

  {
    name: 'Scheduled (not publishNow)',
    expect: 'body.scheduledFor present, body.publishNow absent',
    input: {
      videoUrl: VIDEO_URL,
      caption: 'Future post',
      hashtags: [],
      platformProfileIds: [FAKE.IG],
      platformHints: HINTS,
      scheduledAt: '2026-12-31T23:59:00Z',
    },
  },
];

console.log(`Running ${scenarios.length} dry-run scenarios.\n`);

let pass = 0;
let fail = 0;

for (const s of scenarios) {
  console.log('━'.repeat(72));
  console.log(`▶ ${s.name}`);
  console.log(`  expect: ${s.expect}`);
  try {
    const body = buildPublishBody(s.input);
    console.log(JSON.stringify(body, null, 2));
    pass++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${(err as Error).message}`);
    fail++;
  }
  console.log();
}

console.log('━'.repeat(72));
console.log(`Done. ${pass} built, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
