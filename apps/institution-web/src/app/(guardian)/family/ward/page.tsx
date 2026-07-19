'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/guardian/hooks';
import { Skeleton } from '@/components/guardian/ui';

export default function WardIndex() {
  const { data } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (data?.children[0]) router.replace(`/family/child/${data.children[0].studentId}`);
  }, [data, router]);
  return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}
