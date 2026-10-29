"""Download explicitly selected CC0 assets; never query a remote service at runtime."""
import json,subprocess,hashlib,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'assets'/'realism'
UA='PetrosShowcaseAssetPreparation/1.0 (local non-live tooling)'
ASSETS=['wooden_display_shelves_01','wooden_bookshelf_worn','book_encyclopedia_set_01','decorative_book_set_01','SchoolDesk_01','SchoolChair_01','WoodenTable_01','desk_lamp_arm_01','potted_plant_02','modern_wooden_cabinet','mid_century_lounge_chair']
def fetch(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():subprocess.run(['curl','-fLsS','--retry','2','-A',UA,url,'-o',str(path)],check=True)
for asset in ASSETS:
 for kind in ['files','info']:fetch('https://api.polyhaven.com/'+kind+'/'+asset,ROOT/'metadata'/f'{asset}.{kind}.json')
 files=json.loads((ROOT/'metadata'/f'{asset}.files.json').read_text());info=json.loads((ROOT/'metadata'/f'{asset}.info.json').read_text());
 if 'gltf' not in files:print(asset,'no glTF: deferred',list(files),flush=True);continue
 res='2k' if '2k' in files['gltf'] else '1k';entry=files['gltf'][res]['gltf'];folder=ROOT/'source'/asset
 main=folder/(asset+'.gltf');fetch(entry['url'],main)
 if entry.get('md5') and hashlib.md5(main.read_bytes()).hexdigest()!=entry['md5']:raise ValueError('Integrity failed '+str(main))
 for rel,part in entry['include'].items():
  target=folder/rel;fetch(part['url'],target)
  if hashlib.md5(target.read_bytes()).hexdigest()!=part['md5']:raise ValueError('Integrity failed '+str(target))
 print(asset,res,info.get('polycount'),sum(p.stat().st_size for p in folder.rglob('*') if p.is_file()),flush=True)
 time.sleep(.2)

for asset in ['studio_small_03','spruit_sunrise']:
 for kind in ['files','info']:fetch('https://api.polyhaven.com/'+kind+'/'+asset,ROOT/'metadata'/f'{asset}.{kind}.json')
 entry=json.loads((ROOT/'metadata'/f'{asset}.files.json').read_text())['hdri']['1k']['hdr']
 target=ROOT/'runtime'/f'{asset}.hdr';fetch(entry['url'],target)
 if hashlib.md5(target.read_bytes()).hexdigest()!=entry['md5']:raise ValueError('Integrity failed '+str(target))
