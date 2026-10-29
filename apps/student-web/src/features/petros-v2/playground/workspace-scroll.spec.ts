import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealWorkspaceTarget } from './workspace-scroll';

function rect(top: number, height: number) { return { top, bottom: top + height, height } as DOMRect; }
function scrollport(top: number, height: number) {
  const element = document.createElement('div');
  element.style.overflowY = 'auto';
  Object.defineProperties(element, { clientHeight: { value: height }, scrollHeight: { value: 2000 } });
  element.getBoundingClientRect = () => rect(top, height);
  element.scrollTo = vi.fn();
  return element;
}
function target(top: number, height: number) {
  const element = document.createElement('article');
  element.getBoundingClientRect = () => rect(top, height);
  return element;
}
afterEach(() => { document.body.replaceChildren(); });

describe('generated workspace content', () => {
  it('reveals a new card by scrolling only the inner desktop workspace', () => {
    const outer = scrollport(0, 800), workspace = scrollport(100, 300);
    outer.append(workspace); document.body.append(outer);
    revealWorkspaceTarget(target(520, 100), workspace, null, 'smooth');
    expect(workspace.scrollTo).toHaveBeenCalledWith({ top: 230, behavior: 'smooth' });
    expect(outer.scrollTo).not.toHaveBeenCalled();
  });
  it('leaves already-visible content in place', () => {
    const workspace = scrollport(100, 300); document.body.append(workspace);
    revealWorkspaceTarget(target(150, 100), workspace, null, 'smooth');
    expect(workspace.scrollTo).not.toHaveBeenCalled();
  });
  it('aligns a tall response area at its heading', () => {
    const workspace = scrollport(100, 300); document.body.append(workspace);
    revealWorkspaceTarget(target(800, 600), workspace, null, 'auto');
    expect(workspace.scrollTo).toHaveBeenCalledWith({ top: 690, behavior: 'auto' });
  });
  it('uses the mobile page scrollport and keeps a new reply above sticky playback', () => {
    const main = scrollport(60, 600), workspace = document.createElement('div');
    main.scrollTop = 100; workspace.style.overflowY = 'visible'; main.append(workspace); document.body.append(main);
    const playback = target(470, 180);
    revealWorkspaceTarget(target(530, 50), workspace, playback, 'auto');
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 220, behavior: 'auto' });
  });
  it('can reveal an earlier selected step without overscrolling', () => {
    const workspace = scrollport(100, 300); workspace.scrollTop = 200; document.body.append(workspace);
    revealWorkspaceTarget(target(50, 100), workspace, null, 'smooth');
    expect(workspace.scrollTo).toHaveBeenCalledWith({ top: 140, behavior: 'smooth' });
  });
  it('keeps a generated step below the mobile heading that reserves space for the avatar', () => {
    const main = scrollport(60, 600), workspace = document.createElement('div');
    main.scrollTop = 200; main.append(workspace); document.body.append(main);
    const heading = target(60, 70); heading.style.position = 'sticky';
    revealWorkspaceTarget(target(100, 100), workspace, null, 'auto', heading);
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 162, behavior: 'auto' });
  });
});
