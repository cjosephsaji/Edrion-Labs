import { redirect } from 'next/navigation';

export default function LegacyPracticeBlockPage({ params }: { params: { id: string } }) {
  redirect(`/learn/session/${params.id}`);
}
