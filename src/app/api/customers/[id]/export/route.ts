import { currentSession } from '@/lib/auth';
import { exportCustomer } from '@/lib/services/customers';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await currentSession();
  if (!s) return Response.json({ error: 'Log in first.' }, { status: 401 });
  const { id } = await params;
  const data = await exportCustomer(s.businessId, id);
  if (!data) return Response.json({ error: 'Customer not found.' }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="customer-${id}.json"`,
    },
  });
}
