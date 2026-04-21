import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

import { scrapeTikTokProfile } from '../lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '../lib/audit/scrape-instagram-profile';
import { scrapeYouTubeProfile } from '../lib/audit/scrape-youtube-profile';

const TEST = {
  tiktok: 'https://www.tiktok.com/@toastique',
  instagram: 'https://www.instagram.com/toastique/',
  youtube: 'https://www.youtube.com/@Toastique',
};

function summarize(label: string, profile: Record<string, unknown>, videos: unknown[]) {
  const vids = videos as { publishDate?: string; thumbnailUrl?: string; views?: number; likes?: number; comments?: number; shares?: number }[];
  const dated = vids.filter(v => v.publishDate).length;
  const thumbed = vids.filter(v => v.thumbnailUrl).length;
  const now = Date.now();
  const last30 = vids.filter(v => v.publishDate && new Date(v.publishDate).getTime() >= now - 30*86400000).length;
  const last7 = vids.filter(v => v.publishDate && new Date(v.publishDate).getTime() >= now - 7*86400000).length;
  console.log(`\n=== ${label} ===`);
  console.log(`  Username:     ${profile.username}`);
  console.log(`  Display:      ${profile.displayName}`);
  console.log(`  Followers:    ${profile.followers}`);
  console.log(`  Avatar:       ${profile.avatarUrl ? 'present' : 'MISSING'}`);
  console.log(`  Bio:          ${String(profile.bio ?? '').slice(0, 80) || '(none)'}`);
  console.log(`  Total videos: ${videos.length} (${dated} dated, ${thumbed} w/ thumb)`);
  console.log(`  Last 30 days: ${last30} | Last 7 days: ${last7}`);
  if (vids.length > 0) {
    const f = vids[0];
    console.log(`  Sample keys:  ${Object.keys(f).join(', ')}`);
    console.log(`  Sample data:  views=${f.views} likes=${f.likes} comments=${f.comments} shares=${f.shares}`);
    console.log(`  Sample date:  ${f.publishDate ?? 'MISSING'} | thumb: ${f.thumbnailUrl ? 'present' : 'MISSING'}`);
  }
  const dates = vids.filter(v => v.publishDate).map(v => new Date(v.publishDate!)).sort((a,b) => a.getTime()-b.getTime());
  if (dates.length > 0) console.log(`  Date range:   ${dates[0].toLocaleDateString()} → ${dates[dates.length-1].toLocaleDateString()}`);
}

async function main() {
  console.log('Testing scrapers against @toastique...\n');
  
  console.log('--- TikTok ---');
  try {
    const { profile, videos } = await scrapeTikTokProfile(TEST.tiktok);
    summarize('TikTok', profile as unknown as Record<string, unknown>, videos);
  } catch (e) { console.error('TikTok FAILED:', e instanceof Error ? e.message : e); }

  console.log('\n--- Instagram ---');
  try {
    const { profile, videos } = await scrapeInstagramProfile(TEST.instagram);
    summarize('Instagram', profile as unknown as Record<string, unknown>, videos);
  } catch (e) { console.error('Instagram FAILED:', e instanceof Error ? e.message : e); }

  console.log('\n--- YouTube ---');
  try {
    const { profile, videos } = await scrapeYouTubeProfile(TEST.youtube);
    summarize('YouTube', profile as unknown as Record<string, unknown>, videos);
  } catch (e) { console.error('YouTube FAILED:', e instanceof Error ? e.message : e); }

  console.log('\nDone.');
}

main().catch(console.error);
