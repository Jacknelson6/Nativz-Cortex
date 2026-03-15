// scripts/backfill-idea-bullets.ts
// Uses AI to regenerate clean why_it_works bullets for existing idea generations
//
// Usage: npx tsx scripts/backfill-idea-bullets.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Idea {
  title: string;
  why_it_works: string | string[];
  content_pillar: string;
  [key: string]: unknown;
}

async function generateBullets(ideas: Idea[]): Promise<Idea[]> {
  const prompt = ideas.map((idea, i) => {
    const rawWhy = Array.isArray(idea.why_it_works)
      ? idea.why_it_works.join(' ')
      : idea.why_it_works;
    return `${i + 1}. Title: "${idea.title}" | Pillar: ${idea.content_pillar} | Context: ${rawWhy}`;
  }).join('\n');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'system',
          content: `You rewrite video idea explanations into exactly 3-4 punchy bullet points per idea. Each bullet must be under 12 words — like a list of pros. No periods at the end. Output a JSON array of arrays of strings. Example: [["Taps into trending conversation","Creates urgency with timely angle","Listicle format drives watch time"],["...","...","..."]]`,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4000,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '[]';

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in response');

  const bulletsArr: string[][] = JSON.parse(jsonMatch[0]);
  return ideas.map((idea, i) => ({
    ...idea,
    why_it_works: bulletsArr[i] ?? ['Great content opportunity', 'Strong audience appeal', 'Timely and relevant'],
  }));
}

async function main() {
  console.log('Fetching completed idea generations...');

  const { data: generations, error } = await supabase
    .from('idea_generations')
    .select('id, ideas, count')
    .eq('status', 'completed')
    .not('ideas', 'is', null);

  if (error) {
    console.error('Error fetching generations:', error);
    process.exit(1);
  }

  console.log(`Found ${generations?.length ?? 0} generations to process`);

  let updated = 0;

  for (const gen of generations ?? []) {
    const ideas = gen.ideas as Idea[];
    if (!Array.isArray(ideas) || ideas.length === 0) continue;

    console.log(`\nProcessing ${gen.id} (${ideas.length} ideas)...`);

    try {
      // Process in batches of 10 to stay within token limits
      const batchSize = 10;
      const updatedIdeas: Idea[] = [];

      for (let i = 0; i < ideas.length; i += batchSize) {
        const batch = ideas.slice(i, i + batchSize);
        const result = await generateBullets(batch);
        updatedIdeas.push(...result);
      }

      const { error: updateError } = await supabase
        .from('idea_generations')
        .update({ ideas: updatedIdeas })
        .eq('id', gen.id);

      if (updateError) {
        console.error(`  ✗ Failed to update: ${updateError.message}`);
      } else {
        updated++;
        // Show samples
        for (const idea of updatedIdeas.slice(0, 3)) {
          console.log(`  ✓ "${idea.title}"`);
          (idea.why_it_works as string[]).forEach((b) => console.log(`    • ${b}`));
        }
        if (updatedIdeas.length > 3) console.log(`  ... and ${updatedIdeas.length - 3} more`);
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone: ${updated} generations updated`);
}

main();
