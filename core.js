
const afsCore=(()=>{
 const assets=[{"name": "주황", "file": "Union.svg", "d": "M46.1341 21.3851C47.3057 22.5566 47.3057 24.4561 46.1341 25.6277L44.7195 27.0423C43.5479 28.2139 41.6484 28.2139 40.4769 27.0423L32.8787 19.4441C30.9888 17.5542 27.7574 18.8927 27.7574 21.5654V137.757C27.7574 139.414 26.4142 140.757 24.7574 140.757H22.7574C21.1005 140.757 19.7574 139.414 19.7574 137.757V21.0635C19.7574 18.3908 16.5259 17.0523 14.636 18.9422L6.53591 27.0423C5.36434 28.2139 3.46484 28.2139 2.29327 27.0423L0.878679 25.6277C-0.292894 24.4561 -0.292892 22.5566 0.878681 21.3851L21.3851 0.87868C22.5566 -0.292893 24.4561 -0.292894 25.6277 0.878679L46.1341 21.3851Z", "hex": "#FF8C00", "opacity": 0.7}, {"name": "파랑", "file": "Union-1.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#0099FF", "opacity": 0.7}, {"name": "적갈", "file": "Union-2.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#750E10", "opacity": 0.7}, {"name": "초록", "file": "Union-3.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#508D47", "opacity": 0.7}, {"name": "보라", "file": "Union-4.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#C800FF", "opacity": 0.7}, {"name": "베이지", "file": "Union-5.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#A98F6F", "opacity": 0.7}, {"name": "분홍", "file": "Union-6.svg", "d": "M46.133 21.385C47.3045 22.5566 47.3045 24.4561 46.133 25.6276L44.7193 27.0413C43.5477 28.2128 41.6482 28.2128 40.4767 27.0413L32.8785 19.4431C30.9886 17.5532 27.7572 18.8917 27.7572 21.5644L27.7572 137.757C27.7572 139.414 26.414 140.757 24.7572 140.757H22.7572C21.1003 140.757 19.7572 139.414 19.7572 137.757L19.7572 21.0625C19.7572 18.3897 16.5257 17.0512 14.6359 18.9411L6.53554 27.0415C5.36404 28.213 3.46468 28.213 2.29308 27.0416L0.878863 25.6277C-0.292882 24.4561 -0.292965 22.5565 0.878679 21.3848L21.3848 0.878681C22.5564 -0.292908 24.456 -0.292892 25.6275 0.87872L46.133 21.385Z", "hex": "#FF0095", "opacity": 0.7}];
 const settings={low:{area:.03,saturation:.18},normal:{area:.015,saturation:.13},high:{area:.002,saturation:.08}};
 function family(r,g,b,minS=.13){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,s=max?delta/max:0;
  if(max<12||delta<5||s<minS)return -1;
  let hue=max===r?60*((g-b)/delta%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);hue=(hue+360)%360;
  if(hue>=12&&hue<65&&s<=.48)return 5;
  if(hue<12||hue>=355)return 2;
  if(hue<65)return 0;
  if(hue<175)return 3;
  if(hue<255)return 1;
  if(hue<295)return 4;
  return 6;
 }
 function analyze(data,w,h,sensitivity='low'){
  const cfg=settings[sensitivity]||settings.normal,total=w*h,labels=new Int8Array(total).fill(-1),count=Array(7).fill(0),sumX=Array(7).fill(0),sumY=Array(7).fill(0);
  for(let i=0;i<total;i++){if(data[i*4+3]<128)continue;labels[i]=family(data[i*4],data[i*4+1],data[i*4+2],cfg.saturation);}
  const visited=new Uint8Array(total),largest=Array(7).fill(0),queue=new Int32Array(total),minComponent=Math.max(3,Math.round(total*.000035));
  for(let i=0;i<total;i++){if(labels[i]<0||visited[i])continue;let head=0,tail=1;queue[0]=i;visited[i]=1;const c=labels[i];while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);const near=[];if(x>0)near.push(p-1);if(x<w-1)near.push(p+1);if(y>0)near.push(p-w);if(y<h-1)near.push(p+w);for(const q of near){if(!visited[q]&&labels[q]===c){visited[q]=1;queue[tail++]=q;}}}if(tail<minComponent)continue;largest[c]=Math.max(largest[c],tail);count[c]+=tail;for(let j=0;j<tail;j++){sumX[c]+=(queue[j]%w+.5)/w;sumY[c]+=(Math.floor(queue[j]/w)+.5)/h;}}
  const stats=assets.map((a,i)=>({i,...a,coverage:count[i]/total,blob:largest[i]/total,cx:count[i]?sumX[i]/count[i]:.5,cy:count[i]?sumY[i]/count[i]:.5}));
  let active=stats.filter(s=>s.coverage>=cfg.area),fallback=false;
  if(!active.length){const strongest=[...stats].sort((a,b)=>b.coverage-a.coverage||a.i-b.i)[0];if(strongest.coverage>0){fallback='weak';active=[strongest];}else{fallback='neutral';active=[{...stats[0],cx:.5,cy:.2}];}}
  const structure=analyzeStructure(data,w,h);
  const taken=new Set();active=[...active].sort((a,b)=>b.coverage-a.coverage||a.i-b.i).map(s=>{let angle=Math.atan2(s.cy-.5,s.cx-.5);if(Math.hypot(s.cx-.5,s.cy-.5)<.05)angle=-Math.PI/2;const preferred=(Math.round((angle+Math.PI/2)/(Math.PI/4))+8)%8;const candidates=[0,1,-1,2,-2,3,-3,4].map(delta=>({dir:(preferred+delta+8)%8,distance:Math.abs(delta)})).filter(c=>!taken.has(c.dir));
   for(const c of candidates){const m=pathMetrics(routes[c.dir]);c.score=c.distance*.4+Math.abs(m.diag-structure.diagonalRatio)*.7+Math.abs(m.right/2-structure.complexity)*.45;}
   candidates.sort((a,b)=>a.score-b.score);const dir=candidates[0].dir;taken.add(dir);return{...s,dir,preferred};}).sort((a,b)=>a.i-b.i);
  return{stats,active,fallback,threshold:cfg.area,structure};
 }
 function analyzeStructure(data,w,h){
  const n=w*h,gray=new Float32Array(n),blur=new Float32Array(n),gx=new Float32Array(n),gy=new Float32Array(n),response=new Float32Array(n);
  for(let p=0;p<n;p++)gray[p]=(.2126*data[p*4]+.7152*data[p*4+1]+.0722*data[p*4+2])/255;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;blur[p]=(gray[p-w-1]+2*gray[p-w]+gray[p-w+1]+2*gray[p-1]+4*gray[p]+2*gray[p+1]+gray[p+w-1]+2*gray[p+w]+gray[p+w+1])/16;}
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const p=y*w+x;gx[p]=(-blur[p-w-1]+blur[p-w+1]-2*blur[p-1]+2*blur[p+1]-blur[p+w-1]+blur[p+w+1])/8;gy[p]=(-blur[p-w-1]-2*blur[p-w]-blur[p-w+1]+blur[p+w-1]+2*blur[p+w]+blur[p+w+1])/8;}
  let edges=0,diagonalWeight=0,lineWeight=0,horizontal=0,vertical=0;
  for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
   const p=y*w+x;let a=0,b=0,c=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=p+dy*w+dx;a+=gx[q]*gx[q];b+=gy[q]*gy[q];c+=gx[q]*gy[q];}
   const trace=a+b,disc=Math.hypot(a-b,2*c),coherence=trace?disc/trace:0;
   response[p]=(trace-disc)/2;
   const mag=Math.hypot(gx[p],gy[p]);if(mag<.045)continue;edges++;
   if(coherence<.7)continue;
   const tangent=(Math.atan2(gy[p],gx[p])+Math.PI/2+Math.PI)%Math.PI,bin=Math.round(tangent/(Math.PI/4))%4,weight=mag*coherence;
   lineWeight+=weight;if(bin%2)diagonalWeight+=weight;horizontal+=weight*Math.cos(tangent)**2;vertical+=weight*Math.sin(tangent)**2;
  }
  const candidates=[];for(let y=4;y<h-4;y++)for(let x=4;x<w-4;x++){const p=y*w+x;if(response[p]>.0012)candidates.push(p);}
  candidates.sort((a,b)=>response[b]-response[a]||a-b);
  const blocked=new Uint8Array(n);let corners=0;for(const p of candidates){if(blocked[p])continue;corners++;const x=p%w,y=Math.floor(p/w);for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)blocked[yy*w+xx]=1;}}
  const diagonalRatio=lineWeight?diagonalWeight/lineWeight:0,edgeDensity=edges/n;
  const complexity=.65*Math.min(corners/64,1)+.35*Math.min(edgeDensity/.15,1);
  const k=complexity<.38?0:complexity<.65?1:2,d=diagonalRatio<.18?0:diagonalRatio<.5?1:2;
  const dir=horizontal>vertical*1.15&&horizontal>.05?2:0;
  return{corners,edgeDensity,diagonalRatio,complexity,k,d,dir};
 }
 function scene(ctx,name){
  ctx.clearRect(0,0,420,300);ctx.fillStyle='#eeeeee';ctx.fillRect(0,0,420,300);
  ctx.strokeStyle='#b7b7b7';ctx.lineWidth=2;
  const line=(points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  if(['simple','slanted','busy','seven'].includes(name)){
   const colors=['#FF6600','#FF3399','#00DD44','#2255FF'];
   if(name==='simple')colors.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(60+i*80,65,35,170);});
   if(name==='slanted')colors.forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(15+i*70,250);ctx.lineTo(50+i*70,250);ctx.lineTo(185+i*70,50);ctx.lineTo(150+i*70,50);ctx.closePath();ctx.fill();});
   if(name==='busy'||name==='seven')for(let y=0;y<6;y++)for(let x=0;x<8;x++){ctx.fillStyle=name==='seven'?assets[(y*8+x)%7].hex:colors[(x+y)%4];ctx.fillRect(26+x*47,26+y*43,28,23);}
  }else if(name==='vivid'){
   ['#FF6600','#FF3399','#00DD44','#2255FF'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(55+85*i,110,40,40);});
  }else if(name==='corridor'){
   ctx.fillStyle='#dddddd';ctx.beginPath();ctx.moveTo(0,300);ctx.lineTo(160,160);ctx.lineTo(270,160);ctx.lineTo(420,300);ctx.fill();line([[0,0],[160,65],[270,65],[420,0]]);line([[160,65],[160,160],[0,300]]);line([[270,65],[270,160],[420,300]]);
   ctx.fillStyle=assets[1].hex;ctx.fillRect(32,55,85,164);ctx.fillStyle='#efefef';ctx.fillRect(99,132,9,4);line([[310,77],[383,44],[383,220],[310,177],[310,77]]);
  }else if(name==='studio'){
   ctx.fillStyle='#d5d5d5';ctx.fillRect(0,230,420,70);ctx.fillStyle=assets[1].hex;ctx.fillRect(30,35,112,115);ctx.strokeStyle='#eeeeee';ctx.lineWidth=5;line([[86,35],[86,150]]);line([[30,90],[142,90]]);
   ctx.strokeStyle='#777777';ctx.lineWidth=4;line([[199,247],[236,46],[282,249]]);ctx.fillStyle=assets[0].hex;ctx.fillRect(178,66,112,112);
   ctx.fillStyle=assets[3].hex;ctx.fillRect(315,175,79,77);ctx.fillStyle='#ababab';ctx.fillRect(287,153,120,14);ctx.fillRect(297,165,7,90);ctx.fillRect(391,165,7,90);
  }else{
   ctx.fillStyle='#d8d8d8';ctx.fillRect(15,20,390,260);
   const rects=[[32,35,105,85],[155,35,105,85],[278,35,105,85],[32,150,75,100],[124,150,75,100],[216,150,75,100],[308,150,75,100]];
   rects.forEach(([x,y,w,h],i)=>{ctx.fillStyle=assets[i].hex;ctx.fillRect(x,y,w,h);ctx.fillStyle='#e8e8e8';ctx.fillRect(x+w/2-7,y-3,14,6);});
  }
 }
 const routes=[[[150,200],[210,200],[210,60]],[[150,200],[210,200],[210,140],[280,70]],[[150,200],[350,200]],[[150,200],[210,200],[270,260]],[[150,200],[210,200],[210,300]],[[150,200],[210,200],[210,230],[150,290]],[[150,200],[210,200],[210,140],[80,140]],[[150,200],[210,200],[210,140],[140,70]]];
 function buildRoutes(result){
  return result.active.map(a=>({...a,points:routes[a.dir].map(p=>[...p]),heading:a.dir*45}));
 }
 function pathMetrics(points){let right=0,diag=0;const vectors=[];for(let i=1;i<points.length;i++){const dx=points[i][0]-points[i-1][0],dy=points[i][1]-points[i-1][1];if(dx&&dy)diag++;vectors.push([dx,dy]);}for(let i=1;i<vectors.length;i++)if(vectors[i][0]*vectors[i-1][0]+vectors[i][1]*vectors[i-1][1]===0)right++;return{right,diag};}
 function render(result,mode,showGuides=true){
  let s='<title>사진에서 생성된 화살표 / Photo-generated arrows: '+result.active.length+'</title>';
  s+='<defs><clipPath id="afs-head-clip"><rect x="-1" y="-1" width="51" height="32"/></clipPath></defs>';
  for(let x=50;x<=370;x+=40)for(let y=40;y<=320;y+=40)s+=`<circle cx="${x}" cy="${y}" r="1" fill="var(--border)"/>`;
  if(mode!=='original'&&showGuides){for(const [left,right,y] of [[7,1,70]]){if(result.active.some(a=>a.dir===left)&&result.active.some(a=>a.dir===right))s+=`<path d="M120 ${y}H300" fill="none" stroke="var(--muted-foreground)" stroke-width="1" stroke-dasharray="3 4" opacity=".6"/>`;}}
  for(const a of buildRoutes(result)){
   if(mode==='original'){s+=`<g opacity="${a.opacity}" fill="${a.hex}" transform="translate(210 180) rotate(${a.dir*45}) translate(-23.7572 -88)"><path d="${a.d}"/></g>`;continue;}
   const pts=a.points,tip=pts[pts.length-1],before=pts[pts.length-2],dx=tip[0]-before[0],dy=tip[1]-before[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
   const end=[tip[0]-ux*30,tip[1]-uy*30],body=[...pts.slice(0,-1),end],d=body.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ');
   s+=`<g opacity="${a.opacity}" fill="${a.hex}"><path d="${d}" fill="none" stroke="${a.hex}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><g transform="translate(${tip[0]} ${tip[1]}) rotate(${a.heading}) translate(-23.7572 0)"><path d="${a.d}" clip-path="url(#afs-head-clip)"/></g></g>`;
  }return s;
 }
 return{assets,analyze,scene,render,buildRoutes,pathMetrics,family,analyzeStructure};
})();