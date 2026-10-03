from pathlib import Path
import hashlib,json
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor,white
from reportlab.lib.enums import TA_LEFT
from pypdf import PdfReader
root=Path('/Volumes/Chris/Edrion Labs')
out=root/'output/pdf/petros-projectile-source-v1.pdf'
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='SourceTitle',fontName='Helvetica-Bold',fontSize=24,leading=28,textColor=HexColor('#163b49'),spaceAfter=12))
styles.add(ParagraphStyle(name='SourceSection',fontName='Helvetica-Bold',fontSize=13,leading=17,textColor=HexColor('#163b49'),spaceBefore=14,spaceAfter=6))
styles.add(ParagraphStyle(name='SourceBody',fontName='Helvetica',fontSize=10.5,leading=15,spaceAfter=8))
styles.add(ParagraphStyle(name='SourceMeta',fontName='Helvetica',fontSize=9,leading=12,textColor=HexColor('#47616a'),spaceAfter=12))
sections=[
('S1. What the model represents','A projectile is treated as a point moving after launch, under a constant downward gravitational acceleration. This model assumes no air resistance, no wind, and the same ground height at launch and landing. It applies only until first ground contact. It does not model bouncing, spin, drag or a powered object. Use metres (m), seconds (s), velocity in metres per second (m/s), and acceleration in metres per second squared (m/s^2).'),
('S2. Separate the two directions','Choose x positive to the right and y positive upward, with the launch point at x = 0 and y = 0. Let vx0 be the horizontal launch velocity, vy0 the upward launch velocity, and g a positive gravity magnitude. In this model horizontal acceleration is zero, while vertical acceleration is -g. The two components share the same elapsed time t, but gravity changes only the vertical component.'),
('S3. Equations of motion','Horizontal position: x(t) = vx0 * t. Horizontal velocity: vx(t) = vx0. Vertical position: y(t) = vy0 * t - 0.5 * g * t^2. Vertical velocity: vy(t) = vy0 - g * t. Speed is the magnitude of the velocity vector: sqrt(vx(t)^2 + vy(t)^2). A velocity component can be zero while the object still has nonzero speed.'),
('S4. Apex and landing','For an upward launch (vy0 > 0), the apex occurs at t = vy0 / g. At the apex vy = 0, vx = vx0, and acceleration remains downward at -g. The maximum height is vy0^2 / (2 * g). Return to the original ground height occurs at t = 2 * vy0 / g, and horizontal displacement then is vx0 times that flight duration. These formulas do not describe unequal launch and landing heights. A launch with vy0 = 0 from level ground has immediate ground contact in this point model.'),
('S5. Worked example','Take vx0 = 4 m/s, vy0 = 12 m/s and g = 10 m/s^2. At t = 1 s, x = 4 m, y = 7 m, vx = 4 m/s and vy = 2 m/s. The apex time is 1.2 s, its height is 7.2 m, and its horizontal position is 4.8 m. At the apex the speed is 4 m/s, not zero. Landing occurs at t = 2.4 s with horizontal displacement 9.6 m. Just before landing the vertical velocity is -12 m/s.'),
('S6. Compare valid cases and non-examples','If only vx0 doubles, every horizontal displacement at the same time doubles, while apex time and maximum height are unchanged. If g doubles with the same launch components, apex time, maximum height and flight duration each halve. If vx0 = 0, the flight is vertical; both velocity components are zero at its apex for an instant, although acceleration is still downward. A feather drifting in wind, a powered drone, or a ball landing on a higher platform is outside the declared model.'),
('S7. Interpret a diagram carefully','A trajectory shows positions, not a force along the path. A velocity arrow shows instantaneous direction and speed on its stated display scale. An acceleration arrow points downward even at the apex. The linked height-versus-time view represents the same state as the motion and component views. A flat-looking trajectory can result from a display scale; read the values and units. Changing a simulation control demonstrates a model response, not a learner achievement.'),
('S8. Explain, check, and acknowledge limits','When explaining a prediction, identify the relevant component, state the equation and units, and check that the time is between launch and first ground contact. Explain why a zero vertical velocity does not usually mean zero total velocity. State when drag, wind, propulsion or different landing height would invalidate this model. A correct number alone does not establish the quality of a written explanation or whether help was received.'),
]
meta='Original project-authored reference | Version 1 | 25 September 2026'
status='Selected for the initial Phase 2 subject. Educator review pending; not approved for learner rollout.'
story=[Paragraph('Projectile motion<br/>One model, two components',styles['SourceTitle']),Paragraph(meta,styles['SourceMeta']),Paragraph(status,styles['SourceMeta'])]
for i,(title,body) in enumerate(sections):
 if i==4:
  story += [PageBreak(),Paragraph('Apply and interpret the model',styles['SourceTitle']),Paragraph('Source version 1 | Worked example and boundaries',styles['SourceMeta'])]
 story += [Paragraph(title,styles['SourceSection']),Paragraph(body,styles['SourceBody'])]
def footer(canvas,doc):
 canvas.saveState();canvas.setStrokeColor(HexColor('#cad5d9'));canvas.line(48,43,547,43)
 canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#47616a'))
 canvas.drawString(48,30,'Petros Phase 2 | Original source v1 | Educator review pending')
 canvas.drawRightString(547,30,str(doc.page));canvas.restoreState()
SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=48,leftMargin=48,topMargin=44,bottomMargin=57,title='Petros projectile motion source v1',author='Edrion Labs project draft',pageCompression=1).build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);assert len(reader.pages)==2,len(reader.pages)
texts=[p.extract_text() for p in reader.pages]
for title,_ in sections: assert sum(title in t for t in texts)==1,title
md='# Projectile motion: one model, two components\n\n'+meta+'\n\n'+status+'\n\n'+''.join('## '+h+'\n\n'+t+'\n\n' for h,t in sections)
(root/'docs/petros-phase2-source/projectile-source-v1.md').write_text(md)
record={'source':'output/pdf/petros-projectile-source-v1.pdf','sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'pages':len(texts),'status':'educator_review_pending','runtimeSourceIdentity':None,'note':'PDF page numbers and section anchors are review references. Runtime object/unit IDs and UTF-16 locators must come from the canonical extraction owner after an authorized import; these are not fabricated here.','sections':[{'section':h.split('.')[0],'page':1 if i<4 else 2} for i,(h,_) in enumerate(sections)]}
(root/'docs/petros-phase2-source/source-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
(root/'docs/verification/petros-phase2-20260922/source-review/extracted-pages.json').write_text(json.dumps(texts,indent=2)+'\n')
print(json.dumps(record))
