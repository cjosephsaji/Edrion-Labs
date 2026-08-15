import { SearchX } from 'lucide-react';
import { ActionLink, EmptyState } from '@/components/design-system';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1120px] place-items-center px-4 py-12">
      <div className="w-full">
        <EmptyState
          icon={SearchX}
          title="This page isn’t here"
          description="The link may be out of date, or this section may no longer be available to your account."
          action={<ActionLink href="/home">Back to portal</ActionLink>}
        />
      </div>
    </main>
  );
}
