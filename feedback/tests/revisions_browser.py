"""Mobile revision acceptance checks. No production uploads; real local photo/canvas/IDB.
Run: python3 tests/revisions_browser.py http://127.0.0.1:8002
"""
import sys,json,struct,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
from smoke import png,assert_png
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8002').rstrip('/')
VIEWPORTS=[(320,480),(320,568),(360,640),(375,667),(390,844),(412,915),(430,932),(768,1024),(844,390),(1440,900)]
INSTRUMENT='''window.feedbackCalls=[];window.dateCalls=[];window.soundCalls=[];window.soundLevels=[];
Object.defineProperty(navigator,'vibrate',{configurable:true,value:ms=>{feedbackCalls.push(ms);return true;}});
const text=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){dateCalls.push({font:this.font,text:value});return text.call(this,value,...args);};
window.exportSVGs=[];const objectURL=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='image/svg+xml')void blob.text().then(text=>exportSVGs.push(text));return objectURL.call(this,blob);};
const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1){soundCalls.push(args);const data=this.buffer.getChannelData(0),rate=this.buffer.sampleRate,offset=Math.round((args[1]||0)*rate),end=Math.min(data.length,offset+Math.round((args[2]||.1)*rate));let peak=0;for(let i=offset;i<end;i++)peak=Math.max(peak,Math.abs(data[i]));soundLevels.push(peak);}return start.apply(this,args);};'''
def no_overflow(page,selectors=()):
    state=page.evaluate('''selectors=>({w:innerWidth,h:innerHeight,document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],elements:selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight],allowY:e.matches(".info-copy")&&getComputedStyle(e).overflowY==="auto"};})})''',list(selectors))
    assert state['document'][0]<=state['w']+1 and state['document'][1]<=state['h']+1,state
    for e in state['elements']:
        assert e['x']>=-1 and e['y']>=-1 and e['right']<=state['w']+1 and e['bottom']<=state['h']+1,state
        assert e['scroll'][0]<=e['client'][0]+1 and (e['allowY'] or e['scroll'][1]<=e['client'][1]+1),state

