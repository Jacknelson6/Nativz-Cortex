'use client';

import { Grid3x3, Play, Bookmark, Tag } from 'lucide-react';
import type { SocialResultsProfile, SocialResultsPost } from '@/app/admin/presentations/[id]/types';

interface InstagramMockupProps {
  profile: SocialResultsProfile;
  label?: string;
  colorScheme?: 'light' | 'dark';
}

export function InstagramMockup({ profile, label, colorScheme = 'dark' }: InstagramMockupProps) {
  const isDark = colorScheme === 'dark';
  const bg = isDark ? 'bg-black' : 'bg-white';
  const border = isDark ? 'border-gray-800' : 'border-gray-200';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const textSecondary = isDark ? 'text-gray-300' : 'text-gray-700';
  const btnBg = isDark ? 'bg-[#363636] hover:bg-gray-600' : 'bg-[#efefef] hover:bg-gray-200';

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  return (
    <div className={`${bg} rounded-2xl overflow-hidden border ${border} max-w-sm w-full shadow-2xl select-none font-sans`}>
      {/* Top bar — handle + icons */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${border}`}>
        <span className={`text-[15px] font-semibold ${textPrimary}`}>{profile.handle}</span>
        <div className="flex items-center gap-3">
          {/* Instagram icon */}
          <svg viewBox="0 0 24 24" className={`w-6 h-6 ${isDark ? 'fill-white' : 'fill-gray-900'}`}>
            <path d="M12 2.982c2.937 0 3.285.011 4.445.064a6.087 6.087 0 0 1 2.042.379 3.408 3.408 0 0 1 1.265.823 3.408 3.408 0 0 1 .823 1.265 6.087 6.087 0 0 1 .379 2.042c.053 1.16.064 1.508.064 4.445s-.011 3.285-.064 4.445a6.087 6.087 0 0 1-.379 2.042 3.643 3.643 0 0 1-2.088 2.088 6.087 6.087 0 0 1-2.042.379c-1.16.053-1.508.064-4.445.064s-3.285-.011-4.445-.064a6.087 6.087 0 0 1-2.043-.379 3.408 3.408 0 0 1-1.264-.823 3.408 3.408 0 0 1-.823-1.265 6.087 6.087 0 0 1-.379-2.042c-.053-1.16-.064-1.508-.064-4.445s.011-3.285.064-4.445a6.087 6.087 0 0 1 .379-2.042 3.408 3.408 0 0 1 .823-1.265 3.408 3.408 0 0 1 1.265-.823 6.087 6.087 0 0 1 2.042-.379c1.16-.053 1.508-.064 4.445-.064M12 1c-2.987 0-3.362.013-4.535.066a8.074 8.074 0 0 0-2.67.511 5.392 5.392 0 0 0-1.949 1.27 5.392 5.392 0 0 0-1.269 1.948 8.074 8.074 0 0 0-.51 2.67C1.012 8.638 1 9.013 1 12s.013 3.362.066 4.535a8.074 8.074 0 0 0 .511 2.67 5.392 5.392 0 0 0 1.27 1.949 5.392 5.392 0 0 0 1.948 1.269 8.074 8.074 0 0 0 2.67.51C8.638 22.988 9.013 23 12 23s3.362-.013 4.535-.066a8.074 8.074 0 0 0 2.67-.511 5.625 5.625 0 0 0 3.218-3.218 8.074 8.074 0 0 0 .51-2.67C22.988 15.362 23 14.987 23 12s-.013-3.362-.066-4.535a8.074 8.074 0 0 0-.511-2.67 5.392 5.392 0 0 0-1.27-1.949 5.392 5.392 0 0 0-1.948-1.269 8.074 8.074 0 0 0-2.67-.51C15.362 1.012 14.987 1 12 1Zm0 5.351a5.649 5.649 0 1 0 0 11.298 5.649 5.649 0 0 0 0-11.298Zm0 9.316a3.667 3.667 0 1 1 0-7.334 3.667 3.667 0 0 1 0 7.334Zm5.872-10.859a1.32 1.32 0 1 0 0 2.64 1.32 1.32 0 0 0 0-2.64Z" />
          </svg>
          {/* Messages icon */}
          <svg viewBox="0 0 24 24" className={`w-6 h-6 ${isDark ? 'fill-white' : 'fill-gray-900'}`}>
            <path d="M3.4 22a.7.7 0 0 1-.7-.801l.747-5.972A9.866 9.866 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.866 9.866 0 0 1-3.225-.534L3.4 22Zm2.7-4.1-.31 2.484 2.48-.31.214.071A7.88 7.88 0 0 0 12 20.8c4.29 0 7.8-3.51 7.8-8.8 0-4.29-3.51-7.8-8.8-7.8S4.2 7.71 4.2 12a7.88 7.88 0 0 0 .674 3.216l.226.684Z" />
          </svg>
        </div>
      </div>

      {/* Profile section */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4 mb-3">
          {/* Avatar with gradient ring */}
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-[3px]">
              <div className={`w-full h-full rounded-full overflow-hidden ${isDark ? 'bg-black' : 'bg-white'}`}>
                {profile.profile_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profile_image} alt={profile.display_name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full ${isDark ? 'bg-gray-800' : 'bg-gray-200'} flex items-center justify-center text-2xl font-bold ${textMuted}`}>
                    {profile.display_name[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats: posts / followers / following */}
          <div className="flex gap-5 flex-1">
            {[
              { value: profile.posts_count > 0 ? profile.posts_count : profile.posts.length, label: 'posts' },
              { value: profile.followers, label: 'followers' },
              { value: profile.following, label: 'following' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className={`text-[15px] font-semibold ${textPrimary}`}>{formatNumber(value)}</div>
                <div className={`text-xs ${textMuted}`}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Name + bio */}
        <div className="mb-3">
          <p className={`text-[14px] font-semibold ${textPrimary} leading-tight`}>{profile.display_name}</p>
          {profile.bio && (
            <p className={`text-[13px] ${textSecondary} mt-0.5 leading-snug whitespace-pre-wrap`}>{profile.bio}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {['Follow', 'Message'].map((label) => (
            <button
              key={label}
              className={`flex-1 ${btnBg} rounded-lg py-[7px] text-[13px] font-semibold ${textPrimary} transition-colors`}
            >
              {label}
            </button>
          ))}
          <button className={`${btnBg} rounded-lg px-3 py-[7px] ${textPrimary} transition-colors`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM6 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Story highlights */}
      {profile.story_highlights.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1">
            {profile.story_highlights.slice(0, 5).map((hl) => (
              <div key={hl.id} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`w-14 h-14 rounded-full border-2 ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center`}>
                  {hl.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hl.cover_image_url} alt={hl.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-bold">
                      {hl.title[0]?.toUpperCase() ?? '★'}
                    </div>
                  )}
                </div>
                <span className={`text-[11px] ${textMuted} truncate w-14 text-center`}>{hl.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid tab bar */}
      <div className={`border-t ${border} flex`}>
        <button className={`flex-1 flex justify-center py-3 border-b-[1.5px] ${isDark ? 'border-white' : 'border-gray-900'}`}>
          <Grid3x3 size={22} className={textPrimary} />
        </button>
        <button className="flex-1 flex justify-center py-3">
          <Play size={22} className={textMuted} />
        </button>
        <button className="flex-1 flex justify-center py-3">
          <Bookmark size={22} className={textMuted} />
        </button>
        <button className="flex-1 flex justify-center py-3">
          <Tag size={22} className={textMuted} />
        </button>
      </div>

      {/* Post grid */}
      <PostGrid posts={profile.posts} isDark={isDark} />

      {/* Label */}
      {label && (
        <div className={`px-4 py-2.5 ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'} border-t ${border} text-center`}>
          <span className={`text-[11px] font-semibold ${textMuted} uppercase tracking-widest`}>{label}</span>
        </div>
      )}
    </div>
  );
}

// ─── Post grid ────────────────────────────────────────────────────────────────

function PostGrid({ posts, isDark }: { posts: SocialResultsPost[]; isDark: boolean }) {
  const displayPosts = [...posts];
  while (displayPosts.length < 9) {
    displayPosts.push({ id: `ph-${displayPosts.length}`, image_url: '', is_generated: false, type: 'photo' });
  }

  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {displayPosts.slice(0, 9).map((post) => (
        <PostThumbnail key={post.id} post={post} isDark={isDark} />
      ))}
    </div>
  );
}

function PostThumbnail({ post, isDark }: { post: SocialResultsPost; isDark: boolean }) {
  return (
    <div className="relative aspect-square overflow-hidden">
      {post.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full ${isDark ? 'bg-gray-900' : 'bg-gray-100'} animate-pulse`} />
      )}
      {post.is_generated && (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 shadow-sm" title="AI generated" />
      )}
      {post.type === 'reel' && (
        <div className="absolute top-1.5 right-1.5">
          <svg viewBox="0 0 12 14" className="w-3 h-3 fill-white drop-shadow">
            <path d="M0 1.5v11L11 7z" />
          </svg>
        </div>
      )}
    </div>
  );
}
