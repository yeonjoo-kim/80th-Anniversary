"""Revision 7: proportional full-frame art, fixed type, portrait crop and actual audio rendering.
Chromium touch/iPhone-UA checks do not substitute for physical iPhone Safari listening.
No service writes: Supabase is disabled in every test context.
"""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright
from smoke import png

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8002').rstrip('/')
ROOT=Path(__file__).resolve().parents[1]
NS={'s':'http://www.w3.org/2000/svg'}
reference=ET.parse(ROOT/'assets/reference/landing-v5.svg').getroot()
expected=[p.get('d') for p in reference.find('s:g',NS).findall('s:path',NS) if p.get('fill')!='#231815']
actual=ET.parse(ROOT/'assets/landing.svg').getroot()
assert len(expected)==5 and [p.get('d') for p in actual.findall('s:path',NS)]==expected
assert actual.get('preserveAspectRatio')=='xMidYMid meet'

def offline(context):
    context.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))

def box(page,selector):return page.locator(selector).bounding_box()

AUDIO_OBSERVATION='''window.audioCues=[];window.mediaPauses=[];
const start=AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1){const d=this.buffer.getChannelData(0),rate=this.buffer.sampleRate,first=Math.round((args[1]||0)*rate),last=Math.min(d.length,first+Math.round((args[2]||.1)*rate));let peak=0;for(let i=first;i<last;i++)peak=Math.max(peak,Math.abs(d[i]));audioCues.push({args,peak});}return start.apply(this,args);};
const pause=HTMLMediaElement.prototype.pause;HTMLMediaElement.prototype.pause=function(){mediaPauses.push(this.dataset.feedback);return pause.call(this);};
const OriginalAudioContext=window.AudioContext;window.AudioContext=function(options){window.observedContext=new OriginalAudioContext(options);return observedContext;};window.AudioContext.prototype=OriginalAudioContext.prototype;'''

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce',has_touch=True,is_mobile=True)
    offline(context)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.locator('#landing-art svg').wait_for();page.evaluate('document.fonts.ready')
    assert page.locator('html').get_attribute('data-revision')=='11'
    for w,h in [(320,480),(390,650),(390,844),(430,932),(844,390),(1024,768),(1440,900),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h})
        page.wait_for_timeout(40)
        frame=page.locator('#landing-art svg').evaluate('e=>{const m=e.getScreenCTM(),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sx:m.a,sy:m.d};}')
        assert frame['x']==0 and frame['y']==0 and abs(frame['w']-w)<1 and abs(frame['h']-h)<1,frame
        assert abs(frame['sx']-frame['sy'])<.00001, 'SVG geometry must never stretch'
        sizes=[16,27,30] if w>=1024 else [14,24,27]
        for selector,size in zip(['.landing-eyebrow','#landing-title','#landing-title i'],sizes):
            assert page.locator(selector).evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==size
    # A wider window must reveal shafts, without recentering or zooming out.
    cameras=[]
    for w in [500,800,1000,1024,1440,1920]:
        page.set_viewport_size({'width':w,'height':780});page.wait_for_timeout(40)
        camera=page.locator('#landing-art svg').evaluate('e=>{const m=e.getScreenCTM(),p=new DOMPoint(201,437).matrixTransform(m);return{s:m.a,x:p.x,y:p.y,width:e.viewBox.baseVal.width};}')
        assert abs(camera['x']-w/2)<.01 and abs(camera['y']-390)<.01,camera
        cameras.append(camera)
    assert max(c['s'] for c in cameras)-min(c['s'] for c in cameras)<.00001
    assert cameras[-1]['width']>cameras[0]['width']
    manifest=page.evaluate('async()=>{let r=await fetch(document.querySelector("link[rel=manifest]").href);if(!r.ok)throw Error("Manifest failed");return await r.json()}')
    assert manifest['display']=='standalone' and manifest['scope']=='./' and manifest['start_url']=='./'
    assert page.locator('meta[name=apple-mobile-web-app-capable]').get_attribute('content')=='yes'
    assert page.locator('meta[name=apple-mobile-web-app-status-bar-style]').get_attribute('content')=='black-translucent'
    page.set_viewport_size({'width':390,'height':844});page.locator('#enter').tap();page.locator('#home').wait_for(state='visible')
    for w,h in [(320,480),(390,650),(390,844),(1440,900),(1366,500)]:
        page.set_viewport_size({'width':w,'height':h})
        assert page.locator('#home-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==30
        assert 'linear-gradient' in page.locator('html').evaluate('e=>getComputedStyle(e).backgroundImage')
        field=box(page,'#stripe-field')
        assert field['x']==0 and field['y']==0 and abs(field['width']-w)<1 and field['height']>=h
        if w>=1024:assert page.locator('.vertical-action').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=28
    # Simulate non-zero notch/home-indicator insets: only the decoration extends;
    # controls keep their safe-area positions and the field has no lower gap.
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('document.documentElement.style.setProperty("--safe-top","47px");document.documentElement.style.setProperty("--safe-bottom","34px")')
    field=box(page,'#stripe-field');surface=box(page,'#page-background')
    assert field['y']==-47 and field['height']>=844+47+34,field
    assert surface['y']==-47 and surface['height']>=844+47+34,surface
    assert box(page,'#home-title')['y']>=47
    page.evaluate('location.hash="#archive"');page.locator('#gallery').wait_for(state='visible')
    assert page.locator('#gallery-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==26
    page.evaluate('location.hash="#home"');page.locator('#home').wait_for(state='visible')
    assert page.locator('#experience').evaluate('e=>getComputedStyle(e).position')=='fixed'
    page.evaluate('document.documentElement.style.removeProperty("--safe-top");document.documentElement.style.removeProperty("--safe-bottom")')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#library-file').set_input_files({'name':'portrait.png','mimeType':'image/png','buffer':png(80,1600)})
    page.locator('#photo').wait_for(state='visible');page.locator('#photo-preview').evaluate('e=>e.decode()')
    for w,h in [(320,480),(390,844),(1440,900)]:
        page.set_viewport_size({'width':w,'height':h})
        image=box(page,'#photo-preview');back=box(page,'#photo .back-button');create=box(page,'#create')
        assert abs(image['x']+image['width']/2-w/2)<1 and abs(image['y']-back['y'])<1
        assert abs(image['width']/image['height']-.05)<.001
        assert create['y']+create['height']<=h+1
    page.set_viewport_size({'width':390,'height':844});page.locator('#create').tap();page.locator('#finish').wait_for(state='visible')
    assert page.locator('#finish .info-button').count()==0
    page.locator('#open-record').tap();page.locator('.archive-card').first.wait_for();page.locator('.archive-card').first.tap()
    page.locator('#record-images').wait_for(state='visible');page.locator('#record-photo').evaluate('i=>i.decode()')
    page.wait_for_function('document.querySelector("#record-photo").classList.contains("is-portrait")')
    for w,h in [(320,480),(390,844),(1440,900)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(60)
        photo=box(page,'#record-photo');assert abs(photo['width']/photo['height']-.8)<.005,photo
        assert page.locator('#record-photo').evaluate('i=>getComputedStyle(i).objectFit')=='cover'
        assert page.locator('#record-photo').evaluate('i=>i.naturalHeight/i.naturalWidth')==20
        back=box(page,'#record .back-button');assert abs(back['x']-w*.0845)<1
        assert page.locator('#record-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==(26 if w<1024 else 30)
        for ident,num in [('record-prev',4),('record-next',1)]:
            original=ET.parse(ROOT/f'assets/arrows/arrow-{num}.svg').getroot()
            assert page.locator('#'+ident+' path').get_attribute('d')==original.find('s:path',NS).get('d')
            assert page.locator('#'+ident).inner_text()==''
            assert page.locator('#'+ident).get_attribute('aria-label')
    # Create a landscape post and follow its next arrow to the earlier portrait post.
    page.evaluate('location.hash="#home"');page.locator('#home').wait_for(state='visible')
    page.locator('#library-file').set_input_files({'name':'landscape.png','mimeType':'image/png','buffer':png(400,100)})
    page.locator('#photo').wait_for(state='visible');page.locator('#create').click();page.locator('#finish').wait_for(state='visible')
    page.locator('#open-record').click();page.locator('.archive-card').first.wait_for();page.locator('.archive-card').first.click();page.locator('#record-images').wait_for(state='visible')
    page.locator('#record-photo').evaluate('i=>i.decode()');page.wait_for_function('!document.querySelector("#record-photo").classList.contains("is-portrait")')
    assert page.locator('#record-photo').evaluate('i=>getComputedStyle(i).objectFit')=='contain'
    page.wait_for_function('!document.querySelector("#record-next").disabled');page.locator('#record-next').click()
    page.wait_for_function('document.querySelector("#record-photo").classList.contains("is-portrait")')
    assert not errors,errors
    context.close()
    # Mouse-driven desktop windows keep readable type below the layout breakpoint.
    desktop=browser.new_context(viewport={'width':500,'height':780},reduced_motion='reduce')
    offline(desktop);pc=desktop.new_page();pc.on('pageerror',lambda e:errors.append(str(e)));pc.goto(BASE)
    pc.locator('#landing-art svg').wait_for();pc.evaluate('document.fonts.ready')
    for w,h in [(500,780),(600,780),(800,780),(1000,780),(1023,780),(1024,780),(1440,900),(1920,1080)]:
        pc.set_viewport_size({'width':w,'height':h});pc.wait_for_timeout(40)
        assert pc.evaluate('matchMedia("(hover:hover) and (pointer:fine)").matches')
        logo=box(pc,'.landing-marks');assert abs(logo['x']+logo['width']/2-w/2)<1
        assert pc.locator('#landing-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==27
        assert pc.locator('#landing-title i').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==30
    pc.locator('#enter').click()
    for w in [500,600,800,1000,1023,1024,1440]:
        pc.set_viewport_size({'width':w,'height':780})
        assert pc.locator('#home-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==30
        assert pc.locator('.vertical-action').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=28
        assert pc.locator('#home .info-button').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=20
    pc.set_viewport_size({'width':500,'height':780});pc.locator('#home .info-button').click();pc.wait_for_timeout(50)
    assert pc.locator('.info-copy').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=18
    pc.locator('#close-info').click()
    pc.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':png()});pc.locator('#create').click();pc.locator('#finish').wait_for(state='visible')
    # Fin.svg source rectangles: 201 × 85, rx=20. Test actual laid-out shape,
    # including minimum desktop windows, mobile layouts and active status text.
    for w,h in [(320,480),(390,844),(500,500),(500,780),(900,780),(844,390),(1024,768),(1440,900),(1920,1080)]:
        pc.set_viewport_size({'width':w,'height':h})
        for button in pc.locator('.finish-actions .color-button').all():
            b=button.bounding_box();assert abs(b['width']/b['height']-201/85)<.002,b
        pc.locator('#download').click()
        for message in ['', '이미지를 준비하고 있어요…', '공유 메뉴를 닫았습니다. 사진 앱에서 저장 여부를 확인해 주세요.', '이미지 2장 다운로드를 요청했습니다.', '저장을 취소했습니다. 다시 선택할 수 있어요.']:
            pc.locator('#download-status').evaluate('(e,text)=>e.textContent=text',message)
            d=box(pc,'#download-dialog');assert d['y']>=-1 and d['y']+d['height']<=h+1,d
            assert pc.locator('#download-dialog').evaluate('e=>e.scrollHeight<=e.clientHeight+1')
            for button in pc.locator('#download-dialog .color-button').all():
                b=button.bounding_box();assert abs(b['width']/b['height']-201/85)<.002,b
                assert button.evaluate('e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1')
                assert button.evaluate('e=>getComputedStyle(e).fontSize===getComputedStyle(e.querySelector("i")).fontSize')
        pc.locator('#download-status').evaluate('e=>e.textContent=""')
        pc.locator('#download-dialog .dialog-close').click()
    desktop.close()
    # Observe real, non-zero AudioBufferSourceNode playback, plus the separate silent iOS session.
    ios=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
    offline(ios);ios.add_init_script(AUDIO_OBSERVATION)
    phone=ios.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));phone.goto(BASE+'/#home')
    assert phone.evaluate('audioCues.length')==0
    phone.locator('#home .info-button').tap()
    phone.wait_for_function('audioCues.length>0&&document.querySelector("audio[data-feedback=session]").currentTime>0')
    assert phone.evaluate('audioCues.every(c=>c.peak>.5&&c.args.length===3)')
    assert phone.locator('audio[data-feedback=session]').evaluate('e=>e.loop&&!e.muted&&!e.error')
    source=phone.locator('audio[data-feedback=session]').get_attribute('src')
    for i in range(4):
        count=phone.evaluate('audioCues.length');phone.wait_for_timeout(90)
        phone.locator('#close-info' if i%2==0 else '#home .info-button').tap()
        phone.wait_for_function('n=>audioCues.length===n+1',arg=count)
    assert phone.locator('audio[data-feedback=session]').get_attribute('src')==source
    assert not phone.evaluate('mediaPauses'),phone.evaluate('mediaPauses')
    assert len(set(phone.evaluate('audioCues.map(c=>c.args[1])')))>1
    phone.evaluate('observedContext.suspend()')
    count=phone.evaluate('audioCues.length');phone.wait_for_timeout(90);phone.locator('#close-info').tap()
    phone.wait_for_function('n=>observedContext.state==="running"&&audioCues.length>n',arg=count)
    # Button activation is the only cue source. Background taps, stripes,
    # pointer hover/drag, keyboard focus, logo links and scroll remain silent.
    count=phone.evaluate('audioCues.length');phone.wait_for_timeout(100)
    phone.locator('#home .info-button').hover()
    phone.locator('#home .info-button').focus();phone.keyboard.press('Tab')
    phone.mouse.click(370,180)
    phone.mouse.move(370,190);phone.mouse.down();phone.mouse.move(280,190,steps=5);phone.mouse.up()
    phone.locator('.logo-bar a').first.evaluate('e=>e.addEventListener("click",event=>event.preventDefault())')
    phone.locator('.logo-bar a').first.click()
    phone.evaluate('location.hash="#archive"');phone.locator('#gallery').wait_for(state='visible')
    phone.locator('#gallery-scroll').dispatch_event('wheel',{'deltaY':100})
    phone.locator('#gallery-scroll').dispatch_event('touchmove')
    phone.wait_for_timeout(200)
    assert phone.evaluate('audioCues.length')==count
    assert phone.locator('#share-record').count()==0
    assert not errors,errors
    ios.close()
    # Without Web Audio, the AAC click drains its silent tail and reaches ended naturally.
    fallback=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
    offline(fallback);fallback.add_init_script('Object.defineProperty(window,"AudioContext",{value:undefined});Object.defineProperty(window,"webkitAudioContext",{value:undefined});')
    old=fallback.new_page();old.goto(BASE+'/#home');old.locator('#home .info-button').tap()
    old.wait_for_function('document.querySelector("audio[data-feedback=fallback]")?.ended')
    assert old.locator('audio[data-feedback=fallback]').evaluate('e=>!e.error&&e.currentTime>.35&&e.duration>.35&&!e.muted')
    fallback.close();browser.close()
print('PASS: fixed landing composition across widths, centered/enlarged desktop branding, narrow desktop font minimums, 201:85 Fin/download button shapes including status text, standalone web-app configuration, safe-area background, unchanged photo/export/archive behavior and button-only audio. Native iPhone full-screen rendering and listening remain unverified.')
