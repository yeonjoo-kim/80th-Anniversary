"""Revision 5: full-frame art, fixed type, portrait crop and actual audio rendering.
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
assert actual.get('preserveAspectRatio')=='none'

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
    assert page.locator('html').get_attribute('data-revision')=='5'
    for w,h in [(320,480),(390,650),(390,844),(430,932),(844,390),(1024,768),(1440,900),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h})
        frame=page.locator('#landing-art svg').evaluate('e=>{const m=e.getScreenCTM(),a=new DOMPoint(0,0).matrixTransform(m),b=new DOMPoint(402,874).matrixTransform(m);return{x:a.x,y:a.y,right:b.x,bottom:b.y};}')
        assert abs(frame['x'])<1 and abs(frame['y'])<1 and abs(frame['right']-w)<1 and abs(frame['bottom']-h)<1,frame
        for selector,size in [('.landing-eyebrow',14),('#landing-title',24),('#landing-title i',27)]:
            assert page.locator(selector).evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==size
    page.set_viewport_size({'width':390,'height':844});page.locator('#enter').tap();page.locator('#home').wait_for(state='visible')
    for w,h in [(320,480),(390,650),(390,844),(1440,900),(1366,500)]:
        page.set_viewport_size({'width':w,'height':h})
        assert page.locator('#home-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')==28
        assert 'linear-gradient' in page.locator('html').evaluate('e=>getComputedStyle(e).backgroundImage')
        field=box(page,'#stripe-field')
        assert field['x']==0 and field['y']==0 and abs(field['width']-w)<1 and abs(field['height']-h)<1
        if w>=1024:assert page.locator('.vertical-action').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=28
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
        phone.wait_for_function('n=>audioCues.length>n',arg=count)
    assert phone.locator('audio[data-feedback=session]').get_attribute('src')==source
    assert not phone.evaluate('mediaPauses'),phone.evaluate('mediaPauses')
    assert len(set(phone.evaluate('audioCues.map(c=>c.args[1])')))>1
    phone.evaluate('observedContext.suspend()')
    count=phone.evaluate('audioCues.length');phone.wait_for_timeout(90);phone.locator('#close-info').tap()
    phone.wait_for_function('n=>observedContext.state==="running"&&audioCues.length>n',arg=count)
    assert not errors,errors
    ios.close()
    # Without Web Audio, the AAC click drains its silent tail and reaches ended naturally.
    fallback=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
    offline(fallback);fallback.add_init_script('Object.defineProperty(window,"AudioContext",{value:undefined});Object.defineProperty(window,"webkitAudioContext",{value:undefined});')
    old=fallback.new_page();old.goto(BASE+'/#home');old.locator('#home .info-button').tap()
    old.wait_for_function('document.querySelector("audio[data-feedback=fallback]")?.ended')
    assert old.locator('audio[data-feedback=fallback]').evaluate('e=>!e.error&&e.currentTime>.35&&e.duration>.35&&!e.muted')
    fallback.close();browser.close()
print('PASS: full-frame SVG and fixed typography, root stripe background, centered artwork, 4:5 portrait-only crop, fixed SVG navigation, non-zero Web Audio cues, continuous iOS media session, real suspend/resume and naturally-ended AAC fallback. Physical iPhone listening remains separate.')
