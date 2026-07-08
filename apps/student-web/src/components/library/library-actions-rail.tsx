'use client';
import { useRouter } from 'next/navigation';
import {
  useLibraryConceptMap,
  useLibraryFlashcards,
  useLibraryGlossary,
  useLibraryQuiz,
  useLibrarySummarize,
  useLibraryTutor,
} from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

export function LibraryActionsRail({ itemId }: { itemId: string }) {
  const router = useRouter();
  const summarize = useLibrarySummarize(itemId);
  const flashcards = useLibraryFlashcards(itemId);
  const quiz = useLibraryQuiz(itemId);
  const conceptMap = useLibraryConceptMap(itemId);
  const glossary = useLibraryGlossary(itemId);
  const tutor = useLibraryTutor(itemId);

  const busy =
    summarize.isPending ||
    flashcards.isPending ||
    quiz.isPending ||
    conceptMap.isPending ||
    glossary.isPending ||
    tutor.isPending;

  const handleTutor = async () => {
    const result = await tutor.mutateAsync({});
    router.push(`/learn/session/${result.sessionId}`);
  };

  const handleFlashcards = async () => {
    const result = await flashcards.mutateAsync();
    router.push(`/library/decks/${result.deckId}`);
  };

  const handleConceptMap = async () => {
    const result = await conceptMap.mutateAsync();
    router.push(`/library/maps/${result.id}`);
  };

  return (
    <div className="mt-6 grid gap-2 sm:grid-cols-2">
      <PillButton variant="soft" disabled={busy} onClick={() => void summarize.mutateAsync()}>
        {summarize.isPending ? 'Summarizing…' : '✦ Summarize'}
      </PillButton>
      <PillButton variant="soft" disabled={busy} onClick={() => void handleFlashcards()}>
        {flashcards.isPending ? 'Building…' : '✦ Make flashcards'}
      </PillButton>
      <PillButton variant="soft" disabled={busy} onClick={() => void quiz.mutateAsync()}>
        {quiz.isPending ? 'Building…' : '✦ Make a quiz'}
      </PillButton>
      <PillButton variant="soft" disabled={busy} onClick={() => void handleConceptMap()}>
        {conceptMap.isPending ? 'Mapping…' : '✦ Concept map'}
      </PillButton>
      <PillButton variant="soft" disabled={busy} onClick={() => void glossary.mutateAsync()}>
        {glossary.isPending ? 'Extracting…' : '✦ Key-terms glossary'}
      </PillButton>
      <PillButton disabled={busy} onClick={() => void handleTutor()}>
        {tutor.isPending ? 'Starting…' : '✦ Tutor me on this'}
      </PillButton>
    </div>
  );
}
