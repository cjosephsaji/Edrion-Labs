/** Reveal generated content in the workspace's active scrollport, clear of playback controls. */
export function revealWorkspaceTarget(target: HTMLElement, workspace: HTMLElement, playback: HTMLElement | null, behavior: ScrollBehavior, stickyHeading?: HTMLElement | null) {
  let scrollport: HTMLElement | null = workspace;
  while (scrollport && !(/auto|scroll/.test(window.getComputedStyle(scrollport).overflowY) && scrollport.scrollHeight > scrollport.clientHeight)) {
    scrollport = scrollport.parentElement;
  }
  if (!scrollport) return;

  const bounds = scrollport.getBoundingClientRect(), content = target.getBoundingClientRect();
  const headingBottom = stickyHeading && window.getComputedStyle(stickyHeading).position === 'sticky' ? stickyHeading.getBoundingClientRect().bottom + 8 : 0;
  const top = Math.max(bounds.top + scrollport.clientTop + 10, headingBottom);
  let bottom = bounds.top + scrollport.clientTop + scrollport.clientHeight - 10;
  const controls = playback?.getBoundingClientRect();
  if (controls && controls.top > top && controls.top < bottom && controls.bottom > top) bottom = controls.top - 10;
  if (bottom <= top) return;

  // A tall card starts at its heading; shorter cards move only as far as needed.
  const delta = content.top < top ? content.top - top
    : content.bottom > bottom ? Math.min(content.top - top, content.bottom - bottom) : 0;
  if (Math.abs(delta) > 1) scrollport.scrollTo({ top: Math.max(0, scrollport.scrollTop + delta), behavior });
}
