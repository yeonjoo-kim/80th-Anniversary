"""Mobile revision acceptance checks. No production uploads; real local photo/canvas/IDB.
Run: python3 tests/revisions_browser.py http://127.0.0.1:8002
"""
import sys,json,struct,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
from smoke import png,assert_png
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8002').rstrip('/')
VIEWPORTS=[(320,480),(320,568),(360,640),(375,667),(390,844),(412,915),(430,932),(768,1024),(844,390),(1440,900)]
INSTRUMENT='''window.feedbackCalls=[];window.dateCalls=[];window.soundCalls=[];
Object.defineProperty(navigator,'vibrate',{configurable:true,value:ms=>{feedbackCalls.push(ms);return true;}});
const text=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){dateCalls.push({font:this.font,text:value});return text.call(this,value,...args);};
const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){soundCalls.push(args);return start.apply(this,args);};'''
def no_overflow(page,selectors=()):
    state=page.evaluate('''selectors=>({w:innerWidth,h:innerHeight,document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],elements:selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]};})})''',list(selectors))
    assert state['document'][0]<=state['w']+1 and state['document'][1]<=state['h']+1,state
    for e in state['elements']:
        assert e['x']>=-1 and e['y']>=-1 and e['right']<=state['w']+1 and e['bottom']<=state['h']+1,state
        assert e['scroll'][0]<=e['client'][0]+1 and e['scroll'][1]<=e['client'][1]+1,state

