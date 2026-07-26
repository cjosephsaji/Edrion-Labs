import { PillButton } from '@/components/ui/pill-button';

export function BlockContinue({
  onContinue,
  loading,
}: {
  onContinue: () => void;
  loading?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end border-t border-st-divider pt-5">
      <PillButton onClick={onContinue} disabled={loading}>
        {loading ? 'Saving…' : 'Continue →'}
      </PillButton>
    </div>
  );
}
