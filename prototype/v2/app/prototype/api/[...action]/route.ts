import { handleV2 } from '../../../../server/handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(
  r: Request,
  { params }: { params: Promise<{ action: string[] }> },
) {
  return handleV2(r, (await params).action);
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ action: string[] }> },
) {
  return handleV2(r, (await params).action);
}
