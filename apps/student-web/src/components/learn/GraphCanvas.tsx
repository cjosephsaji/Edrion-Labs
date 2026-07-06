import type { SvgElement } from '@edrion/schemas';

function SvgNode({ el }: { el: SvgElement }) {
  const { type, children, text, ...rest } = el;
  const props = rest as Record<string, string | number | undefined>;

  if (type === 'text') {
    return <text {...props}>{text}</text>;
  }
  if (type === 'group') {
    return (
      <g transform={props.transform as string | undefined}>
        {children?.map((child, i) => <SvgNode key={i} el={child} />)}
      </g>
    );
  }
  const Tag = type as 'rect' | 'circle' | 'line' | 'path';
  return <Tag {...props} />;
}

export function GraphCanvas({ viewBox, elements }: { viewBox: string; elements: SvgElement[] }) {
  return (
    <svg viewBox={viewBox} className="h-auto w-full max-h-64 rounded-xl bg-st-surface2" role="img">
      {elements.map((el, i) => (
        <SvgNode key={i} el={el} />
      ))}
    </svg>
  );
}
