import bpy, os, sys, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/world-v3'
for asset,source in [('petros','petros-guide'),('rocket','rocket'),('car','car'),('ship','ship')]:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art'/(source+'.blend')))
 for o in bpy.context.scene.objects:
  if o.animation_data:
   o.animation_data.action=None
   for t in o.animation_data.nla_tracks:t.mute=True
  if o.type=='ARMATURE':
   for b in o.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
 mesh=bpy.data.objects.get('PetrosBody') if asset=='petros' else next(o for o in bpy.context.scene.objects if o.type=='MESH')
 bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
 mesh.data.uv_layers.active.name='HeroUV'
 mat=mesh.data.materials[0].copy();mesh.data.materials[0]=mat;mat.use_nodes=True
 img=bpy.data.images.new(asset+' baked AO 2K',width=2048,height=2048,alpha=False);img.colorspace_settings.name='Non-Color'
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.select=True;mat.node_tree.nodes.active=tex
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.bake.margin=8
 bpy.ops.object.bake(type='AO');img.filepath_raw=str(ROOT/'art'/(asset+'-ao-2k.png'));img.file_format='PNG';img.save()
 group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket('Occlusion',socket_type='NodeSocketFloat');group.nodes.new('NodeGroupOutput');group.nodes.new('NodeGroupInput')
 node=mat.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=group;mat.node_tree.links.new(tex.outputs['Color'],node.inputs['Occlusion'])
 bpy.ops.object.select_all(action='DESELECT')
 for o in scene.objects:
  if o.type in ['MESH','ARMATURE']:o.select_set(True)
 kwargs=dict(filepath=str(OUT/(asset+'.glb')),export_format='GLB',use_selection=True,export_animations=asset=='petros',export_apply=False)
 if asset=='petros':kwargs.update(export_animation_mode='ACTIONS',export_nla_strips=True)
 bpy.ops.export_scene.gltf(**kwargs);print('BAKED 2K AO',asset,flush=True)
 if asset=='petros':
  # Render an actual modeled character art check before using it in the world.
  for tr in bpy.data.objects['PetrosRig'].animation_data.nla_tracks:tr.mute=True
  bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Preview floor';m=bpy.data.materials.new('Preview sand');m.diffuse_color=(.5,.43,.33,1);floor.data.materials.append(m)
  world=bpy.data.worlds.new('Golden preview');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.54,.49,.42,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
  for p,power,size in [((3,-4,7),850,5),((-4,-2,4),350,4)]:
   data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,1.7))-o.location).to_track_quat('-Z','Y').to_euler()
  d=bpy.data.cameras.new('Preview camera');c=bpy.data.objects.new('Preview camera',d);scene.collection.objects.link(c);c.location=(4,-8,4);c.rotation_euler=(Vector((0,0,1.65))-c.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=4.6;scene.camera=c;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.filepath=str(ROOT/'evidence/world-rebuild/petros-model-preview.png');bpy.ops.render.render(write_still=True)
