"""Local disposable synthetic review entry. Never reads production credentials."""
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
import json
class Review(BaseHTTPRequestHandler):
 def do_GET(self):
  meta=json.loads(Path('/tmp/petros-phase6-browser.json').read_text())
  assert meta['phase']=='P6' and meta['cohortKind']=='disposable-synthetic'
  target={'/student':meta['web']+'/home','/petros':meta['web']+'/petros','/teacher':meta['institutionWeb']+'/teaching/'+meta['classId']+'/'+meta['subjectId']}.get(self.path)
  if target:
   self.send_response(302)
   cookie=(meta['teacherCookieName'],meta['teachers']['a']['token']) if self.path=='/teacher' else (meta['cookieName'],meta['token'])
   self.send_header('Set-Cookie',cookie[0]+'='+cookie[1]+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600')
   self.send_header('Location',target);self.send_header('Cache-Control','no-store');self.end_headers()
  else:
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers()
   self.wfile.write(b'<title>Petros Phase 6 local review</title><h1>Petros Phase 6 synthetic review</h1><p>Disposable local data. No real pilot or production enablement.</p><p><a href="/student">Student home</a> | <a href="/petros">Source study</a> | <a href="/teacher">Teacher authoring</a></p>')
 def log_message(self,*args):pass
print('Synthetic review gateway listening on http://127.0.0.1:3422',flush=True)
HTTPServer(('127.0.0.1',3422),Review).serve_forever()
