"""Revision 4: real output geometry, desktop layout and audible source data.
No production uploads; browser storage and Supabase responses stay local.
"""
from array import array
import json
import math
from pathlib import Path
import sys
import wave
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright
from smoke import png

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8002').rstrip('/')
ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://www.w3.org/2000/svg'}
SHAPES = json.loads((ROOT / 'assets/back-arrows.json').read_text())
assert {s['direction'] for s in SHAPES} == set(range(8))
for shape in SHAPES:
    original = ET.parse(ROOT / f'assets/arrows/arrow-{shape["number"]}.svg').getroot().find('s:path', NS)
    assert shape['path'] == original.get('d')
    assert shape['transform'] == original.get('transform', '')
for i in range(1, 9):
    frame = ET.parse(ROOT / f'assets/process-{i}.svg').getroot()
    groups = frame.findall('.//s:g[@data-arrow-source]', NS)
    assert sorted(int(g.get('data-arrow-source')) for g in groups) == list(range(1, 9))
    assert frame.find('s:g', NS).get('transform').startswith('rotate(')
    for group in groups:
        assert group.find('s:path', NS).get('d') == SHAPES[int(group.get('data-arrow-source')) - 1]['path']
    with wave.open(str(ROOT / f'assets/audio/tap-{i}.wav')) as source:
        samples = array('h', source.readframes(source.getnframes()))
        rms = math.sqrt(sum(v*v for v in samples) / len(samples)) / 32768
        assert -.1 > 20 * math.log10(rms) > -30, (i, rms)
        assert .7 < max(map(abs, samples)) / 32768 < .9
with wave.open(str(ROOT / 'assets/audio/feedback-sprite.wav')) as sprite:
    all_samples = array('h', sprite.readframes(sprite.getnframes()))
    rate = sprite.getframerate()
for offset, duration in json.loads((ROOT / 'assets/audio/cues.json').read_text()):
    clip = all_samples[round(offset*rate):round((offset+duration)*rate)]
    assert max(map(abs, clip))/32768 > .7
    silence = all_samples[round((offset+duration+.001)*rate):round((offset+.29)*rate)]
    assert not any(silence)

def geometry(page, selector):
    return page.locator(selector).evaluate('e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,font:parseFloat(s.fontSize)};}')

