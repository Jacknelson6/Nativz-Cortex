import { NextRequest, NextResponse } from 'next/server';
import { checkPostVelocity } from '@/lib/reporting/velocity';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await checkPostVelocity();

    return NextResponse.json({
      message: `Checked ${result.checked} posts, ${result.trending} trending`,
      ...result,
    });
  } catch (error) {
    console.error('GET /api/cron/check-velocity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
