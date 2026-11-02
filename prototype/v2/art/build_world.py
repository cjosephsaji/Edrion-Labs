import bpy, math, random, os, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/world-v3'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(23)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def linear(v):return ((v+.055)/1.055)**2.4 if v>.04045 else v/12.92
def color(hex):return tuple(linear(int(hex[i:i+2],16)/255) for i in (1,3,5))+(1,)
COLORS={'cream':'#eadbbd','green':'#315744','dark':'#203d35','gold':'#b89558','wood':'#b7825b','rock':'#a99787','mint':'#9bc7b4','orange':'#dc9371','violet':'#b3a1c6','amber':'#dec67c','blue':'#88adbf','glass':'#638e99','eye':'#ecdfc0','pupil':'#173d32','sole':'#d5c7a7'}
M={}
for k,c in COLORS.items():
 m=bpy.data.materials.new(k);m.diffuse_color=color(c);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=color(c);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.68 if k!='glass' else .28;M[k]=m
VM=bpy.data.materials.new('Petros matte palette');VM.use_nodes=True;n=VM.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';VM.node_tree.links.new(n.outputs['Color'],VM.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);VM.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.67
objects=[]
def finish(o,name,mat='cream',bone=None):
 o.name=name;o.data.materials.clear();o.data.materials.append(M[mat]);
 for p in o.data.polygons:p.use_smooth=True
 if bone:
  vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
 objects.append(o);return o
