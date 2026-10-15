"""Run against a static server: python3 tests/smoke.py http://127.0.0.1:8001
Requires Playwright and Chromium (both supplied by the cloud environment).
Uses actual browser uploads, canvas exports, downloads, and IndexedDB reads.
"""
import io
import struct
import sys
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8001').rstrip('/')
COLORS=['0099FF','FF0095','C800FF','508D47','B8A391','C6C7C9','FAC119','753245']
def png(width=160,height=240):
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    row=b'\x00'+b''.join(bytes.fromhex(COLORS[min(7,x*8//width)]) for x in range(width))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(row*height))+chunk(b'IEND',b'')
def upload(page,data=None):page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':data or png()})
def assert_png(download):
    content=Path(download.path()).read_bytes()
    assert content[:8]==b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',content[16:24])==(1206,1560)
    return content

if __name__=='__main__':
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':402,'height':874},accept_downloads=True)
        # This suite deliberately tests local mode without touching the real Supabase project.
        context.route('**/supabase-config.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE)
        assert page.locator('#landing').is_visible()
        page.locator('#enter').click();page.locator('#home').wait_for(state='visible')
        initial=page.locator('#stripe-field').inner_html()
        page.mouse.move(20,300);page.mouse.down();page.mouse.move(100,300,steps=5);page.mouse.up()
        assert page.locator('#stripe-field').inner_html()!=initial
        page.locator('#home .info-button').click();page.locator('#info').wait_for(state='visible')
        assert 'participatory design' in page.locator('.info-copy').inner_text()
        page.locator('#close-info').click();page.locator('#home').wait_for(state='visible')
        upload(page);page.locator('#photo').wait_for(state='visible')
        # Invalid replacement must keep the prior valid photograph.
        prior=page.locator('#photo-preview').get_attribute('src')
        upload(page,b'invalid image');page.locator('#error').wait_for(state='visible')
        assert page.locator('#photo-preview').get_attribute('src')==prior
        page.locator('#dismiss-error').click()
        page.locator('#create').click();page.locator('#processing').wait_for(state='visible')
        page.locator('#finish').wait_for(state='visible',timeout=15000)
        page.wait_for_function("document.getElementById('archive-status').textContent.includes('이 브라우저에 저장됨')")
        page.locator('#result-preview').evaluate('(img)=>img.decode()')
        arrow_src=page.locator('#result-preview').get_attribute('src')
        page.locator('#view-poster').click();page.locator('#result-preview').evaluate('(img)=>img.decode()')
        assert page.locator('#result-preview').get_attribute('src')!=arrow_src
        page.locator('#download').click()
        with page.expect_download() as first:page.locator('#save-arrows').click()
        arrows=assert_png(first.value)
        page.wait_for_url('**/#result/*')
        page.locator('#record-images').wait_for(state='visible')
        record_url=page.url
        assert page.locator('#share-record').is_hidden()
        with page.expect_download() as second:page.locator('#record-download-poster').click()
        poster=assert_png(second.value)
        assert arrows!=poster
        # Full reload verifies all three blobs were persisted, not just held in memory.
        page.reload();page.locator('#record-images').wait_for(state='visible')
        for element in ['record-photo','record-arrows']:
            assert page.locator('#'+element).evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0)')
        record_id=record_url.split('#result/')[1]
        stored=page.evaluate('''async(id)=>{const r=await trajectoryArchive.localGet(id);return {photo:r.photo.type,arrows:r.arrows.type,poster:r.poster.type,count:r.colorCount,date:r.createdAt};}''',record_id)
        assert stored['photo']=='image/jpeg' and stored['arrows']==stored['poster']=='image/png'
        assert stored['count']==8,stored
        assert stored['date']
        for width,height in [(320,568),(390,844),(768,1024),(1440,900)]:
            page.set_viewport_size({'width':width,'height':height});page.goto(BASE+'/#home')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('#home').bounding_box()['width']<=480
        page.goto(BASE+'/#result/not-valid')
        assert '올바르지 않은' in page.locator('#record-description').inner_text()
        page.emulate_media(reduced_motion='reduce');page.goto(BASE+'/#home')
        upload(page);page.locator('#photo').wait_for(state='visible');page.locator('#create').click()
        page.locator('#finish').wait_for(state='visible',timeout=10000)
        assert not errors,errors
        browser.close()
    print('PASS: mobile flow, 8-color pattern drag, Info return, invalid-photo recovery, photo analysis, distinct PNG downloads, auto-result navigation, 3-blob persistence after reload, 4 viewport widths, bad result URL, reduced motion; no browser page errors.')
