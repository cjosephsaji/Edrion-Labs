import { redirect } from 'next/navigation';

/** Keep the dedicated navigation route while the inbox itself lives in one route module. */
export default function GrievanceInboxPage({ searchParams }: { searchParams: { request?: string } }) {
  const request = searchParams.request ? `&request=${encodeURIComponent(searchParams.request)}` : '';
  redirect(`/approvals?lane=grievance${request}`);
}
