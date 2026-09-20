(()=>{
  'use strict';
  const $=id=>document.getElementById(id),english=['Orange','Blue','Burgundy','Green','Purple','Beige','Pink'];
  let result=null,busy=false,photoUrl=null,serial=0;
  function markup(r){return afsCore.render(r,'route',false).replaceAll('var(--border)','#dedede').replaceAll('var(--muted-foreground)','#727272');}
  function setStatus(ko,en){$('status').replaceChildren(document.createTextNode(ko));const s=document.createElement('span');s.lang='en';s.textContent=en;$('status').append(s);}
  function fail(ko,en){$('error').textContent=ko+' / '+en;$('error').hidden=false;}
  function render(r){$('arrows').innerHTML=markup(r);$('arrows').setAttribute('aria-label',`${r.active.length}개 화살표 / ${r.active.length} arrows`);}
  function setBusy(value){busy=value;for(const id of ['take-photo','choose-photo','save-png'])$(id).disabled=value;}
  async function loadPhoto(file){
    if(!file||busy)return;
    $('error').hidden=true;
    if(file.size>30*1024*1024){fail('30MB 이하의 사진을 선택해 주세요.','Please choose a photo under 30 MB.');return;}
    const current=++serial;setBusy(true);setStatus('사진의 색과 선을 읽고 있어요.','Reading the colors and lines in your photo.');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      if(current!==serial){URL.revokeObjectURL(url);return;}
      const scale=320/Math.max(img.naturalWidth,img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const next=afsCore.analyze(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,'low');
      result=next;render(result);if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=url;
      $('output').hidden=false;$('save-png').hidden=false;
      if(result.fallback==='neutral')setStatus('색이 감지되지 않아 기본 주황 화살표를 표시합니다.','No color detected. Showing the default orange arrow.');
      else if(result.fallback==='weak')setStatus('3% 이상인 색이 없어, 가장 많이 감지된 색 1개를 사용했습니다.','No color reached 3%. Using the most detected color.');
      else setStatus(`${result.active.length}가지 색, ${result.active.length}개의 궤적.`,`${result.active.length} colors. ${result.active.length} trajectories.`);
    }catch{URL.revokeObjectURL(url);fail('사진을 열지 못했어요. JPG, PNG 또는 WebP로 다시 시도해 주세요.','Could not open this photo. Try JPG, PNG or WebP.');setStatus(result?'기존 결과를 유지했습니다.':'다른 사진을 선택해 주세요.',result?'Your previous result is still here.':'Please choose another photo.');}
    finally{setBusy(false);}
  }
  function svgSource(){return `<svg xmlns="http://www.w3.org/2000/svg" width="1260" height="1080" viewBox="0 0 420 360"><rect width="420" height="360" fill="white"/>${markup(result)}</svg>`;}
  function download(blob,extension){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='snu-art-80-trajectories.'+extension;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('take-photo').addEventListener('click',()=>$('camera-file').click());$('choose-photo').addEventListener('click',()=>$('library-file').click());
  for(const id of ['camera-file','library-file'])$(id).addEventListener('change',e=>{const file=e.target.files?.[0];loadPhoto(file);e.target.value='';});
  $('save-png').addEventListener('click',async()=>{if(!result||busy)return;setBusy(true);$('error').hidden=true;const url=URL.createObjectURL(new Blob([svgSource()],{type:'image/svg+xml'}));try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=1260;canvas.height=1080;canvas.getContext('2d').drawImage(img,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error();download(blob,'png');}catch{fail('이미지를 저장하지 못했어요. 다시 시도해 주세요.','Could not save the image. Please try again.');}finally{URL.revokeObjectURL(url);setBusy(false);}});
  function showScreen(){const open=location.hash==='#make';$('landing').hidden=open;$('maker').hidden=!open;if(open)$('maker-title').focus({preventScroll:true});}
  $('enter').addEventListener('click',()=>{location.hash='#make';});
  addEventListener('hashchange',showScreen);showScreen();
  const context=document.modelContext,lifecycle=new AbortController();
  if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'read_arrow_result',title:'Read generated arrows',description:'Read the current photo analysis and arrow result. Does not open or upload photos.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{state:busy?'processing':result?'generated':'empty',threshold:0.03,arrows:result?result.active.map(a=>({color:english[a.i],coverage:a.coverage,direction:a.dir*45})):[],fallback:result?.fallback||false};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  addEventListener('pagehide',()=>{lifecycle.abort();if(photoUrl)URL.revokeObjectURL(photoUrl);},{once:true});
})();
