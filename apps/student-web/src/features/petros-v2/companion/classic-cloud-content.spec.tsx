import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassicCloudContent } from './classic-cloud-content';

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('Classic explanation formatting', () => {
  it('makes source topic labels scannable without dropping or rewriting the explanation', () => {
    const paragraphs = [
      'Consumer responsibility: In Infrastructure as a Service (IaaS), the consumer manages the guest operating system and installed applications. The provider manages the underlying physical infrastructure.',
      'Virtualization and capacity: Subtract reserved memory from total memory. Available memory is 64 - 16 = 48 GB, and whole-VM capacity is floor(48 / 8) = 6 VM.',
    ];
    const { container } = render(<ClassicCloudContent text={paragraphs.join('\n\n\n')} />);
    expect(screen.getByRole('heading', { name: 'Consumer responsibility:' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Virtualization and capacity:' })).toBeVisible();
    expect(
      Array.from(container.querySelectorAll('section')).map((section) =>
        normalized(section.textContent ?? ''),
      ),
    ).toEqual(paragraphs);
  });

  it('preserves ordinary notices and source markup as text', () => {
    const text =
      'Saved. This hasn’t been checked yet.\n\n<img src=x onerror=alert(1)>\n\nhttps://example.test/source';
    const { container } = render(<ClassicCloudContent text={text} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Saved. This hasn’t been checked yet.')).toBeVisible();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(screen.getByText('https://example.test/source')).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });
});