def uv(name,p,s,mat='cream',bone=None,seg=32,rings=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bone)
def box(name,p,s,mat='cream',bevel=.12,bone=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);b=o.modifiers.new('Hand finished rounded edges','BEVEL');b.width=bevel;b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name);return finish(o,name,mat,bone)
def cyl(name,p,r,depth,mat='cream',vertices=48,top=None,bone=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if top is None else top,depth=depth,location=p);o=bpy.context.object;b=o.modifiers.new('Soft machined edge','BEVEL');b.width=min(.06,depth*.12);b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name);return finish(o,name,mat,bone)
def tube(name,a,b,r,mat='green',bone=None):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,24,bone=bone);o.rotation_mode='QUATERNION';o.rotation_quaternion=(b-a).to_track_quat('Z','Y');return o
def curve(name,pts,r,mat='gold',bone=None,closed=False):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for p,co in zip(s.bezier_points,pts):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 s.use_cyclic_u=closed;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);return finish(o,name,mat,bone)
def palette_join(group,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if o.type!='MESH':bpy.ops.object.convert(target='MESH')
  mesh=o.data;attr=mesh.color_attributes.get('Color') or mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
  for poly in mesh.polygons:
   c=mesh.materials[poly.material_index].diffuse_color if mesh.materials else color('#eadbbd')
   for idx in poly.loop_indices:attr.data[idx].color=c
  mesh.materials.clear();mesh.materials.append(VM)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
def export(name,items,animation=False):
 bpy.ops.object.select_all(action='DESELECT')
 for o in items:o.select_set(True)
 bpy.context.view_layer.objects.active=items[0]
 kwargs=dict(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=animation,export_apply=False,export_extras=True,export_yup=True)
 if animation:kwargs.update(export_animation_mode='ACTIONS',export_nla_strips=True)
 bpy.ops.export_scene.gltf(**kwargs);print('EXPORTED',name,flush=True)
 if name in ['rocket','car','ship','light-clock']:bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art'/(name+'.blend')))
def island_rock(name,x,y,z,r):
 verts=[];faces=[];segments=64
 levels=[(0,1),(-.6,.98),(-1.5,.80),(-2.5,.51),(-3.4,.12)]
 for k,(zz,rr) in enumerate(levels):
  for i in range(segments):
   a=i*math.tau/segments;organic=1+.075*math.sin(a*3+x*.2)+.04*math.cos(a*7+y*.4)
   verts.append((x+math.cos(a)*r*rr*organic+.15*k,y+math.sin(a)*r*rr*organic,z+zz+.06*math.sin(a*5)))
 for k in range(len(levels)-1):
  for i in range(segments):j=(i+1)%segments;faces.append((k*segments+i,k*segments+j,(k+1)*segments+j,(k+1)*segments+i))
 faces.append(tuple(reversed(range(segments))));faces.append(tuple((len(levels)-1)*segments+i for i in range(segments)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,'rock');return o
def clear():
 global objects
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);objects=[]
# 3D Petros: project-owned faithful seed/leaf guide. All anatomy modeled, no sprite planes.
uv('jade seed shell',(0,0,1.83),(.88,.56,1.08),'green','Body',48,32)
uv('cream face',(0,-.49,1.94),(.71,.19,.83),'cream','Head',48,32)
curve('inlaid golden face rim',[(.73*math.cos(a),-.54-.025*math.sin(a),1.94+.85*math.sin(a)) for a in [i*math.tau/40 for i in range(40)]],.022,'gold','Head',True)
for x in [-.29,.29]:
 uv('Eye white', (x,-.655,2.13),(.225,.13,.29),'eye','Head')
 uv('Iris',(x,-.765,2.12),(.126,.055,.19),'green','Head')
 uv('Pupil',(x,-.809,2.13),(.073,.027,.137),'pupil','Head')
 uv('Eye glint',(x-.035,-.835,2.205),(.037,.016,.048),'eye','Head',20,12)
 curve('eyebrow',[(x-.17,-.65,2.46),(x-.02,-.698,2.52),(x+.15,-.65,2.47)],.032,'green','Head')
curve('smile',[(-.23,-.677,1.66),(0,-.717,1.56),(.23,-.677,1.66)],.02,'dark','Head')
uv('little nose',(0,-.7,1.91),(.08,.05,.06),'cream','Head')
for sign in [-1,1]:
 tube('upper arm',(sign*.7,.01,2.02),(sign*1.04,-.05,1.75),.115,'green','Arm.L' if sign<0 else 'Arm.R')
 tube('forearm',(sign*1.04,-.05,1.75),(sign*.9,-.25,1.47),.105,'green','Arm.L' if sign<0 else 'Arm.R')
 cyl('wrist cuff',(sign*.9,-.25,1.47),.13,.13,'gold',bone='Arm.L' if sign<0 else 'Arm.R')
 uv('mitten',(sign*.9,-.27,1.35),(.15,.13,.19),'cream','Arm.L' if sign<0 else 'Arm.R')
 uv('thumb',(sign*.79,-.34,1.39),(.075,.07,.11),'cream','Arm.L' if sign<0 else 'Arm.R')
 tube('leg',(sign*.34,.02,.98),(sign*.36,-.01,.29),.115,'green','Leg.L' if sign<0 else 'Leg.R')
 cyl('ankle cuff',(sign*.36,-.01,.3),.16,.14,'gold',bone='Leg.L' if sign<0 else 'Leg.R')
 box('shoe',(sign*.36,-.14,.17),(.42,.65,.29),'green',.13,'Leg.L' if sign<0 else 'Leg.R')
 box('cream sole',(sign*.36,-.17,.075),(.44,.67,.12),'sole',.055,'Leg.L' if sign<0 else 'Leg.R')
 uv('shoe toe',(sign*.36,-.41,.18),(.2,.2,.13),'cream','Leg.L' if sign<0 else 'Leg.R')
# Two sculpted leaves: tapered mesh rather than crossed texture cards.
for k,(cx,angle) in enumerate([(-.05,-.25),(.2,.5)]):
 leaf=uv('leaf crown',(cx,.02,3.01+k*.15),(.21,.10,.49 if k==0 else .31),'green','Head');leaf.rotation_euler[1]=angle
 curve('leaf gold vein',[(cx,.0,2.85+k*.15),(cx+.08,-.08,3.05+k*.15),(cx+.1,-.04,3.27+k*.1)],.011,'gold','Head')
body=palette_join(objects[:],'PetrosBody');objects=[body]
# Audio-driven mouth morph and eyelids are genuine 3D shape keys.
mouth=uv('Mouth',(0,-.708,1.585),(.15,.023,.028),'dark','Head');mouth.shape_key_add(name='Basis');key=mouth.shape_key_add(name='MouthOpen')
for v in key.data:v.co.z=(v.co.z)*3.8-.018
lids=[]
for sign in [-1,1]:
 lid=uv('Lid.L' if sign<0 else 'Lid.R',(sign*.29,-.817,2.39),(.225,.035,.012),'green','Head');lid.shape_key_add(name='Basis');key=lid.shape_key_add(name='Blink')
 for v in key.data:v.co.z=v.co.z*22-.23
 lids.append(lid)
# Vertex colors for the remaining facial meshes, while retaining morph topology.
for o in [mouth,*lids]:
 attr=o.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
 for d in attr.data:d.color=o.data.materials[0].diffuse_color
 o.data.materials.clear();o.data.materials.append(VM)
bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='PetrosRig';bpy.ops.object.mode_set(mode='EDIT');bones=rig.data.edit_bones;bones.remove(bones[0]);
for name,head,tail,parent in [('Root',(0,0,0),(0,0,.35),None),('Body',(0,0,1.05),(0,0,2.3),'Root'),('Head',(0,0,1.9),(0,0,2.7),'Body'),('Arm.L',(-.7,0,2),(-.95,-.1,1.45),'Body'),('Arm.R',(.7,0,2),(.95,-.1,1.45),'Body'),('Leg.L',(-.34,0,.95),(-.36,0,.2),'Root'),('Leg.R',(.34,0,.95),(.36,0,.2),'Root')]:
 b=bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for mesh in [body,mouth,*lids]:
 mesh.parent=rig;mod=mesh.modifiers.new('Petros deformation rig','ARMATURE');mod.object=rig
rig.animation_data_create()
for name in ['Idle','Hover','Walk','Point','Think','Speak','Celebrate','Confused']:
 action=bpy.data.actions.new(name);rig.animation_data.action=action
 for frame in [1,9,17,25,33]:
  t=(frame-1)/32*math.tau
  for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
  rig.pose.bones['Root'].location.z=.025*math.sin(t)
  rig.pose.bones['Body'].rotation_euler.y=.015*math.sin(t)
  if name=='Hover':rig.pose.bones['Root'].location.z=.1+.06*math.sin(t)
  if name=='Walk':
   for key,sig in [('Leg.L',1),('Leg.R',-1)]:rig.pose.bones[key].rotation_euler.x=sig*.28*math.sin(t)
  if name=='Point':rig.pose.bones['Arm.R'].rotation_euler.x=-1.15;rig.pose.bones['Arm.R'].rotation_euler.y=-.4;rig.pose.bones['Head'].rotation_euler.z=-.12
  if name=='Think':rig.pose.bones['Arm.R'].rotation_euler.x=-1.7;rig.pose.bones['Arm.R'].rotation_euler.y=.7;rig.pose.bones['Head'].rotation_euler.y=.13
  if name=='Speak':rig.pose.bones['Head'].rotation_euler.z=.025*math.sin(t*2);rig.pose.bones['Arm.L'].rotation_euler.x=-.14
  if name=='Celebrate':
   rig.pose.bones['Root'].location.z=.1*abs(math.sin(t));rig.pose.bones['Arm.L'].rotation_euler.y=-1.9;rig.pose.bones['Arm.R'].rotation_euler.y=1.9
  if name=='Confused':rig.pose.bones['Head'].rotation_euler.y=.2*math.cos(t);rig.pose.bones['Arm.L'].rotation_euler.x=-.5
  for b in rig.pose.bones:b.keyframe_insert(data_path='rotation_euler',frame=frame);b.keyframe_insert(data_path='location',frame=frame)
 rig.animation_data.action=None
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action)
rig['identity']='Original Petros interpreted as a modeled seed/leaf character; no sprite geometry';rig['animation_states']='Idle, Hover, Walk, Point, Think, Speak, Celebrate, Confused; Blink and MouthOpen morphs'
export('petros',[rig,body,mouth,*lids],True)
# Preserve an editable Blender source and render a character art check.
bpy.context.scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/petros-guide.blend'))
for tr in rig.animation_data.nla_tracks:tr.mute=True
# Standalone hero rocket, detailed with rounded fins, hinged legs, collars and porthole.
clear();cyl('rocket body',(0,0,1.7),.34,2.6,'cream');uv('ogive nose',(0,0,3.02),(.34,.34,.56),'cream');cyl('engine bell',(0,0,.33),.24,.5,'dark',top=.14)
for z in [.65,1.2,2.8]:cyl('metal collar',(0,0,z),.355,.065,'gold')
uv('porthole seal',(0,-.323,2.28),(.19,.065,.24),'green');uv('blue cockpit glass',(0,-.377,2.28),(.14,.03,.18),'glass')
for a in [i*math.tau/4 for i in range(4)]:
 x,y=math.cos(a),math.sin(a);tube('hinged landing leg',(.3*x,.3*y,1.05),(.77*x,.77*y,.12),.045,'green');tube('leg brace',(.3*x,.3*y,.6),(.63*x,.63*y,.31),.025,'gold');box('rounded landing foot',(.78*x,.78*y,.08),(.3,.32,.12),'dark',.05)
 fin=box('swept stabilizer',(.4*x,.4*y,.8),(.1,.5,.8),'green',.065);fin.rotation_euler[2]=a
