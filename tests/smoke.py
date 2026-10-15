"""Run against a static server: python3 tests/smoke.py http://127.0.0.1:8002
Requires Playwright and Chromium (both supplied by the cloud environment).
Uses actual browser uploads, canvas exports, downloads, and IndexedDB reads.
"""
import io
import struct
import sys
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8002').rstrip('/')
COLORS=['0099FF','FF0095','C800FF','508D47','B8A391','C6C7C9','FAC119','753245']
def png(width=160,height=240):
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    row=b'\x00'+b''.join(bytes.fromhex(COLORS[min(7,x*8//width)]) for x in range(width))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(row*height))+chunk(b'IEND',b'')
def upload(page,data=None):page.locator('#library-file').set_input_files({'name':'palette.png','mimeType':'image/png','buffer':data or png()})
def assert_png(download):
    content=Path(download.path()).read_bytes()
    assert content[:8]==b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',content[16:24])==(1200,1500)
    return content

if __name__=='__main__':
    import runpy
    runpy.run_path(str(Path(__file__).with_name('revisions_browser.py')),run_name='__main__')
