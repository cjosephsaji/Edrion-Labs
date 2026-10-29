import { handleShowcase } from '../../../../../../../prototype/teaching/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET(r: Request, { params }: { params: { action: string[] } }) {
  return handleShowcase(r, params.action);
}
export function POST(r: Request, { params }: { params: { action: string[] } }) {
  return handleShowcase(r, params.action);
}
