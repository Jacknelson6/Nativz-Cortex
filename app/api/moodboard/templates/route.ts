import { NextResponse } from 'next/server';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  notes: Array<{
    content: string;
    color: string;
    position_x: number;
    position_y: number;
  }>;
}

const templates: BoardTemplate[] = [
  {
    id: 'competitor-analysis',
    name: 'Competitor Analysis',
    description: 'Compare competitors side by side with key takeaways',
    notes: [
      { content: 'Competitor 1', color: 'blue', position_x: 0, position_y: 0 },
      { content: 'Competitor 2', color: 'green', position_x: 400, position_y: 0 },
      { content: 'Key Takeaways', color: 'yellow', position_x: 200, position_y: 400 },
    ],
  },
  {
    id: 'content-inspiration',
    name: 'Content Inspiration',
    description: 'Organize hooks, formats, sounds, and videos to replicate',
    notes: [
      { content: 'Hooks That Work', color: 'purple', position_x: 0, position_y: 0 },
      { content: 'Trending Formats', color: 'pink', position_x: 400, position_y: 0 },
      { content: 'Music/Sounds', color: 'blue', position_x: 0, position_y: 300 },
      { content: 'Replicate These', color: 'green', position_x: 400, position_y: 300 },
    ],
  },
  {
    id: 'campaign-planning',
    name: 'Campaign Planning',
    description: 'Plan a campaign from brief to final concepts',
    notes: [
      { content: 'Brief', color: 'yellow', position_x: 0, position_y: 0 },
      { content: 'References', color: 'blue', position_x: 400, position_y: 0 },
      { content: 'Shot List', color: 'green', position_x: 0, position_y: 300 },
      { content: 'Final Concepts', color: 'purple', position_x: 400, position_y: 300 },
    ],
  },
];

export async function GET() {
  return NextResponse.json(templates);
}
