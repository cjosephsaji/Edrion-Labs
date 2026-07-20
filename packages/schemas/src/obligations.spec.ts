import { describe, expect, it } from 'vitest';
import { compareObligations, mergeObligations, normalizeObligationKind, obligationSchema, type Obligation } from './obligations';

const row=(patch:Partial<Obligation>={}):Obligation=>({id:'self:x',origin:'self',kind:'custom',title:'Task',due_at:'2026-07-21T10:00:00.000Z',all_day:false,status:'pending',action:{label:'Open',deep_link:'/calendar'},source_module:'learn',updated_at:'2026-07-20T10:00:00.000Z',...patch});

describe('obligation contract',()=>{
  it('rejects a provider row without due_at or action',()=>{expect(()=>obligationSchema.parse({...row(),due_at:undefined})).toThrow();expect(()=>obligationSchema.parse({...row(),action:undefined})).toThrow();});
  it('sorts institution before self at the same deadline',()=>{const rows=[row({id:'self'}),row({id:'institution',origin:'institution'})].sort(compareObligations);expect(rows.map(r=>r.id)).toEqual(['institution','self']);});
  it('uses kind priority and a lexical final tiebreak',()=>{const rows=[row({id:'z'}),row({id:'fee',kind:'fee_installment'}),row({id:'a'})].sort(compareObligations);expect(rows.map(r=>r.id)).toEqual(['fee','a','z']);});
  it('maps unknown provider kinds to the custom fallback',()=>expect(normalizeObligationKind('future_kind')).toBe('custom'));
  it('dedupes by stable id with the latest update winning',()=>{const rows=mergeObligations([row({title:'old'}),row({title:'new',updated_at:'2026-07-20T11:00:00.000Z'})]);expect(rows).toHaveLength(1);expect(rows[0]!.title).toBe('new');});
  it('suppresses a same-day plan review when the live synthetic queue exists',()=>{const rows=mergeObligations([row({id:'self:uo:plan',kind:'review_queue'}),row({id:'self:review_queue:2026-07-21',kind:'review_queue'})]);expect(rows.map(r=>r.id)).toEqual(['self:review_queue:2026-07-21']);});
});