def upload(page,width=160,height=240):
    page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':png(width,height)})
    page.locator('#photo').wait_for(state='visible');page.locator('#photo-preview').evaluate('(img)=>img.decode()')

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,accept_downloads=True)
    c.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
    c.add_init_script(INSTRUMENT)
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.locator('#landing-art .landing-arrow').first.wait_for()
    assert page.locator('#landing-art .landing-arrow').count()==5
    assert page.locator('#feedback-toggle').count()==0
    assert page.locator('#replace-photo').count()==0
    assert page.locator('#view-arrows').count()==0
    no_overflow(page,['#landing'])
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#landing','.landing-eyebrow','#landing-title','.landing-marks'])
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#enter').tap();page.locator('#home').wait_for(state='visible')
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#home','#home-title','#take-photo','#choose-photo','.logo-bar'])
        for image in page.locator('.logo-bar img').all():
            box=image.bounding_box();assert box['y']+box['height']<=h+1
    page.set_viewport_size({'width':390,'height':844})
    initial=page.locator('#stripe-field').inner_html()
    page.wait_for_function('(initial)=>document.querySelector("#stripe-field").innerHTML!==initial',arg=initial,timeout=3000)
    assert page.locator('.logo-bar a').count()==4
    assert [page.locator('.logo-bar a').nth(i).get_attribute('href') for i in range(4)]==['https://art.snu.ac.kr/','https://visualarts.snu.ac.kr/','http://www.bcsai1010.org/','https://www.snu.ac.kr/80th-anniversary/']
    assert page.locator('#choose-photo i').evaluate('(e)=>getComputedStyle(e).fontWeight')=='500'
    assert 'Playfair Display' in page.locator('#choose-photo i').evaluate('(e)=>getComputedStyle(e).fontFamily')
    assert page.evaluate('document.fonts.check(\'italic 500 16px "Playfair Display"\')')
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
    upload(page,160,240)
    assert page.locator('#photo .logo-bar, #photo .credits, #save-notice').count()==0
    # Portrait, landscape, and very tall photos remain unwarped with the action below.
    for width,height in [(160,240),(400,100),(80,1600)]:
        upload(page,width,height)
        for w,h in VIEWPORTS:
            page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#photo','#photo-preview','.create-area','#create'])
            geometry=page.evaluate('''()=>{const i=document.querySelector('#photo-preview'),r=i.getBoundingClientRect(),b=document.querySelector('#create').getBoundingClientRect();return{ratio:i.naturalWidth/i.naturalHeight,fit:getComputedStyle(i).objectFit,bottom:r.bottom,button:b.y,gap:parseFloat(getComputedStyle(document.querySelector('.create-area')).marginTop)};}''')
            assert geometry['fit']=='contain' and abs(geometry['button']-geometry['bottom']-geometry['gap'])<1.5,geometry
    page.set_viewport_size({'width':390,'height':844});upload(page)
    page.locator('#create').tap();page.locator('#finish').wait_for(state='visible',timeout=15000)
    page.wait_for_function("document.getElementById('archive-status').textContent.includes('이 브라우저에 저장됨')")
    box=page.locator('#archive-status').bounding_box();assert box['width']<=1 and box['height']<=1
    current=page.locator('#result-preview').get_attribute('src')
    page.wait_for_function('(src)=>document.querySelector("#result-preview").src!==src',arg=current,timeout=1500)
    assert page.evaluate('document.fonts.check(\'25px "Panchi Mono"\')')
    assert any('Panchi Mono' in x['font'] and len(x['text'])==10 for x in page.evaluate('dateCalls'))
    assert page.evaluate('feedbackCalls.length')>0
    calls=page.evaluate('soundCalls');assert calls and all(len(x)==3 and .07<=x[2]<=.09 for x in calls),calls
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#finish','.finished-art','.finish-actions','.finish-meta'])
        page.locator('#finish .info-button').click();page.locator('#info').wait_for(state='visible')
        page.wait_for_timeout(50);no_overflow(page,['#info','.info-copy','#close-info'])
        page.locator('#close-info').click();page.locator('#finish').wait_for(state='visible')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#download').tap()
    assert page.locator('#save-arrows span').inner_text()=='궤적 저장하기'
    assert page.locator('#save-poster span').inner_text()=='포스터 저장하기'
    # This Chromium context uses the standard download fallback, never a platform share sheet.
    with page.expect_download() as dl:page.locator('#save-arrows').click()
    arrows=assert_png(dl.value)
    page.wait_for_url('**/#archive');page.locator('.archive-card').first.wait_for()
    card=page.locator('.archive-card').first
    assert card.locator('.archive-photo').get_attribute('src') is None
    card.tap();assert card.get_attribute('aria-pressed')=='true'
    page.wait_for_function('document.querySelector(".archive-card").classList.contains("is-photo-ready")')
    page.wait_for_function('getComputedStyle(document.querySelector(".archive-photo")).opacity==="1"')
    card.tap();assert card.get_attribute('aria-pressed')=='false'
    page.wait_for_function('getComputedStyle(document.querySelector(".archive-photo")).opacity==="0"')
    # A held press reveals only while held; it must not turn into a latched tap.
    box=card.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down();page.wait_for_timeout(400)
    assert card.locator('.archive-photo').evaluate('(e)=>getComputedStyle(e).opacity')=='1'
    page.mouse.up();page.wait_for_timeout(160)
    assert card.get_attribute('aria-pressed')=='false'
    assert card.locator('.archive-photo').evaluate('(e)=>getComputedStyle(e).opacity')=='0'
    # Seed extra local participants to exercise bounded pages and persistence.
    stored=page.evaluate('''async()=>{const list=await trajectoryArchive.localList();const r=list.items[0];for(let i=1;i<=8;i++)await trajectoryArchive.localSave({...r,id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),createdAt:new Date(Date.parse(r.createdAt)-i*60000).toISOString()});return r.id;}''')
    page.reload();page.locator('.archive-card').first.wait_for();assert page.locator('.archive-card').count()==6
    first=page.locator('.archive-card').first.get_attribute('data-record-id')
    page.locator('#gallery-next').tap();page.wait_for_function('document.querySelector("#gallery-page").textContent==="2"')
    assert page.locator('.archive-card').count()==3 and page.locator('#gallery-next').is_disabled()
    page.locator('#gallery-prev').tap();page.wait_for_function('document.querySelector("#gallery-page").textContent==="1"')
    assert page.locator('.archive-card').first.get_attribute('data-record-id')==first
    for w,h in VIEWPORTS:
        page.set_viewport_size({'width':w,'height':h});no_overflow(page,['#gallery','.gallery-grid','.gallery-pagination'])
    # Old private result links remain usable without reintroducing My Trajectory into the new flow.
    page.set_viewport_size({'width':390,'height':844});page.goto(BASE+'/#result/'+stored)
    page.locator('#record-images').wait_for(state='visible')
    with page.expect_download() as dl:page.locator('#record-download-poster').click()
    poster=assert_png(dl.value);assert poster!=arrows
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
    b.close()
print('PASS: 10 viewports, full visible content, tall/natural photos, 2s colors, 800ms alternation, sliced sound/vibration calls, fonts, logo links, drag suppression, gallery lazy photo/tap/hold/hover/pagination/restore, v1 database upgrade, legacy result, distinct PNG exports, reduced motion.')
