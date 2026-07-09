'use client';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useUploadLibraryItem } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

export function LibraryUploadButton({
  className,
  label = 'Upload',
  capture,
}: {
  className?: string;
  label?: string;
  capture?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadLibraryItem();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={capture ? 'image/*' : 'image/*,.pdf,.doc,.docx,application/pdf'}
        capture={capture ? 'environment' : undefined}
        multiple={!capture}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            void upload.mutateAsync(files).then((result) => {
              if (result?.item?.id) router.push(`/library/${result.item.id}`);
            });
          }
          e.target.value = '';
        }}
      />
      <PillButton
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Upload size={16} />
        {upload.isPending ? 'Uploading…' : label}
      </PillButton>
    </>
  );
}
