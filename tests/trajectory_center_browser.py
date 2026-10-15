"""Check asymmetric arrow combinations in the actual SVG and PNG exports.
Uses synthetic photos and local storage only; no production mutations.
"""
import sys
from playwright.sync_api import sync_playwright
from smoke import png

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8002').rstrip('/')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for viewport in [{'width':390,'height':844}, {'width':1440,'height':900}]:
        for directions in [[1,6,5], [6], [2,7], list(range(8))]:
            context = browser.new_context(viewport=viewport, reduced_motion='reduce')
            context.route('**/supabase-config.js', lambda r:r.fulfill(content_type='application/javascript', body='window.SUPABASE_CONFIG=null;'))
            context.add_init_script('''window.exportSVGs=[];const create=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='image/svg+xml')void blob.text().then(s=>exportSVGs.push(s));return create.call(this,blob);}''')
            page = context.new_page()
            page.goto(BASE+'/#home')
            page.evaluate('(dirs)=>afsCore.analyze=()=>({active:dirs.map((dir,i)=>({...afsCore.assets[i],dir}))})', directions)
            page.locator('#library-file').set_input_files({'name':'synthetic.png','mimeType':'image/png','buffer':png()})
            page.locator('#photo').wait_for(state='visible')
            page.locator('#create').click()
            page.locator('#finish').wait_for(state='visible')
            page.wait_for_function('document.querySelector("#archive-status").textContent.includes("이 브라우저에 저장됨")')
            geometry = page.evaluate('''()=>exportSVGs.map(text=>{
                const doc=new DOMParser().parseFromString(text,'image/svg+xml');
                const svg=document.importNode(doc.documentElement,true);
                svg.style.cssText='position:fixed;left:-10000px;visibility:hidden';document.body.append(svg);
                try {
                    const g=svg.querySelector('[data-layer="trajectory"]'),b=g.getBBox(),m=g.transform.baseVal.consolidate().matrix;
                    return {center:b.x+b.width/2+m.e,left:b.x+m.e,right:b.x+b.width+m.e,yShift:m.f,scale:m.a,width:b.width,height:b.height,poster:!!svg.querySelector('[data-layer="poster-typography"]')};
                } finally {svg.remove();}
            })''')
            assert len(geometry)==2 and {g['poster'] for g in geometry}=={True,False},geometry
            for g in geometry:
                assert abs(g['center']-201)<.001 and g['left']>=0 and g['right']<=402,g
                assert g['yShift']==0 and g['scale']==1,g
            assert geometry[0]['width']==geometry[1]['width'] and geometry[0]['height']==geometry[1]['height']
            raster = page.evaluate('''async()=>{
                const r=(await trajectoryArchive.localList(0,1)).items[0],image=await createImageBitmap(r.arrows),c=document.createElement('canvas');c.width=image.width;c.height=image.height;
                const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
                const colors=afsCore.assets.map(a=>a.hex.slice(1).match(/../g).map((v,i)=>Math.round(parseInt(v,16)*a.opacity+[238,238,239][i]*(1-a.opacity))));
                let left=c.width,right=-1;
                for(let i=0;i<data.length;i+=4)if(colors.some(rgb=>rgb.every((v,j)=>Math.abs(v-data[i+j])<=1))){const x=(i/4)%c.width;left=Math.min(left,x);right=Math.max(right,x);}
                return {center:(left+right+1)/2,width:c.width,height:c.height};
            }''')
            assert raster['width']==1200 and raster['height']==1500 and abs(raster['center']-600)<2,raster
            context.close()
    browser.close()
print('PASS: 8 mobile/desktop cases; asymmetric, single and full arrow combinations centered in both SVG exports and actual trajectory PNGs, with original scale and vertical placement.')
