// v0.1 A test thresholds. Private inputs; expose tags only through a separate projection.


export const BASIC_TAGS = ['comfortable_friend','trusted_colleague','friendly_rival','disliked_respected','unwanted_partner','love_hate','hostile_pair','disappointed_friend']         ;
export const TAG_LABELS = ['편안한 친구','신뢰하는 동료','선의의 라이벌','싫지만 인정하는 상대','원치 않는 동업','애증','혐관','서운한 친구']         ;
function conditions(c           ) {
 for(const scores of [c.a,c.b])for(const name of ['affection','trust','respect','reciprocity','dependence','obligation','conflict']         )if(!Number.isSafeInteger(scores[name])||scores[name]<1||scores[name]>1000)throw Error('tags.invalid_scores');
 for(const name of ['role','competition','major_betrayal','hostile','reverse_hostile','attachment','wound','repeat_reason','friend_history','related_conflict','blocked']         )if(typeof c[name]!=='boolean')throw Error('tags.invalid_context');
 const a=c.a,b=c.b;
 const mutualLow=Math.min(a.affection,b.affection),trustLow=Math.min(a.trust,b.trust),conflictHigh=Math.max(a.conflict,b.conflict);
 return [
  [mutualLow>=600&&trustLow>=600&&conflictHigh<=300,mutualLow<500||trustLow<500||conflictHigh>450],
  [c.role&&a.trust>=650&&a.reciprocity>=550,a.trust<550||a.reciprocity<450],
  [c.competition&&Math.min(a.respect,b.respect)>=650&&!c.major_betrayal,Math.min(a.respect,b.respect)<550],
  [a.affection<=300&&a.respect>=700&&c.hostile,a.affection>400||a.respect<600||!c.hostile],
  [c.role&&a.affection<=300&&a.dependence>=650&&a.obligation>=500,a.affection>400||a.dependence<550||a.obligation<400],
  [a.affection>=650&&a.conflict>=650&&c.attachment&&c.wound,a.affection<550||a.conflict<500||!c.wound],
  [Math.max(a.affection,b.affection)<=300&&Math.min(a.conflict,b.conflict)>=650&&c.hostile&&c.reverse_hostile&&c.repeat_reason,Math.max(a.affection,b.affection)>400||Math.min(a.conflict,b.conflict)<500],
  [c.friend_history&&a.affection>=500&&a.reciprocity<=350&&c.related_conflict,(a.reciprocity>450&&!c.related_conflict)||a.affection<400],
 ];
}
export function evaluateBasicTags(history                                                                           ,current           ) {
 conditions(current);
 if(!Array.isArray(history)||history.length>10000)throw Error('tags.invalid_history');
 const ids=new Set        (),ticks=new Set        (),active=BASIC_TAGS.map(()=>false),enter=BASIC_TAGS.map(()=>0),exit=BASIC_TAGS.map(()=>0),evidence          =[];
 let positive=0;
 for(const row of history){
  if(typeof row.source_event_id!=='string'||!Number.isSafeInteger(row.tick)||typeof row.positive!=='boolean')throw Error('tags.invalid_evidence');
  if(ids.has(row.source_event_id)||ticks.has(row.tick))continue;
  ids.add(row.source_event_id);ticks.add(row.tick);if(row.positive)positive++;
  conditions(row.context).forEach(([yes,no],i)=>{
   const immediate=row.context.blocked||((i===1||i===4)&&!row.context.role)||(i===2&&!row.context.competition)||(i===6&&!row.context.repeat_reason);
   if(immediate){active[i]=false;enter[i]=0;exit[i]=0;}
   else if(!active[i]){enter[i]=yes?enter[i]+1:0;if(enter[i]>=2&&(i!==0||positive>=3)){active[i]=true;exit[i]=0;}}
   else {exit[i]=no?exit[i]+1:0;if(exit[i]>=2){active[i]=false;enter[i]=0;}}
   evidence.push({source_event_id:row.source_event_id,tag_id:BASIC_TAGS[i],enter_count:enter[i],exit_count:exit[i],active:active[i]});
  });
 }
 const immediate=(i       )=>current.blocked||((i===1||i===4)&&!current.role)||(i===2&&!current.competition)||(i===6&&!current.repeat_reason);
 return {namespace:'v01_original',definition_version:'game1-tags-v01-a',positive_event_count:positive,source_count:ids.size,
  tags:BASIC_TAGS.filter((_,i)=>active[i]&&!immediate(i)).map(tag_id=>({tag_id,label:TAG_LABELS[BASIC_TAGS.indexOf(tag_id)]})),evidence};
}
