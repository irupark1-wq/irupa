// Software rendering of actual 3D box geometry; sprites remain 2D billboards.
// A technical art-direction study, not a production 3D engine or final artwork.
export async function renderSpaceComparison(canvas,state,paint,image){
 const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.fillStyle='#f2ebdf';c.fillRect(0,0,canvas.width,canvas.height);
 const project=([x,y,z])=>[450+(x-z)*31,125+(x+z)*17-y*38];
 const faces=[];
 function polygon(points,color){faces.push({points,color,depth:points.reduce((sum,p)=>sum+p[0]+p[2],0)/points.length});}
 function box(x,z,w,d,h,color){const a=[x,0,z],b=[x+w,0,z],e=[x,0,z+d],f=[x+w,0,z+d],A=[x,h,z],B=[x+w,h,z],E=[x,h,z+d],F=[x+w,h,z+d];polygon([A,B,F,E],color);polygon([b,f,F,B],'#b4916e');polygon([e,f,F,E],'#cfae86');}
 polygon([[0,0,0],[12,0,0],[12,0,8],[0,0,8]],'#e3c69b');
 // Rear walls have geometry and height. Front walls are omitted for readable sprites.
 polygon([[0,0,0],[12,0,0],[12,4,0],[0,4,0]],'#e9dbbf');polygon([[0,0,0],[0,0,8],[0,4,8],[0,4,0]],'#f6e8cd');
 for(const p of state.life.places)box(p.x,p.y,1.2,1,p.kind==='rest'?1:1.6,({rest:'#b5c3b3',work:'#c6a079',social:'#ecd1a8'})[p.kind]);
 for(const p of state.life.walls)box(p.x,p.y,.9,.9,2.2,'#958b79');
 faces.sort((a,b)=>a.depth-b.depth);
 for(const face of faces){c.beginPath();face.points.forEach((p,i)=>{const q=project(p);i?c.lineTo(...q):c.moveTo(...q);});c.closePath();c.fillStyle=face.color;c.fill();c.strokeStyle='#a1896c';c.lineWidth=1;c.stroke();}
 // Same original 6-slot artwork; no flattening or rewrite of pawn originals.
 for(const p of state.pawns.slice().sort((a,b)=>{const x=state.life.actors[a.id],y=state.life.actors[b.id];return (x?.x||0)+(x?.y||0)-(y?.x||0)-(y?.y||0);})){const a=state.life.actors[p.id]||{x:3,y:5},at=project([a.x+.5,0,a.y+.5]),sprite=document.createElement('canvas');sprite.width=sprite.height=96;const imgs={};for(const slot of Object.keys(p.appearance.layers))imgs[slot]=await image(p.appearance.layers[slot]);paint(sprite,imgs,p.appearance.transforms);c.drawImage(sprite,at[0]-48,at[1]-80,96,96);c.fillStyle='#5d4e40';c.font='12px sans-serif';c.textAlign='center';c.fillText(p.name,at[0],at[1]+21);}
 c.textAlign='left';c.font='bold 18px sans-serif';c.fillStyle='#6b5845';c.fillText('3D 기하 공간 + 원형 2D 폰 · 기술 비교',24,32);c.font='12px sans-serif';c.fillText('소프트웨어 투영 / 깊이 순서 / 같은 6슬롯 원본',24,54);
}