def visible(page, selectors, width, height):
    for selector in selectors:
        r = geometry(page, selector)
        assert r['x'] >= -1 and r['y'] >= -1 and r['right'] <= width+1 and r['bottom'] <= height+1, (selector, width, height, r)
        assert page.locator(selector).evaluate('e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1'), (selector, width, height)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':900}, reduced_motion='reduce')
    context.route('**/supabase-config.js', lambda r:r.fulfill(content_type='application/javascript', body='window.SUPABASE_CONFIG=null;'))
    context.add_init_script('''window.exportSVGs=[];const create=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='image/svg+xml')void blob.text().then(s=>exportSVGs.push(s));return create.call(this,blob);}''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e:errors.append(str(e)))
    page.goto(BASE+'/#home')
    page.evaluate('document.fonts.ready')
    assert page.locator('link[rel="icon"][type="image/svg+xml"]').get_attribute('href') == 'assets/favicon.svg'
    assert page.locator('link[rel="apple-touch-icon"]').get_attribute('href') == 'assets/apple-touch-icon.png'
    assert page.locator('a[href*="bcsai1010"]').count() == 0
    page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':png()})
    page.locator('#photo').wait_for(state='visible')
    page.locator('#create').click()
    page.locator('#finish').wait_for(state='visible')
    page.wait_for_function('exportSVGs.some(s=>s.includes("poster-typography"))')
    output_shapes = page.evaluate('''()=>{const doc=new DOMParser().parseFromString(exportSVGs.find(s=>s.includes('poster-typography')),'image/svg+xml');return [...doc.querySelectorAll('[data-arrow-source]')].map(g=>({number:Number(g.dataset.arrowSource),path:g.querySelector('path').getAttribute('d'),transform:g.querySelector('path').getAttribute('transform')}));}''')
    assert len(output_shapes) == 8
    for shape in output_shapes:
        source = SHAPES[shape['number']-1]
        assert shape['path'] == source['path'] and shape['transform'] == source['transform']
    page.wait_for_function('document.querySelector("#archive-status").textContent.includes("이 브라우저에 저장됨")')
    stamp = page.evaluate('''async()=>{const record=(await trajectoryArchive.localList(0,1)).items[0];const image=await createImageBitmap(record.poster);const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const {data}=x.getImageData(0,0,c.width,c.height);let minX=c.width,minY=c.height,maxX=0,maxY=0,count=0;for(let i=0;i<data.length;i+=4){if(data[i]<100&&data[i+1]<80&&data[i+2]>160){const p=i/4,px=p%c.width,py=Math.floor(p/c.width);minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);count++;}}return{minX,minY,maxX,maxY,count};}''')
    assert stamp['count'] > 100 and stamp['minX'] > 800 and stamp['maxY'] < 1260 and stamp['maxX']-stamp['minX'] < 260, stamp
    hidden_arrow_pixels = page.evaluate('''async()=>{const doc=new DOMParser().parseFromString(exportSVGs.find(s=>s.includes('poster-typography')),'image/svg+xml'),svg=document.importNode(doc.documentElement,true);svg.style.cssText='position:fixed;left:-10000px;visibility:hidden';document.body.append(svg);const photo=svg.querySelector('[data-layer="poster-photo"]'),box=photo.getBBox(),m=photo.getCTM(),start=new DOMPoint(box.x,box.y).matrixTransform(m),end=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(m);svg.remove();const record=(await trajectoryArchive.localList(0,1)).items[0],image=await createImageBitmap(record.arrows),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const r=x.getImageData(Math.ceil(start.x),Math.ceil(start.y),Math.floor(end.x)-Math.ceil(start.x),Math.floor(end.y)-Math.ceil(start.y)).data;let count=0;for(let i=0;i<r.length;i+=4)if(Math.abs(r[i]-238)>1||Math.abs(r[i+1]-238)>1||Math.abs(r[i+2]-239)>1)count++;return count;}''')
    assert hidden_arrow_pixels == 0, 'An arrowhead would be covered by the poster photograph'
    viewports = [(1024,768),(1280,720),(1366,768),(1440,900),(1920,1080),(2560,1440),(1366,500)]
    title_sizes = []
    for width,height in viewports:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('location.hash="#home"');page.locator('#home').wait_for(state='visible')
        title = geometry(page, '#home-title');title_sizes.append(title['font'])
        visible(page, ['#home-title','#home .info-button','#take-photo','#choose-photo','#home-archive','.logo-bar'], width,height)
        logo=geometry(page,'.logo-bar');assert abs(logo['x']-title['x'])<1
        page.locator('#home .info-button').click();page.locator('#info').wait_for(state='visible');page.wait_for_timeout(70)
        visible(page, ['.info-copy','#close-info'], width,height)
        copy=geometry(page,'.info-copy');assert copy['font']>=18 if height>=700 else copy['font']>=14
        if width==1440:assert abs(copy['width']-1080)<1
        assert 'A decade Recorded, A decade Envisioned' in page.locator('.info-copy').inner_text().replace('\n',' ')
        assert page.locator('.info-copy [lang=en] p').last.inner_text()=='This website was created by Yeonjoo Kim, Jung Ah Lee, and Chris Hamamoto.'
        page.evaluate('location.hash="#photo"');page.locator('#photo').wait_for(state='visible')
        visible(page, ['#photo-preview','#create','#photo .back-button'], width,height)
        create=geometry(page,'#create')
        assert create['x']>width*.7 and abs(create['y']-title['y'])<1
        assert page.locator('.photo-decoration:visible').count()==3
        page.evaluate('location.hash="#finish"');page.locator('#finish').wait_for(state='visible')
        visible(page, ['.finished-art','.finish-actions','#finish .info-button'], width,height)
        controls=[geometry(page,s) for s in ['#download','#restart','#open-record']]
        for button in controls:
            assert abs(button['x']-create['x'])<1 and abs(button['width']-create['width'])<1 and abs(button['height']-create['height'])<1, (create,controls)
        assert abs(controls[0]['y']-create['y'])<1
        assert controls[0]['bottom']<controls[1]['y']<controls[1]['bottom']<controls[2]['y']
        page.evaluate('location.hash="#archive"');page.locator('.archive-card').first.wait_for()
        gallery_title=geometry(page,'#gallery-title')
        for key in ['x','y','font']:assert abs(gallery_title[key]-title[key])<1,(key,gallery_title,title)
        visible(page, ['.gallery-header','#gallery-scroll'],width,height)
        page.locator('.archive-card').first.click();page.locator('#record-images').wait_for(state='visible')
        detail_title=geometry(page,'#record-title')
        for key in ['x','y','font']:assert abs(detail_title[key]-title[key])<1,(key,detail_title,title)
        visible(page, ['.record-header','#record-images','.record-navigation'],width,height)
    assert title_sizes[5]>title_sizes[3]>title_sizes[0]
    for width,height in [(320,480),(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('location.hash="#home"');page.locator('#home').wait_for(state='visible')
        title=geometry(page,'#home-title')
        page.evaluate('location.hash="#archive"');page.locator('.archive-card').first.wait_for()
        archive_title=geometry(page,'#gallery-title')
        for key in ['x','y','font']:assert abs(archive_title[key]-title[key])<1,(key,archive_title,title)
        visible(page,['.gallery-header','#gallery-scroll'],width,height)
        page.locator('.archive-card').first.click();page.locator('#record-images').wait_for(state='visible')
        record_title=geometry(page,'#record-title')
        for key in ['x','y','font']:assert abs(record_title[key]-title[key])<1,(key,record_title,title)
        visible(page,['.record-header','#record-images','.record-navigation'],width,height)
    page.set_viewport_size({'width':1440,'height':900});page.emulate_media(reduced_motion='no-preference')
    page.evaluate('location.hash="#photo"');page.locator('#photo').wait_for(state='visible')
    for arrow in page.locator('.photo-decoration').all():
        motion=arrow.evaluate('''e=>{const a=e.getAnimations()[0],duration=a.effect.getTiming().duration;const samples=[0,.5,1].map(t=>{a.pause();a.currentTime=t*duration;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});return{duration,xRange:Math.max(...samples.map(s=>s.x))-Math.min(...samples.map(s=>s.x)),yRange:Math.max(...samples.map(s=>s.y))-Math.min(...samples.map(s=>s.y))};}''')
        assert motion['duration']<10800 and motion['xRange']>720 and motion['yRange']>270,motion
    assert not errors,errors
    browser.close()
print('PASS: 7 desktop viewports, matching titles/margins/action positions, 3 background arrows, exact supplied output paths, stamp clearance, favicon, normalized cues and silent sprite guards.')
