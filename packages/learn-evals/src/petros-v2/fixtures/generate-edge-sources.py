"""Additional original CC0 sources; native structures and honest rejected/partial cases."""
from pathlib import Path
from reportlab.pdfgen import canvas
import zipfile,json,hashlib
r=Path(__file__).parent/'sources'
c=canvas.Canvas(str(r/'structures.pdf'),pagesize=(612,792),invariant=1)
c.setFont('Helvetica-Bold',24);c.drawString(40,750,'Source structure edge cases')
c.setFont('Helvetica',12)
for i,t in enumerate(['1. Inspect the physical source.','2. Review proposed relationships.','3. Keep academic approval separate.']):c.drawString(40,710-i*24,t)
c.drawString(40,610,'Chart below has axes, labels and vector paths.')
c.line(90,350,90,560);c.line(90,350,480,350)
for x,h,label in [(140,90,'Group A'),(280,150,'Group B')]:c.rect(x,350,80,h);c.drawString(x,330,label)
c.drawString(46,545,'Units');c.drawString(380,305,'Category')
c.setFont('Courier',12);c.drawString(40,250,'x = 2 * y');c.drawString(40,215,'return x;')
c.save()
c=canvas.Canvas(str(r/'rotated.pdf'),pagesize=(612,792),invariant=1);c.translate(180,200);c.rotate(90);c.drawString(0,0,'Rotated source reading order is uncertain.');c.save()
c=canvas.Canvas(str(r/'huge-dimensions.pdf'),pagesize=(20000,20000),invariant=1);c.drawString(40,740,'Dimensions exceed pilot limit.');c.save()
with zipfile.ZipFile(r/'cloud-models.pptx') as base:
 for name in ['ambiguous-arrow.pptx','hidden-slide.pptx','grouped-shapes.pptx','external-link.pptx','macro.pptx','embedded-executable.pptx']:
  with zipfile.ZipFile(r/name,'w',zipfile.ZIP_DEFLATED) as out:
   for p in base.namelist():
    b=base.read(p)
    if name=='ambiguous-arrow.pptx' and p=='ppt/slides/slide4.xml':b=b.replace(b'<a:tailEnd type="triangle"/>',b'')
    if name=='hidden-slide.pptx' and p=='ppt/slides/slide1.xml':b=b.replace(b'<p:sld ',b'<p:sld show="0" ',1)
    if name=='grouped-shapes.pptx' and p=='ppt/slides/slide1.xml':b=b.replace(b'</p:spTree>',b'<p:grpSp><p:nvGrpSpPr><p:cNvPr id="98" name="Group"/></p:nvGrpSpPr><p:grpSpPr/></p:grpSp></p:spTree>')
    if name=='external-link.pptx' and p=='ppt/slides/_rels/slide5.xml.rels':b=b.replace(b'</Relationships>',b'<Relationship Id="externalFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.test/untrusted.png" TargetMode="External"/></Relationships>')
    out.writestr(zipfile.ZipInfo(p,(2026,10,12,0,0,0)),b,compress_type=zipfile.ZIP_DEFLATED)
   if name=='macro.pptx':out.writestr('ppt/vbaProject.bin',b'not an executable macro; rejection fixture')
   if name=='embedded-executable.pptx':out.writestr('ppt/media/untrusted.exe',b'not executable; rejection fixture')
m=r.parent/'source-manifest.json';d=json.loads(m.read_text())
for f in r.iterdir():
 if not f.is_file() or f.name.startswith('._'):continue
 d[f.name]={'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size,'license':'CC0-1.0','labelOrigin':'Original engineering author; independent academic review OPEN'}
m.write_text(json.dumps(d,indent=2)+'\n')
print(len(d),'original local sources')
