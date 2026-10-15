"""Owner deletion and responsive notice/layout; mocked Supabase, no live writes."""
import json,sys,time
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright
from smoke import png

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8002').rstrip('/')
SERVICE='https://rlqizlkkuymhyhyhdmfl.supabase.co'
OWNER='12345678-1234-4234-8234-123456789012';OTHER='87654321-4321-4321-8321-210987654321'
ID='00000000-0000-4000-8000-000000000091';FOREIGN='00000000-0000-4000-8000-000000000092'
KEY='trajectory-supabase-session-v1'
SESSION={'access_token':'owner-access','refresh_token':'owner-refresh','expires_at':int(time.time())+3600,'user':{'id':OWNER}}

def row(ident,owner=OWNER):return {'id':ident,'owner_id':owner,'ready':True,'captured_at':'2026-10-16T10:00:00Z',**{kind+'_path':f'{owner}/{ident}/{name}' for kind,name in [('photo','photo.jpg'),('arrows','arrows.png'),('poster','poster.png')]}}
def setup(context,db,session=SESSION):
    if session:context.add_init_script(f'localStorage.setItem({json.dumps(KEY)},{json.dumps(json.dumps(session))});')
    def handle(route):
        req=route.request;u=urlparse(req.url);path=u.path;method=req.method
        headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,DELETE,OPTIONS'}
        def reply(data=None,status=200):route.fulfill(status=status,content_type='application/json',headers=headers,body=json.dumps(data))
        if method=='OPTIONS':reply();return
        if '/object/public/' in path:
            name=path.rsplit('/',1)[-1];route.fulfill(status=200,content_type='image/png',body=png(160,240) if name=='photo.jpg' else png(120,150),headers=headers);return
        if path=='/auth/v1/signup':db['signup']+=1;reply({'message':'Deletion must never create a new identity'},400);return
        if path=='/auth/v1/token':
            db['refresh']+=1;assert req.post_data_json['refresh_token']=='owner-refresh'
            if db.get('bad_refresh'):reply({'message':'Refresh token expired'},400);return
            reply({**SESSION,'expires_in':3600});return
        if path=='/rest/v1/rpc/get_creation':
            r=db['rows'].get(req.post_data_json['p_id']);reply([{k:v for k,v in r.items() if k not in ['owner_id','ready']}] if r and r['ready'] else []);return
        if path=='/rest/v1/rpc/list_trajectories':
            r=[{k:v for k,v in r.items() if k in ['id','captured_at','photo_path','arrows_path']} for r in db['rows'].values() if r['ready']];reply(r);return
        if path=='/rest/v1/rpc/prepare_creation_deletion':
            ident=req.post_data_json['p_id'];r=db['rows'].get(ident);db['calls'].append('prepare')
            assert req.headers.get('authorization')=='Bearer owner-access'
            if db.get('missing_sql'):reply({'message':'Function not found','code':'PGRST202'},404);return
            if r and r['owner_id']!=OWNER:reply({'message':'Denied'},403);return
            if r:r['ready']=False
            reply([{k:r[k] for k in ['photo_path','arrows_path','poster_path']}] if r else []);return
        if path=='/storage/v1/object/trajectory-images' and method=='DELETE':
            assert req.headers.get('authorization')=='Bearer owner-access';paths=req.post_data_json['prefixes'];assert len(paths)==3 and all(p.startswith(OWNER+'/') for p in paths)
            db['calls'].append('storage');db['files'].discard(paths[0])
            if db.get('fail_storage'):db['fail_storage']=False;reply({'message':'Interrupted file removal'},500);return
            db['files'].difference_update(paths);reply([{'name':p} for p in paths]);return
        if path=='/rest/v1/rpc/finish_creation_deletion':
            ident=req.post_data_json['p_id'];r=db['rows'].get(ident);db['calls'].append('finish')
            assert req.headers.get('authorization')=='Bearer owner-access'
            if any(p.startswith(f'{OWNER}/{ident}/') for p in db['files']):reply({'message':'Files remain'},400);return
            if r:assert r['owner_id']==OWNER;del db['rows'][ident]
            reply(True);return
        raise AssertionError('Unexpected API '+method+' '+path)
    context.route(SERVICE+'/**',handle)

def fixture():
    rows={ID:row(ID),FOREIGN:row(FOREIGN,OTHER)}
    return {'rows':rows,'files':{p for r in rows.values() for k,p in r.items() if k.endswith('_path')},'calls':[],'signup':0,'refresh':0}

