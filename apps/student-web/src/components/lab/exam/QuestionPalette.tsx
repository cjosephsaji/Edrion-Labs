'use client';
import { useState } from 'react';
import { Flag, LayoutGrid, X } from 'lucide-react';

export type PaletteItem = {
  index: number;
  sequence: number;
  sectionName?: string;
  answered: boolean;
  flagged: boolean;
};

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-st-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] border border-st-accent bg-st-accentSoft" /> Answered
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] border border-st-bd2 bg-st-card" /> Not yet
      </span>
      <span className="flex items-center gap-1.5">
        <Flag size={11} className="text-st-amberInk" /> Flagged
      </span>
    </div>
  );
}

function Grid({
  items,
  currentIndex,
  onSelect,
}: {
  items: PaletteItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const sections = groupBySection(items);
  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <div key={section.name}>
          {section.name && (
            <p className="mb-2 font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
              {section.name.toUpperCase()}
            </p>
          )}
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-5">
            {section.items.map((item) => {
              const current = item.index === currentIndex;
              const base = current
                ? 'border-st-accent bg-st-accent text-white'
                : item.answered
                  ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                  : 'border-st-bd2 bg-st-card text-st-muted hover:border-st-accent';
              return (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => onSelect(item.index)}
                  aria-current={current}
                  className={`relative flex h-9 items-center justify-center rounded-[9px] border font-mono-ui text-[12px] font-semibold transition ${base}`}
                >
                  {item.sequence}
                  {item.flagged && (
                    <Flag
                      size={9}
                      className="absolute -right-1 -top-1 rounded-full bg-st-amberSoft p-[1px] text-st-amberInk"
                      fill="currentColor"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupBySection(items: PaletteItem[]) {
  const map = new Map<string, PaletteItem[]>();
  for (const item of items) {
    const name = item.sectionName ?? '';
    const arr = map.get(name) ?? [];
    arr.push(item);
    map.set(name, arr);
  }
  return [...map.entries()].map(([name, list]) => ({ name, items: list }));
}

export function QuestionPalette({
  items,
  currentIndex,
  onSelect,
  onFinish,
  answeredCount,
}: {
  items: PaletteItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onFinish?: () => void;
  answeredCount: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const total = items.length;

  const select = (index: number) => {
    onSelect(index);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Desktop side rail */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-4 rounded-[15px] border border-st-bd1 bg-st-card p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
              QUESTIONS
            </p>
            <p className="font-mono-ui text-[11px] text-st-muted">
              {answeredCount}/{total}
            </p>
          </div>
          <div className="mt-3">
            <Grid items={items} currentIndex={currentIndex} onSelect={select} />
          </div>
          <div className="mt-4 border-t border-st-divider pt-3">
            <Legend />
          </div>
          {onFinish && (
            <button
              type="button"
              onClick={onFinish}
              className="mt-4 w-full rounded-full bg-st-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-st-accentDeep"
            >
              Submit exam
            </button>
          )}
        </div>
      </aside>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-5 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-st-ink px-4 py-2.5 text-sm font-semibold text-st-page shadow-lg lg:hidden"
      >
        <LayoutGrid size={15} />
        {answeredCount}/{total}
      </button>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[20px] border-t border-st-bd1 bg-st-page p-5 pb-8 animate-st-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg font-semibold text-st-ink">Questions</p>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full p-1.5 text-st-muted hover:bg-st-surface2"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <Grid items={items} currentIndex={currentIndex} onSelect={select} />
            <div className="mt-4">
              <Legend />
            </div>
            {onFinish && (
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  onFinish();
                }}
                className="mt-5 w-full rounded-full bg-st-accent px-4 py-3 text-sm font-semibold text-white"
              >
                Submit exam
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
