import { gatherRedditData } from '../lib/reddit/client';
import { gatherTikTokData } from '../lib/tiktok/search';
import { gatherYouTubeData } from '../lib/youtube/search';
import { gatherQuoraData } from '../lib/quora/client';
import { gatherPlatformData } from '../lib/search/platform-router';
import type { SearchPlatform } from '../lib/types/search';

const query = 'junk removal';
const timeRange = 'last_3_months';
const volume = 'light';

async function testScraper(name: string, fn: () => Promise<any>) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    const sources = result.posts?.length ?? result.videos?.length ?? result.questions?.length ?? result.sources?.length ?? 0;
    const comments = result.postsWithComments?.reduce((a: number, p: any) => a + (p.top_comments?.length ?? 0), 0) 
      ?? result.videos?.reduce((a: number, v: any) => a + (v.top_comments?.length ?? 0), 0) ?? 0;
    console.log(`✅ ${name}: ${sources} sources, ${comments} comments, ${ms}ms`);
    
    if (name === 'Reddit' && result.topSubreddits) {
      console.log(`   Subreddits: ${result.topSubreddits.slice(0, 8).join(', ')}`);
    }
    if (name === 'TikTok' && result.topHashtags) {
      console.log(`   Hashtags: ${result.topHashtags.slice(0, 8).join(', ')}`);
      const withTranscripts = result.videos?.filter((v: any) => v.transcript)?.length ?? 0;
      console.log(`   Transcripts: ${withTranscripts}/${result.videos?.length ?? 0}`);
    }
    if (name === 'YouTube' && result.videos) {
      const withTranscripts = result.videos?.filter((v: any) => v.transcript)?.length ?? 0;
      console.log(`   Transcripts: ${withTranscripts}/${result.videos?.length ?? 0}`);
    }
    if (name === 'Quora') {
      const totalAnswers = result.questions?.reduce((a: number, q: any) => a + (q.answers?.length ?? 0), 0) ?? 0;
      console.log(`   Questions: ${result.questions?.length ?? 0}, Answers: ${totalAnswers}`);
    }
    return { ok: true, ms, sources };
  } catch (e: any) {
    const ms = Date.now() - t0;
    console.log(`❌ ${name}: FAILED in ${ms}ms — ${e.message?.slice(0, 200)}`);
    return { ok: false, ms, sources: 0 };
  }
}

async function main() {
  console.log(`\n🔬 Scraper Test Suite: "${query}"\n`);
  console.log('═══ INDIVIDUAL TESTS ═══\n');
  
  const reddit = await testScraper('Reddit', () => gatherRedditData(query, timeRange, volume));
  const tiktok = await testScraper('TikTok', () => gatherTikTokData(query, timeRange, volume));
  const youtube = await testScraper('YouTube', () => gatherYouTubeData(query, timeRange, volume));
  const quora = await testScraper('Quora', () => gatherQuoraData(query, timeRange, volume));
  
  console.log('\n═══ ALL TOGETHER (parallel via gatherPlatformData) ═══\n');
  
  const allT0 = Date.now();
  try {
    const platforms: SearchPlatform[] = ['web', 'reddit', 'youtube', 'tiktok', 'quora'];
    const allResult = await gatherPlatformData(query, platforms, timeRange, volume);
    const allMs = Date.now() - allT0;
    console.log(`✅ All platforms: ${allResult.sources.length} total sources, ${allMs}ms`);
    for (const stat of allResult.platformStats) {
      console.log(`   ${stat.platform}: ${stat.postCount} posts, ${stat.commentCount} comments`);
    }
    if (allResult.serpData) {
      console.log(`   SERP: ${allResult.serpData.webResults?.length ?? 0} web, ${allResult.serpData.videos?.length ?? 0} videos, ${allResult.serpData.discussions?.length ?? 0} discussions`);
    }
    if (allResult.peopleAlsoAsk?.length) {
      console.log(`   People Also Ask: ${allResult.peopleAlsoAsk.length} questions`);
    }
    if (allResult.relatedSearches?.length) {
      console.log(`   Related Searches: ${allResult.relatedSearches.length}`);
    }
  } catch (e: any) {
    const allMs = Date.now() - allT0;
    console.log(`❌ All platforms: FAILED in ${allMs}ms — ${e.message?.slice(0, 200)}`);
  }
  
  console.log('\n═══ SUMMARY ═══\n');
  const results = [
    { name: 'Reddit', ...reddit },
    { name: 'TikTok', ...tiktok },
    { name: 'YouTube', ...youtube },
    { name: 'Quora', ...quora },
  ];
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(10)} ${String(r.sources).padStart(4)} sources  ${String(r.ms).padStart(6)}ms`);
  }
  const totalSeq = results.reduce((a, r) => a + r.ms, 0);
  console.log(`\n   Sequential total: ${totalSeq}ms`);
  console.log(`   (Parallel would be ~${Math.max(...results.map(r => r.ms))}ms)\n`);
}

main().catch(console.error);
