"""Supabase REST contract tests using intercepted requests, never production writes.
Checks partial uploads, retry paths, session refresh, exact-ID lookup and guest views.
Actual Supabase Auth, SQL/RLS and deployed Storage policies need separate live checks.
"""
import json
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from smoke import png

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8001').rstrip('/')
SUPABASE='https://rlqizlkkuymhyhyhdmfl.supabase.co'
OWNER='12345678-1234-4234-8234-123456789012'
SESSION={'access_token':'mock-access-token','refresh_token':'mock-refresh-token','expires_in':3600,'user':{'id':OWNER}}

def fixture(context,fixture):
    def handle(route):
        req=route.request;path=urlparse(req.url).path
        headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}
        def reply(data=None,status=200):route.fulfill(status=status,content_type='application/json',headers=headers,body=json.dumps(data) if data is not None else '')
        if req.method=='OPTIONS':reply();return
        assert req.headers.get('apikey','').startswith('sb_publishable_')
        if path=='/auth/v1/signup':
            fixture['signup']+=1;reply(SESSION)
        elif path=='/auth/v1/token':
            fixture['refresh']+=1
            assert req.post_data_json['refresh_token']=='mock-refresh-token'
            reply(SESSION)
        elif path.startswith('/storage/v1/object/trajectory-images/'):
            assert req.headers.get('authorization')=='Bearer mock-access-token'
            key=path.removeprefix('/storage/v1/object/trajectory-images/')
            fixture['attempts'].append(key)
            if fixture['fail'] and key.endswith('/poster.png'):reply({'message':'simulated upload failure'},500)
            else:
                fixture['uploads'][key]={'type':req.headers.get('content-type'),'size':len(req.post_data_buffer)}
                reply({'Key':key})
        elif path=='/rest/v1/creations':
            assert req.headers.get('authorization')=='Bearer mock-access-token'
            row=req.post_data_json
            assert all(row[name] in fixture['uploads'] for name in ['photo_path','arrows_path','poster_path'])
            assert row['owner_id']==OWNER and row['ready']
            fixture['documents'][row['id']]=row;fixture['writes']+=1;reply(status=204)
        elif path=='/rest/v1/rpc/get_creation':
            # Guest result lookup should never attach an auth token or enumerate records.
            assert 'authorization' not in req.headers
            key=req.post_data_json['p_id'];fixture['lookups'].append(key)
            row=fixture['documents'].get(key)
            reply([{k:v for k,v in row.items() if k not in ['owner_id','ready']}] if row else [])
        else:raise AssertionError('Unexpected request '+path)
    context.route(SUPABASE+'/**',handle)
    context.route(SUPABASE+'/storage/v1/object/public/**',lambda r:r.fulfill(status=200,content_type='image/png',body=png()))

def new_fixture():return {'fail':True,'uploads':{},'attempts':[],'documents':{},'writes':0,'signup':0,'refresh':0,'lookups':[]}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844})
    data=new_fixture();fixture(context,data)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/#home')
    page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':png()})
    page.locator('#photo').wait_for(state='visible');page.locator('#create').click()
    page.locator('#finish').wait_for(state='visible')
    page.wait_for_function("document.getElementById('archive-status').textContent.includes('다시 시도')")
    assert data['writes']==0 and len(data['uploads'])==2
    page.locator('#open-record').click();page.locator('#record-images').wait_for(state='visible')
    assert page.locator('#share-record').is_hidden()
    data['fail']=False
    page.locator('#retry-cloud').click();page.locator('#share-record').wait_for(state='visible')
    assert data['writes']==1 and data['signup']==1
    assert len(data['attempts'])==6 and data['attempts'][:3]==data['attempts'][3:]
    assert sorted(v['type'] for v in data['uploads'].values())==['image/jpeg','image/png','image/png']
    result_url=page.url
    other=browser.new_context(viewport={'width':390,'height':844});fixture(other,data)
    viewer=other.new_page();viewer.on('pageerror',lambda e:errors.append(str(e)))
    viewer.goto(result_url);viewer.locator('#record-images').wait_for(state='visible')
    for selector in ['#record-photo','#record-arrows']:
        assert viewer.locator(selector).evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0)')
    assert viewer.locator('#share-record').is_visible()
    assert data['signup']==1 and data['writes']==1 and len(data['lookups'])==1
    # Expired sessions refresh before uploading, without creating another anonymous user.
    refresh_context=browser.new_context();fixture(refresh_context,data)
    expired={**SESSION,'expires_at':1}
    refresh_context.add_init_script('localStorage.setItem("trajectory-supabase-session-v1",'+json.dumps(json.dumps(expired))+');')
    refresh_page=refresh_context.new_page();refresh_page.goto(BASE+'/#home')
    refresh_page.evaluate('''async()=>{const blob=new Blob(['test'],{type:'image/png'});await trajectoryArchive.onlineSave({id:'00000000-0000-4000-8000-000000000001',createdAt:new Date().toISOString(),photo:new Blob(['photo'],{type:'image/jpeg'}),arrows:blob,poster:blob});}''')
    assert data['refresh']==1 and data['signup']==1 and data['writes']==2
    # A malicious/mismatched RPC path is never used as an image URL.
    first_id=next(iter(data['documents']))
    data['documents'][first_id]['photo_path']='https://evil.example/photo.jpg'
    bad=viewer.evaluate('''async id=>{try{await trajectoryArchive.onlineGet(id);return false;}catch{return true;}}''',first_id)
    assert bad
    assert not errors,errors
    browser.close()
print('PASS: mocked Supabase REST: partial upload failure, 3-file publish, same-path retry, anonymous session reuse/refresh, exact-ID guest lookup without signup, unsafe-path rejection. Live SQL/RLS and real uploads not exercised.')
