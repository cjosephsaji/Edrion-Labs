import { describe, expect, it } from 'vitest';
import { fittedDiagramView, routeDiagram, segmentHitsRect, NODE_WIDTH as W, NODE_HEIGHT as H, LABEL_WIDTH as LW, LABEL_HEIGHT as LH, type RoutingNode, type RoutingEdge } from './diagram-routing';
const nodes: RoutingNode[] = [{ id: 'left', x: 150, y: 230 }, { id: 'middle', x: 490, y: 230 }, { id: 'right', x: 850, y: 230 }];
const edges: RoutingEdge[] = ['provides', 'supports', 'connects'].map(id => ({ id, from: 'left', to: 'right' }));
edges.push({ id: 'reverse', from: 'right', to: 'left' });
function verify(ns: RoutingNode[], es: RoutingEdge[]) {
  const routes=routeDiagram(ns,es); expect(routes.size).toBe(es.length);
  for(const e of es) { const r=routes.get(e.id)!; expect(r.path).not.toMatch(/NaN|Infinity/);
    for(let i=1;i<r.points.length;i++) { const a=r.points[i-1]!,b=r.points[i]!; expect(a.x===b.x || a.y===b.y).toBe(true);
      for(const n of ns) expect(segmentHitsRect(a,b,{x:n.x-W/2,y:n.y-H/2,width:W,height:H}),`${e.id} crosses ${n.id}`).toBe(false); }
    for(const n of ns) expect(r.label.x+LW<=n.x-W/2 || r.label.x>=n.x+W/2 || r.label.y+LH<=n.y-H/2 || r.label.y>=n.y+H/2,`${e.id} label overlaps ${n.id}`).toBe(true);
  } return routes;
}
describe('orthogonal routes and meaningful content bounds',()=>{
  it('separates parallel and reverse routes around intermediate nodes using both corridors',()=>{
    const routes=verify(nodes,edges),points=[...routes.values()].flatMap(r=>r.points);
    expect(Math.min(...points.map(p=>p.y))).toBeLessThan(230-H/2); expect(Math.max(...points.map(p=>p.y))).toBeGreaterThan(230+H/2);
    expect(new Set([...routes.values()].map(r=>r.path)).size).toBe(4); const reverse=routes.get('reverse')!; expect(reverse.points[0]!.x).toBeGreaterThan(reverse.points.at(-1)!.x);
    for(const [id,r] of routes) for(const [oid,o] of routes) if(id!==oid) for(let i=1;i<r.points.length;i++) for(let j=1;j<o.points.length;j++) {
      const a=r.points[i-1]!,b=r.points[i]!,c=o.points[j-1]!,d=o.points[j]!;
      const same=a.y===b.y && c.y===d.y && a.y===c.y || a.x===b.x && c.x===d.x && a.x===c.x;
      if(same) { const h=a.y===b.y,overlap=h?Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)):Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)); expect(overlap,`${id} overlaps ${oid}`).toBeLessThanOrEqual(0); }
    }
  });
  it('reroutes moved nodes and handles vertical and seven-node layouts',()=>{
    const moved=nodes.map(n=>n.id==='middle'?{...n,y:110}:n); expect(verify(moved,edges).get('provides')!.path).not.toBe(routeDiagram(nodes,edges).get('provides')!.path);
    verify(nodes.map(n=>({...n,x:n.y,y:n.x})),edges);
    verify([...nodes,{id:'ua',x:320,y:70},{id:'ub',x:680,y:70},{id:'la',x:320,y:430},{id:'lb',x:680,y:430}],[...edges,{id:'ca',from:'ua',to:'lb'},{id:'cb',from:'la',to:'ub'},{id:'side',from:'ua',to:'ub'}]);
  });
  it('honors dragged ports without hiding labels behind other paths',()=>{
    const preferences=new Map([['provides',{from:'top' as const,to:'left' as const}],['supports',{from:'bottom' as const,to:'left' as const}],['connects',{from:'left' as const,to:'left' as const}],['reverse',{from:'top' as const,to:'right' as const}]]);
    const routes=routeDiagram(nodes,edges,preferences);
    for(const e of edges) { const route=routes.get(e.id)!,pref=preferences.get(e.id)!;expect(route.fromPort).toBe(pref.from);expect(route.toPort).toBe(pref.to);
      for(const other of routes.values()) for(let i=1;i<other.points.length;i++) expect(segmentHitsRect(other.points[i-1]!,other.points[i]!,{...route.label,width:LW,height:LH}),`${e.id} label crossed by another connector`).toBe(false);
    }
  });
  it('fits every node, label and path while capping single-node zoom',()=>{
    const routes=verify(nodes,edges),v=fittedDiagramView(nodes,[...routes.values()],{width:720,height:440});
    for(const r of routes.values()) for(const p of [...r.points,r.label,{x:r.label.x+LW,y:r.label.y+LH}]) expect(p.x>=v.x && p.x<=v.x+v.width && p.y>=v.y && p.y<=v.y+v.height).toBe(true);
    const single=fittedDiagramView([nodes[0]!],[],{width:900,height:550}); expect(900/single.width).toBeLessThanOrEqual(1.45); expect(900/single.width).toBeGreaterThan(1);
  });
});
