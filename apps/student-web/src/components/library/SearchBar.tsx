'use client';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search your library…',
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(value), [value]);

  return (
    <label className="relative mt-4 block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-st-faint" />
      <input
        type="search"
        value={local}
        placeholder={placeholder}
        aria-label="Search library"
        className="min-h-[44px] w-full rounded-[12px] border border-st-bd1 bg-st-card pl-10 pr-3 text-sm text-st-ink placeholder:text-st-faint focus:border-st-accent focus:outline-none"
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(next), 280);
        }}
      />
    </label>
  );
}