rocket=palette_join(objects[:],'RocketHero');export('rocket',[rocket]);clear()
# A single-material charming car, designed for GPU instancing.
box('car lower body',(0,0,.23),(.58,1.08,.28),'cream',.12);box('car cabin',(0,-.04,.45),(.46,.6,.27),'green',.12);box('windscreen',(0,-.295,.45),(.36,.035,.17),'glass',.025);box('rear window',(0,.24,.45),(.35,.03,.15),'glass',.025)
for x in [-.29,.29]:
 for y in [-.32,.32]:
  o=cyl('rubber wheel',(x,y,.19),.15,.12,'dark',24);o.rotation_euler[1]=math.pi/2;uv('hubcap',(x*1.16,y,.19),(.016,.085,.085),'gold',seg=16,rings=10)
for x in [-.19,.19]:box('headlamp',(x,-.54,.26),(.12,.035,.075),'eye',.025);box('tail lamp',(x,.54,.26),(.11,.035,.065),'orange',.02)
car=palette_join(objects[:],'ToyCar');export('car',[car]);clear()
# Rounded word capsule and a matching scientific node asset.
pill=box('WordCapsule',(0,0,0),(1.8,.24,.7),'cream',.2);pill=palette_join([pill],'WordCapsule');export('word',[pill]);clear()
node=uv('Node',(0,0,0),(.32,.32,.32),'mint',seg=32,rings=24);node=palette_join([node],'Node');export('node',[node]);clear()
# Matching light clocks and an expressive spacecraft.
for x in [-.55,.55]:tube('clock support',(x,0,.1),(x,0,2.2),.045,'gold')
for z in [.2,2.2]:box('clock mirror',(0,0,z),(1.25,.7,.14),'cream',.065);box('reflector',(0,0,z+.08),(1.05,.55,.025),'glass',.012)
clock=palette_join(objects[:],'LightClockFrame');export('light-clock',[clock]);clear()
uv('spacecraft hull',(0,0,.55),(1.65,.6,.45),'cream');uv('glass cockpit',(.4,-.08,.79),(.65,.45,.28),'glass')
for x in [-1,1]:o=box('spacecraft wing',(x*.8,.25,.38),(1.1,1.5,.12),'green',.13);o.rotation_euler[2]=x*.35
for y in [-.3,.3]:cyl('ship thruster',(-1.3,y,.5),.17,.3,'gold');
ship=palette_join(objects[:],'Spacecraft');export('ship',[ship]);clear()
# The continuous floating archipelago, with authored beveled landmarks and connecting bridges.
positions={'hub':(0,5,.8),'neural':(-15,-5,0),'rocket':(-7,-19,-.6),'attention':(10,-17,.5),'traffic':(18,-1,-.4),'relativity':(11,15,.5)}
# World coordinates convert Y-up to Blender Z-up: (worldX, -worldZ, worldY).
def wp(p):return (p[0],-p[2],p[1])
static=[]
for name,(xx,zz,yy) in positions.items():
 start=len(objects);r=5.8 if name=='hub' else 5.1;accent={'hub':'green','neural':'mint','rocket':'orange','attention':'violet','traffic':'amber','relativity':'blue'}[name]
 island_rock('sculpted floating sandstone',xx,-zz,yy-.1,r)
 cyl('cream island rim',(xx,-zz,yy-.05),r+.06,.38,'cream',96);cyl('matte grass',(xx,-zz,yy+.17),r-.25,.14,'mint',96)
 # Brushed cream central plaza, rounded perimeter cap and accent inlay.
 cyl('plaza',(xx,-zz,yy+.29),r*.7,.15,'cream',96);cyl('place accent inlay',(xx,-zz,yy+.375),r*.7,.025,accent,96)
 # Decorative curved planter; all small shrubs remain solid modeled objects.
 for i in range(5 if name=='hub' else 3):
  a=i*1.7+.4;px,py=xx+math.cos(a)*(r-.8),-zz+math.sin(a)*(r-.8)
  cyl('planter',(px,py,yy+.48),.4,.5,'cream',32,top=.47)
  for j in range(3):uv('sculpted foliage',(px+(j-1)*.16,py,yy+1.0+j*.12),(.38,.33,.4),'green',seg=16,rings=12)
 if name=='hub':
  # A small welcoming pavilion, with rounded arch ribs and an inlaid compass.
  for a in [i*math.tau/6 for i in range(6)]:
   x,y=xx+3.5*math.cos(a),-zz+3.5*math.sin(a);cyl('pavilion column',(x,y,yy+1.8),.16,3,'cream',32);uv('column capital',(x,y,yy+3.25),(.28,.28,.13),'gold',seg=20,rings=12)
  for i in range(6):
   a=i*math.tau/6;b=(i+1)*math.tau/6;curve('pavilion arch',[(xx+3.5*math.cos(a),-zz+3.5*math.sin(a),yy+3.3),(xx+3.7*math.cos((a+b)/2),-zz+3.7*math.sin((a+b)/2),yy+4.15),(xx+3.5*math.cos(b),-zz+3.5*math.sin(b),yy+3.3)],.13,'cream')
 elif name=='rocket':
  cyl('launch deck',(xx,-zz,yy+.55),2.5,.32,'dark',64);cyl('landing circle',(xx,-zz,yy+.73),2.1,.025,'gold',64);cyl('landing inset',(xx,-zz,yy+.75),1.98,.025,'green',64)
 elif name=='traffic':
  # Ring road mesh is genuinely annular, with rounded curbs.
  def ring(name,rad,width,z,mat):
   pts=[(xx+rad*math.cos(a),-zz+rad*math.sin(a),z) for a in [i*math.tau/80 for i in range(80)]];return curve(name,pts,width,mat,closed=True)
  ring('dark ring road',3.05,.5,yy+.52,'dark');ring('cream outer curb',3.57,.055,yy+.59,'cream');ring('cream inner curb',2.53,.055,yy+.59,'cream')
  for i in range(24):
   a=i*math.tau/24;o=box('road dash',(xx+3.05*math.cos(a),-zz+3.05*math.sin(a),yy+.94),(.04,.24,.012),'cream',.015);o.rotation_euler[2]=a
  for i in range(5):
   px=xx+(i%3-1)*.8;py=-zz+(i//3-.5)*1.1;height=.7+(i%3)*.35;box('little city building',(px,py,yy+.4+height/2),(.65,.7,height),['cream','wood','amber'][i%3],.12);box('rounded roof',(px,py,yy+.42+height),(.73,.78,.12),'green',.055)
 elif name=='neural':
  box('rounded workbench',(xx,-zz,yy+1.1),(4.4,1.8,.24),'wood',.14)
  for x in [-1.7,1.7]:
   for y in [-.6,.6]:tube('workbench leg',(xx+x,-zz+y,yy+.4),(xx+x,-zz+y,yy+1.1),.085,'green')
 elif name=='attention':
  # A constellation instrument at the rear, leaving the word stage unobstructed.
  curve('rear constellation arch',[(xx-3,-zz+2.5,yy+.4),(xx,-zz+3.4,yy+4.8),(xx+3,-zz+2.5,yy+.4)],.045,'gold')
 elif name=='relativity':
  # Rear crescent, clear of both clock faces.
  curve('observatory crescent',[(xx+4*math.cos(t),-zz+3.4,yy+.5+4*math.sin(t)) for t in [i*math.pi/24 for i in range(25)]],.045,'gold')
 group=palette_join(objects[start:],name+'-island');static.append(group)
# Tapered arched cream footbridges connect every location to the hub.
for name,(xx,zz,yy) in positions.items():
 if name=='hub':continue
 start=len(objects);a=Vector((0,-5,.8));b=Vector((xx,-zz,yy));direction=(b-a).normalized();a+=direction*5.5;b-=direction*5
 distance=(b-a).length;steps=max(5,int(distance/.65))
 for i in range(steps):
  t=(i+.5)/steps;p=a.lerp(b,t);p.z+=math.sin(t*math.pi)*.75
  o=box('bridge stone',p,(1.25,distance/steps+.06,.18),'cream',.09);o.rotation_euler[2]=-math.atan2(direction.x,direction.y)
 for side in [-1,1]:
  perpendicular=Vector((-direction.y,direction.x,0))*.65*side
  pts=[]
  for i in range(9):
   t=i/8;p=a.lerp(b,t)+perpendicular;p.z+=.5+math.sin(t*math.pi)*.75;pts.append(tuple(p))
  curve('bridge brass handrail',pts,.027,'gold')
  for i in range(5):
   t=i/4;p=a.lerp(b,t)+perpendicular;p.z+=math.sin(t*math.pi)*.75;tube('bridge baluster',p,p+Vector((0,0,.5)),.025,'gold')
 static.append(palette_join(objects[start:],'bridge-'+name))
export('archipelago',static);bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/archipelago.blend'));clear()
# Authored reusable cloud sculpture, not a texture billboard.
for i in range(7):uv('cloud puff',((i-3)*.6,math.sin(i)*.2,math.cos(i)*.15),(.8,.65,.45 if i%2 else .62),'eye',seg=20,rings=12)
cloud=palette_join(objects[:],'Cloud');export('cloud',[cloud]);clear()
print('ALL ASSETS COMPLETE',flush=True)
