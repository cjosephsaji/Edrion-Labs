import { redirect } from 'next/navigation';

export default function LegacyConceptBlockPage({ params }: { params: { id: string } }) {
  redirect(`/learn/session/${params.id}`);
}
