// Test-only structural projection. Ratios are explicit integer thousandths.
import { roundRatio } from './game1-traits.js';






function identifier(value        ) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('structure.invalid_id'); }
function integer(value        , min        , max        ) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('structure.invalid_value'); }
export function deriveAxes(direction           , input                 ) {
  identifier(direction.from_pawn_id); identifier(direction.to_pawn_id);
  if (direction.from_pawn_id === direction.to_pawn_id) throw new Error('structure.self_direction');
  for (const group of [input.resources,input.roles,input.commitments,input.conflicts]) {
    if (!Array.isArray(group) || group.length > 1000) throw new Error('structure.invalid_collection');
    const seen = new Set        ();
    for (const row of group) {
      identifier(row.id); identifier(row.from_pawn_id); identifier(row.to_pawn_id);
      if (row.from_pawn_id === row.to_pawn_id || typeof row.active !== 'boolean' || seen.has(row.id)) throw new Error('structure.invalid_record');
      seen.add(row.id);
    }
  }
  for (const r of input.resources) for (const value of [r.importance_permille,r.contribution_permille,r.irreplaceability_permille]) integer(value,0,1000);
  for (const r of input.roles) { integer(r.importance_permille,1,1000); integer(r.share_permille,0,1000); }
  for (const c of input.commitments) { integer(c.burden,1,1000); if(typeof c.accepted !== 'boolean') throw new Error('structure.invalid_acceptance'); }
  for (const c of input.conflicts) { integer(c.severity,1,1000); identifier(c.scope_id); identifier(c.topic); }
  const matches = (r                              ) => r.active && r.from_pawn_id === direction.from_pawn_id && r.to_pawn_id === direction.to_pawn_id;
  const resources = input.resources.filter(matches), roles = input.roles.filter(matches);
  const sum = Math.min(1_000_000_000,resources.reduce((s,r)=>s+r.importance_permille*r.contribution_permille*r.irreplaceability_permille,0));
  const weight = roles.reduce((s,r)=>s+r.importance_permille,0);
  const weighted = roles.reduce((s,r)=>s+r.importance_permille*r.share_permille,0);
  return {
    dependence:1+roundRatio(sum,999,1_000_000_000),
    power:weight===0 ? 500 : 1+roundRatio(weighted,999,weight*1000),
    obligation:Math.max(1,...input.commitments.filter(c=>matches(c)&&c.accepted).map(c=>c.burden)),
    conflict:Math.max(1,...input.conflicts.filter(matches).map(c=>c.severity)),
    basis_status:weight===0 ? 'no_active_basis' : 'active_basis',
  };
}
// General denial is identical whether or not a private relationship exists.
export function relationshipProjection(request                                                                           , internal                                                                                                                                               ) {
  for(const v of Object.values(request)) identifier(v);
  if(request.requester_id!==request.observer_owner_id) return {visibility:'restricted',scores:null,reason_key:'relationship.restricted',allowed_actions:[]};
  const axes=['affection','trust','respect','reciprocity','dependence','power','obligation','conflict'];
  for(const axis of axes) integer(internal.scores[axis],1,1000);
  if(!['no_active_basis','active_basis'].includes(internal.basis_status)) throw new Error('projection.invalid_basis');
  return { visibility:'own_direction',scores:Object.fromEntries(axes.map(a=>[a,internal.scores[a]])),basis_status:internal.basis_status,
    reason_key:internal.basis_status==='no_active_basis'?'relationship.no_active_basis':'relationship.available',
    memories:internal.memories.filter(m=>m.known===true).map(m=>{identifier(m.id);if(typeof m.reason_known!=='boolean'||!['open','resolved'].includes(m.resolution))throw new Error('projection.invalid_memory');return {id:m.id,knowledge:'known',reason:m.reason_known?'known':'unknown',resolution:m.resolution};}),
    allowed_actions:request.requester_id===request.target_owner_id?['relationship.view_reverse']:[],
  };
}