def upload(page,width=160,height=240):
    previous=page.locator('#photo-preview').get_attribute('src')
    page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':png(width,height)})
    page.locator('#photo').wait_for(state='visible')
    page.wait_for_function('previous=>{const img=document.querySelector("#photo-preview");return img.getAttribute("src")!==previous&&img.complete&&img.naturalWidth>0;}',arg=previous)
    page.locator('#photo-preview').evaluate('(img)=>img.decode()')

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,accept_downloads=True)
    c.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
    c.add_init_script(INSTRUMENT)
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.locator('#landing-art .landing-arrow').first.wait_for()
    page.evaluate('document.fonts.ready')
    assert page.locator('.landing-arrow').first.evaluate('(e)=>getComputedStyle(e).animationDuration')=='3.6s'
    assert page.locator('.landing-eyebrow i').evaluate('(e)=>getComputedStyle(e).fontStyle')=='normal'
    assert page.evaluate('feedbackCalls.length')==0
    assert page.locator('#landing-art .landing-arrow').count()==5
    assert page.locator('#landing-art svg').get_attribute('preserveAspectRatio')=='xMidYMid meet'
    assert page.locator('body').evaluate('(e)=>getComputedStyle(e).fontWeight')=='500'
    assert page.locator('#feedback-toggle').count()==0
    assert page.locator('#replace-photo').count()==0
    assert page.locator('#view-arrows').count()==0
    no_overflow(page,['#landing'])
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#landing','.landing-eyebrow','#landing-title','.landing-marks'])
        assert page.locator('#experience').evaluate('(e)=>e.clientWidth===innerWidth')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#enter').tap();page.locator('#home').wait_for(state='visible')
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#home','#home-title','#take-photo','#choose-photo','#home-archive','.logo-bar'])
        centers=page.locator('#choose-photo span, #take-photo span, #home-archive span').evaluate_all('es=>Object.fromEntries(es.map(e=>{const r=e.getBoundingClientRect();return[e.parentElement.id,{x:r.x,y:r.y,bottom:r.bottom,center:r.y+r.height/2}];}))')
        assert abs((centers['take-photo']['center']-centers['choose-photo']['center'])-(centers['home-archive']['center']-centers['take-photo']['center']))<1,centers
        assert page.locator('#home-archive').evaluate('(e)=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return Math.abs(r.x-p.x-p.width*.125)<1;}')
        for image in page.locator('.logo-bar img').all():
            box=image.bounding_box();assert box['y']+box['height']<=h+1
    page.set_viewport_size({'width':390,'height':844})
    initial=page.locator('#stripe-field').inner_html()
    page.wait_for_function('(initial)=>document.querySelector("#stripe-field").innerHTML!==initial',arg=initial,timeout=3000)
    assert page.locator('.logo-bar a').count()==3
    assert page.locator('.logo-bar > span img[alt="SNU 10-10 Project"]').count()==1
    assert [page.locator('.logo-bar a').nth(i).get_attribute('href') for i in range(3)]==['https://art.snu.ac.kr/','https://visualarts.snu.ac.kr/','https://www.snu.ac.kr/80th-anniversary/']
    assert page.locator('#choose-photo i').evaluate('(e)=>getComputedStyle(e).fontWeight')=='500'
    assert 'Playfair Display' in page.locator('#choose-photo i').evaluate('(e)=>getComputedStyle(e).fontFamily')
    assert page.evaluate('document.fonts.check(\'italic 500 16px "Playfair Display"\')')
    assert page.locator('#home .info-button').evaluate('(e)=>({family:getComputedStyle(e).fontFamily,weight:getComputedStyle(e).fontWeight,style:getComputedStyle(e).fontStyle})')=={'family':'Pretendard, sans-serif','weight':'400','style':'normal'}
    page.wait_for_function('soundCalls.length>0')
    sound_count=page.evaluate('soundCalls.length');page.wait_for_timeout(100)
    page.locator('#home .info-button').hover()
    page.wait_for_timeout(200)
    assert page.evaluate('soundCalls.length')==sound_count
    assert page.locator('#home .info-button').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
    # Dragging the photo-choice column must animate its color without opening a native picker.
    box=page.locator('#choose-photo').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    changes=[]
    page.locator('#choose-photo').evaluate("e=>e.addEventListener('click',()=>window.unexpectedPickerClick=true)")
    page.mouse.move(x,y);page.mouse.down()
    for i in range(4):
        page.mouse.move(x,y+30*(i+1));page.wait_for_timeout(90)
        changes.append(page.locator('#choose-photo').get_attribute('data-last-color'))
    page.mouse.up()
    assert len(set(changes))>1,changes
    assert not page.evaluate('Boolean(window.unexpectedPickerClick)')
    with page.expect_file_chooser() as picker:page.locator('#choose-photo').tap()
    picker.value.set_files({'name':'palette.png','mimeType':'image/png','buffer':png(160,240)})
    page.locator('#photo').wait_for(state='visible')
    assert page.locator('#photo .logo-bar, #photo .credits, #save-notice').count()==0
    # Portrait, landscape, and very tall photos remain unwarped with the action below.
    for width,height in [(160,240),(400,100),(80,1600)]:
        upload(page,width,height)
        for w,h in VIEWPORTS:
            page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#photo','#photo-preview','.create-area','#create'])
            geometry=page.evaluate('''()=>{const i=document.querySelector('#photo-preview'),r=i.getBoundingClientRect(),b=document.querySelector('#create').getBoundingClientRect();return{ratio:i.naturalWidth/i.naturalHeight,fit:getComputedStyle(i).objectFit,bottom:r.bottom,button:b.y,gap:parseFloat(getComputedStyle(document.querySelector('.create-area')).marginTop)};}''')
            assert geometry['fit']=='contain',geometry
            if w<1024:assert abs(geometry['button']-geometry['bottom']-geometry['gap'])<1.5,geometry
            else:assert page.locator('#create').bounding_box()['x']>w*.6
    page.set_viewport_size({'width':390,'height':844});upload(page)
    page.locator('#create').tap();page.locator('#processing').wait_for(state='visible')
    sound_count=page.evaluate('soundCalls.length')
    page.wait_for_timeout(700)
    assert page.evaluate('soundCalls.length')==sound_count, 'Processing animation must be silent'
    page.locator('#finish').wait_for(state='visible',timeout=15000)
    page.wait_for_function("document.getElementById('archive-status').textContent.includes('이 브라우저에 저장됨')")
    box=page.locator('#archive-status').bounding_box();assert box['width']<=1 and box['height']<=1
    current=page.locator('#result-preview').get_attribute('src')
    page.wait_for_function('(src)=>document.querySelector("#result-preview").src!==src',arg=current,timeout=1500)
    type_center=page.evaluate('''()=>{const text=exportSVGs.find(s=>s.includes('data-layer="poster-typography"'));const parsed=new DOMParser().parseFromString(text,'image/svg+xml');const svg=document.importNode(parsed.documentElement,true);svg.style.cssText='position:fixed;left:-10000px;visibility:hidden';document.body.append(svg);try{const g=svg.querySelector('[data-layer="poster-typography"]'),r=g.getBBox(),m=g.transform.baseVal.consolidate().matrix,p=new DOMPoint(r.x+r.width/2,r.y+r.height/2).matrixTransform(m);return{x:p.x,y:p.y};}finally{svg.remove();}}''')
    assert abs(type_center['x']-201)<.01 and abs(type_center['y']-391.25)<.01,type_center
    assert page.evaluate('document.fonts.check(\'25px "Panchi Mono"\')')
    assert any('Panchi Mono' in x['font'] and len(x['text'])==10 for x in page.evaluate('dateCalls'))
    assert page.evaluate('feedbackCalls.length')>0
    calls=page.evaluate('soundCalls');assert calls and all(len(x)==3 and .07<=x[2]<=.09 for x in calls),calls
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#finish','.finished-art','.finish-actions','#open-record'])
        widths=page.locator('.finish-actions > button').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().width)')
        assert len(widths)==3 and max(widths)-min(widths)<1,widths
        page.evaluate('location.hash="#home"');page.locator('#home').wait_for(state='visible');page.locator('#home .info-button').click();page.locator('#info').wait_for(state='visible')
        page.wait_for_timeout(50);no_overflow(page,['#info','.info-copy','#close-info'])
        assert page.locator('.info-copy').evaluate('(e)=>getComputedStyle(e).textAlign')=='justify'
        assert page.locator('.info-copy [lang=en]').evaluate('(e)=>getComputedStyle(e).fontStyle')=='normal'
        page.locator('#close-info').click();page.locator('#home').wait_for(state='visible');page.evaluate('location.hash="#finish"');page.locator('#finish').wait_for(state='visible')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#download').tap()
    assert page.locator('#download-title').count()==0
    assert page.locator('#save-arrows span').inner_text()=='궤적 저장하기'
    assert page.locator('#save-poster span').inner_text()=='포스터 저장하기'
    assert page.locator('#save-both span').inner_text()=='둘 다 저장하기'
    assert page.locator('#download-done span').inner_text()=='궤적 아카이브'
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#download-dialog','#download-dialog form'])
    page.set_viewport_size({'width':390,'height':844})
    downloads=[];page.on('download',lambda download:downloads.append(download))
    page.locator('#save-both').tap();page.wait_for_url('**/#archive')
    for _ in range(20):
        if len(downloads)==2:break
        page.wait_for_timeout(100)
    assert len(downloads)==2,[d.suggested_filename for d in downloads]
    arrows=assert_png(next(d for d in downloads if '-arrows-' in d.suggested_filename))
    poster=assert_png(next(d for d in downloads if '-poster-' in d.suggested_filename));assert arrows!=poster
    page.locator('.archive-card').first.wait_for()
    card=page.locator('.archive-card').first
    assert card.locator('.archive-photo').get_attribute('src') is None
    assert card.locator('.archive-photo').evaluate('(e)=>getComputedStyle(e).objectFit')=='cover'
    # A held press previews the photo, while a short tap opens the pair side by side.
    box=card.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down();page.wait_for_timeout(400)
    page.wait_for_function('getComputedStyle(document.querySelector(".archive-photo")).opacity==="1"')
    page.mouse.up();page.wait_for_timeout(160)
    assert page.url.endswith('#archive')
    assert card.locator('.archive-photo').evaluate('(e)=>getComputedStyle(e).opacity')=='0'
    card.tap();page.locator('#record-images').wait_for(state='visible')
    geometry=page.locator('#record-images figure').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
    assert len(geometry)==2 and geometry[0]['right']<=geometry[1]['x'] and abs(geometry[0]['y']-geometry[1]['y'])<1,geometry
    page.locator('#record [data-action="archive"]').tap();page.locator('.archive-card').wait_for()
    # Seed enough participants for several scroll batches, newest first, with no page numbering.
    stored=page.evaluate('''async()=>{const list=await trajectoryArchive.localList();const r=list.items[0];for(let i=1;i<=30;i++)await trajectoryArchive.localSave({...r,id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),createdAt:new Date(Date.parse(r.createdAt)-i*60000).toISOString()});return r.id;}''')
    page.reload();page.locator('.archive-card').first.wait_for()
    assert page.locator('.gallery-pagination, #gallery-page').count()==0
    assert page.locator('.archive-card').count()==12
    assert page.locator('.archive-card').first.get_attribute('data-record-id')==stored
    page.locator('#gallery-scroll').evaluate('e=>e.scrollTop=e.scrollHeight')
    page.wait_for_function('document.querySelectorAll(".archive-card").length===24')
    page.locator('#gallery-scroll').evaluate('e=>e.scrollTop=e.scrollHeight')
    page.wait_for_function('document.querySelectorAll(".archive-card").length===31')
    ids=page.locator('.archive-card').evaluate_all('es=>es.map(e=>e.dataset.recordId)');assert len(set(ids))==31
    assert ids[1:]==['00000000-0000-4000-8000-'+str(i).zfill(12) for i in range(1,31)]
    neighbors=page.evaluate('id=>trajectoryArchive.localNeighbors(id)',ids[18])
    assert neighbors=={'previous':ids[17],'next':ids[19]},neighbors
    assert page.locator('#gallery-scroll').evaluate('e=>e.scrollHeight>e.clientHeight')
    selected=page.locator('.archive-card').nth(18);selected.scroll_into_view_if_needed()
    before=page.locator('#gallery-scroll').evaluate('e=>e.scrollTop');selected.tap()
    page.locator('#record-images').wait_for(state='visible')
    assert page.locator('#record figcaption, #record-download-arrows, #record-download-poster').count()==0
    assert page.locator('#record-description').inner_text()==''
    page.wait_for_function('!document.querySelector("#record-next").disabled')
    current=page.url;page.locator('#record-next').tap();page.wait_for_url('**/#result/'+ids[19])
    page.wait_for_function('!document.querySelector("#record-prev").disabled')
    page.locator('#record-prev').tap();page.wait_for_url(current)
    palette_colors=['rgb(0, 153, 255)','rgb(255, 0, 149)','rgb(200, 0, 255)','rgb(80, 141, 71)','rgb(184, 163, 145)','rgb(198, 199, 201)','rgb(250, 193, 25)','rgb(117, 50, 69)']
    assert page.locator('#record').evaluate('(e)=>getComputedStyle(e).backgroundColor') in palette_colors
    page.locator('#record [data-action="archive"]').tap();page.locator('#gallery').wait_for(state='visible')
    assert page.locator('.archive-card').count()==31
    assert abs(page.locator('#gallery-scroll').evaluate('e=>e.scrollTop')-before)<1
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#gallery','.gallery-header'])
        ratio=page.locator('.archive-card').first.evaluate('(e)=>{const r=e.getBoundingClientRect();return r.width/r.height;}')
        assert abs(ratio-.8)<.002,ratio
    # Old private result links remain usable without reintroducing My Trajectory into the new flow.
    page.set_viewport_size({'width':390,'height':844});page.goto(BASE+'/#result/'+stored)
    page.locator('#record-images').wait_for(state='visible')
    assert page.locator('#record-download-poster').count()==0
    assert page.locator('#record-photo').evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0)')
    page.emulate_media(reduced_motion='reduce');page.goto(BASE+'/#home');upload(page)
    page.locator('#create').click();page.locator('#finish').wait_for(state='visible')
    src=page.locator('#result-preview').get_attribute('src');page.wait_for_timeout(950)
    assert page.locator('#result-preview').get_attribute('src')==src
    assert not errors,errors
    # Upgrade an existing v1 database without losing artwork, then test real desktop hover.
    desktop=b.new_context(viewport={'width':1280,'height':800})
    desktop.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
    old=desktop.new_page();old.goto(BASE+'/assets/back-button.svg')
    old.evaluate('''encoded=>new Promise((resolve,reject)=>{const req=indexedDB.open('snu-art-80',1);req.onupgradeneeded=()=>req.result.createObjectStore('creations',{keyPath:'id'});req.onsuccess=()=>{const db=req.result,tx=db.transaction('creations','readwrite'),blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'});tx.objectStore('creations').put({id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-10-15T00:00:00Z',photo:blob,arrows:blob,poster:blob});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);})''',base64.b64encode(png(80,120)).decode())
    old.goto(BASE+'/#archive');old.locator('.archive-card').wait_for()
    assert old.evaluate('(async()=>!!(await trajectoryArchive.localGet("00000000-0000-4000-8000-000000000001")))()')
    old.locator('.archive-card').hover()
    old.wait_for_function('getComputedStyle(document.querySelector(".archive-photo")).opacity==="1"')
    old.mouse.move(0,0)
    old.wait_for_function('getComputedStyle(document.querySelector(".archive-photo")).opacity==="0"')
    desktop.close()
    # Eight supplied SVG shapes advance at 1-second intervals; native mobile share receives both PNGs once.
    native=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
    native.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
    native.add_init_script(INSTRUMENT)
    native.add_init_script('''window.shareCalls=[];Object.defineProperty(navigator,'canShare',{value:({files})=>files.length===2});Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:async value=>{shareCalls.push({active:navigator.userActivation.isActive,files:value.files.map(f=>({name:f.name,size:f.size,type:f.type}))});}});''')
    phone=native.new_page();phone.on('pageerror',lambda e:errors.append(str(e)))
    with phone.expect_response('**/assets/back-arrows.json') as response:phone.goto(BASE+'/#home')
    response.value.body()
    phone.locator('#home .info-button').tap()
    phone.wait_for_function('soundCalls.length>0&&soundLevels.every(level=>level>.1)&&document.querySelector("audio[data-feedback=session]").currentTime>0')
    media=phone.locator('audio[data-feedback]').evaluate('(e)=>({muted:e.muted,volume:e.volume,error:e.error?.code,elapsed:e.currentTime})')
    assert not media['muted'] and media['volume']>0 and media['error'] is None and media['elapsed']>0,media
    phone.locator('#close-info').tap();phone.locator('#home').wait_for(state='visible')
    assert phone.locator('audio[data-feedback]').count()==1
    media_source=phone.locator('audio[data-feedback=session]').get_attribute('src')
    count=phone.evaluate('soundCalls.length')
    phone.wait_for_timeout(120)
    phone.locator('#home .info-button').tap()
    phone.wait_for_function('count=>soundCalls.length>count',arg=count)
    assert phone.locator('audio[data-feedback=session]').get_attribute('src')==media_source
    assert phone.locator('audio[data-feedback=session]').evaluate('e=>e.loop&&!e.error&&!e.muted')
    assert phone.evaluate('soundLevels.every(level=>level>.1)')
    phone.locator('#close-info').tap();phone.locator('#home').wait_for(state='visible')
    upload(phone)
    back=phone.locator('#photo .back-button');phone.wait_for_function('document.querySelector("#photo .back-button").dataset.arrow!==undefined')
    shapes=[]
    for i in range(8):
        shape=back.get_attribute('data-arrow');shapes.append(shape)
        if i<7:phone.wait_for_function('(previous)=>document.querySelector("#photo .back-button").dataset.arrow!==previous',arg=shape,timeout=1800)
    assert len(set(shapes))==8,shapes
    phone.emulate_media(reduced_motion='reduce')
    frozen=back.get_attribute('data-arrow');phone.wait_for_timeout(1100);assert back.get_attribute('data-arrow')==frozen
    phone.locator('#create').tap();phone.locator('#finish').wait_for(state='visible')
    phone.locator('#download').tap();phone.locator('#save-both').tap();phone.wait_for_url('**/#archive')
    shared=phone.evaluate('shareCalls');assert len(shared)==1 and shared[0]['active'] and len(shared[0]['files'])==2,shared
    assert all(f['type']=='image/png' and f['size']>1000 for f in shared[0]['files'])
    assert shared[0]['files'][0]['name']!=shared[0]['files'][1]['name']
    phone.evaluate('location.hash="#finish"');phone.locator('#finish').wait_for(state='visible');phone.locator('#download').tap()
    phone.evaluate('Object.defineProperty(navigator,"share",{value:async()=>{throw new DOMException("cancel","AbortError");},configurable:true})')
    phone.locator('#save-both').tap();phone.wait_for_function('document.querySelector("#download-status").textContent.includes("취소")')
    assert phone.locator('#download-dialog').is_visible() and phone.url.endswith('#finish')
    assert phone.locator('#save-both').is_enabled()
    assert not errors,errors
    native.close()
    b.close()
print('PASS: 10 viewports, full visible content, photo aspect ratios, 2s/800ms timers, silent hover/drag/processing and button-only sound, regular/italic typography, home archive spacing, equal Fin actions, dual PNG download, 4:5 scroll archive, newest-first batches, photo preview/detail/back restoration, v1 migration, reduced motion.')