def geometry(page,selector):return page.locator(selector).bounding_box()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    db=fixture();c=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,reduced_motion='reduce');setup(c,db)
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/#result/'+ID);page.locator('#record-images').wait_for(state='visible');page.locator('#record-photo').evaluate('e=>e.decode()');page.locator('#delete-record').wait_for(state='visible')
    for w,h in [(320,480),(390,844),(844,390),(1024,768),(1440,900),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(50)
        a=geometry(page,'#record-photo');b=geometry(page,'#record-arrows');d=geometry(page,'#delete-record')
        assert abs(a['width']/a['height']-.8)<.002 and abs(b['width']/b['height']-.8)<.002,(a,b)
        gap=b['x']-a['x']-a['width'];assert 7<=gap<=25,(w,gap)
        if w>=1024:assert d['x']>=b['x']+b['width'] and abs(d['y']-b['y'])<1,(b,d)
        else:assert d['y']>=b['y']+b['height'] and abs(d['x']+d['width']-b['x']-b['width'])<1,(b,d)
        assert d['y']+d['height']<=h and d['x']+d['width']<=w,d
    page.locator('#delete-record').click();page.locator('#cancel-delete').click();assert db['calls']==[]
    page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_url('**/#archive')
    assert ID not in db['rows'] and not any(ID in f for f in db['files'])
    assert page.evaluate('(id)=>trajectoryArchive.localGet(id)',ID) is None
    assert page.locator(f'.archive-card[data-record-id="{ID}"]').count()==0
    assert db['calls']==['prepare','storage','finish'] and db['signup']==0
    page.evaluate('(id)=>location.hash="#result/"+id',FOREIGN);page.locator('#record-images').wait_for(state='visible');assert page.locator('#delete-record').is_hidden()
    rejected=page.evaluate('async id=>{try{await trajectoryArchive.removeOwn(await trajectoryArchive.onlineGet(id));return false}catch{return true}}',FOREIGN);assert rejected and db['calls']==['prepare','storage','finish']
    c.close()
    # Partial file deletion: keep a durable retry, never finish early; reload retries.
    db=fixture();db['fail_storage']=True;c=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');setup(c,db)
    page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'/#result/'+ID);page.locator('#delete-record').wait_for(state='visible')
    page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_function('document.querySelector("#delete-progress").textContent.includes("완료하지")')
    assert ID in db['rows'] and not db['rows'][ID]['ready'] and 'finish' not in db['calls']
    assert page.evaluate('(id)=>trajectoryArchive.localGet(id).then(r=>r.deletionPending)',ID)
    page.reload();page.wait_for_url('**/#archive');page.wait_for_function('(id)=>trajectoryArchive.localGet(id).then(r=>!r)',arg=ID)
    assert ID not in db['rows'] and not any(ID in f for f in db['files']) and db['signup']==0
    assert db['calls']==['prepare','storage','prepare','storage','finish']
    c.close()
    # No session: visiting public results never signs up or exposes Delete.
    db=fixture();c=browser.new_context();setup(c,db,session=None);page=c.new_page();page.goto(BASE+'/#result/'+ID);page.locator('#record-images').wait_for(state='visible');assert page.locator('#delete-record').is_hidden();assert db['signup']==0;c.close()
    # Expired owner identity refreshes once; deletion never creates a replacement identity.
    db=fixture();c=browser.new_context();setup(c,db,{**SESSION,'expires_at':0});page=c.new_page();page.goto(BASE+'/#result/'+ID);page.locator('#delete-record').wait_for(state='visible');page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_url('**/#archive');assert db['refresh']==1 and db['signup']==0;c.close()
    # A lost identity cannot be replaced with a new anonymous login to delete old work.
    db=fixture();db['bad_refresh']=True;c=browser.new_context();setup(c,db,{**SESSION,'expires_at':0});page=c.new_page();page.goto(BASE+'/#result/'+ID);page.locator('#delete-record').wait_for(state='visible');page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_function('document.querySelector("#delete-progress").textContent.includes("로그인")');assert db['signup']==0 and db['rows'][ID]['ready'] and db['calls']==[];c.close()
    # Missing migration: no files or rows are removed and the record stays public.
    db=fixture();db['missing_sql']=True;c=browser.new_context();setup(c,db);page=c.new_page();page.goto(BASE+'/#result/'+ID);page.locator('#delete-record').wait_for(state='visible');page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_function('document.querySelector("#delete-progress").textContent.includes("설정")');assert db['rows'][ID]['ready'] and db['calls']==['prepare'];c.close()
    # Photo notice uses the uploaded reference's photo-relative bottom/type sizing.
    c=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True);c.route('**/supabase-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG=null;'))
    page=c.new_page();page.goto(BASE+'/#home');page.locator('#library-file').set_input_files({'name':'portrait.png','mimeType':'image/png','buffer':png(160,240)});page.locator('#photo').wait_for(state='visible')
    for w,h in [(320,480),(390,844),(1440,900),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h});photo=geometry(page,'#photo-preview');notice=geometry(page,'#photo-notice')
        assert notice['y']>=photo['y'] and notice['y']+notice['height']<=photo['y']+photo['height']
        assert abs(notice['x']+notice['width']/2-photo['x']-photo['width']/2)<1
        font=page.locator('#photo-notice').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)');assert abs(font-max(11,photo['width']*.0373))<.1
        assert '* 선택된 사진은 궤적 아카이브에 저장됩니다.'==page.locator('#photo-notice').inner_text()
    page.set_viewport_size({'width':390,'height':844});page.locator('#create').click();page.locator('#finish').wait_for(state='visible')
    own=page.evaluate('async()=>{const r=await trajectoryArchive.localList(0,1);return r.items[0].id}')
    page.locator('#open-record').click();page.locator('.archive-card').first.wait_for();page.locator('.archive-card').first.click();page.locator('#delete-record').wait_for(state='visible')
    page.locator('#delete-record').click();page.locator('#confirm-delete').click();page.wait_for_url('**/#archive')
    assert page.evaluate('id=>trajectoryArchive.localGet(id)',own) is None
    assert page.locator('#photo-preview').get_attribute('src') is None
    page.evaluate('location.hash="#photo"');page.locator('#home').wait_for(state='visible')
    assert not errors,errors
    c.close();browser.close()
print('PASS: owner-only Delete, mobile/desktop position, close image gap, cancel, complete removal, partial Storage failure and reload retry, missing SQL, session refresh/no signup, photo-relative notice.')
