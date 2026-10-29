"""Recover test-overwritten historical ZIP/JSON bytes ONLY when their captured SHA-256 matches exactly."""
import pathlib,json,hashlib,struct
root=pathlib.Path(__file__).resolve().parents[3]
out=root/'docs/verification/petros-v2/m2fa-evidence'
baseline=json.loads((out/'starting-hashes.json').read_text())
visual=root/'docs/verification/petros-v2/m2g-2026-10-13/visual'
results=[]
for p in sorted(visual.glob('*.pptx')):
 if p.name.startswith('._'):continue
 key=str(p.relative_to(root));target=baseline[key];current=p.read_bytes()
 if hashlib.sha256(current).hexdigest()==target:continue
 (out/'historical-visual-regression-generated').mkdir(exist_ok=True)
 (out/'historical-visual-regression-generated'/p.name).write_bytes(current)
 positions={};end=len(current)-22;at=struct.unpack_from('<I',current,end+16)[0]
 while at<end:
  if current[at:at+4]!=b'PK\x01\x02':raise RuntimeError('Invalid central directory')
  n,x,c=struct.unpack_from('<HHH',current,at+28);name=current[at+46:at+46+n].decode();local=struct.unpack_from('<I',current,at+42)[0]
  if name in ['ppt/media/image1.png','ppt/slides/slide5.xml','ppt/','ppt/media/','ppt/slides/']:
   positions[name]=[local+10,at+12]
  at+=46+n+x+c
 data=bytearray(current);found=None
 image=positions['ppt/media/image1.png']+positions.get('ppt/',[])+positions.get('ppt/media/',[]);slide=positions.get('ppt/slides/slide5.xml',[])+positions.get('ppt/slides/',[])
 # JSZip changes only DOS timestamps on replaced entries. Everything else is preserved.
 date=struct.unpack_from('<H',current,image[0]+2)[0]
 # Historical suite receipts bound the ordinary first search; the full DOS day is fallback.
 preferred=list(range(13*1800,14*1800));preferredSet=set(preferred);others=[x for x in range(43200) if x not in preferredSet]
 for tick in preferred+others:
  hour=tick//1800;minute=(tick%1800)//30;second=(tick%30)*2
  value=(hour<<11)|(minute<<5)|(second//2)
  for pos in image:struct.pack_into('<HH',data,pos,value,date)
  deltas=[None] if p.stem!='move-crop' else [0,1,-1,2,-2]
  for delta in deltas:
   if delta is not None:
    shifted=(tick+delta)%43200;sv=((shifted//1800)<<11)|(((shifted%1800)//30)<<5)|(shifted%30)
    for pos in slide:struct.pack_into('<HH',data,pos,sv,date)
   if hashlib.sha256(data).hexdigest()==target:found=bytes(data);break
  if found:break
 if not found:raise RuntimeError('Original ZIP hash not recovered: '+p.name)
 p.write_bytes(found)
 j=p.with_suffix('.json');old=j.read_bytes();(out/'historical-visual-regression-generated'/j.name).write_bytes(old)
 expected=baseline[str(j.relative_to(root))]
 previous=hashlib.sha256(current).hexdigest()
 restored=old.replace(previous.encode(),target.encode())
 if hashlib.sha256(restored).hexdigest()!=expected:raise RuntimeError('Original JSON hash not recovered: '+j.name)
 j.write_bytes(restored)
 results.append({'file':key,'zipHashMatchesStartingBytes':True,'jsonHashMatchesStartingBytes':True,'recovery':'Exact captured SHA-256 matched after restoring JSZip timestamp bytes and corresponding source hash pins'})
(out/'historical-visual-restoration.json').write_text(json.dumps(results,indent=2)+'\n')
print('Restored',len(results),'ZIPs and matching JSON files with exact baseline hashes')
