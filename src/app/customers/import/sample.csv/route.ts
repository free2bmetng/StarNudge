import { SAMPLE_CSV } from '@/lib/import-rules';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(SAMPLE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="starnudge-sample.csv"',
    },
  });
}
