import bpy,math,random
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for x,y,z,r in [(-2.1,0,0,.75),(-1.2,.05,.25,1.0),(-.2,0,.65,1.25),(.9,.1,.4,1.1),(1.9,0,.05,.78),(-.7,-.1,-.25,.8),(.6,-.05,-.25,.8)]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=(x,y,z));o=bpy.context.object;o.scale=(r,r*.67,r*.64)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.join();o=bpy.context.object;mod=o.modifiers.new('Sculpted cloud silhouette','REMESH');mod.mode='VOXEL';mod.voxel_size=.14;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name);mod=o.modifiers.new('Soft puff seams','SMOOTH');mod.factor=1.2;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name);mod=o.modifiers.new('Cloud LOD','DECIMATE');mod.ratio=.5;bpy.ops.object.modifier_apply(modifier=mod.name)
for p in o.data.polygons:p.use_smooth=True
m=bpy.data.materials.new('Warm cloud');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.64,.61,.53,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95;o.data.materials.append(m);o.name='Cloud';bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/world-v3/cloud.glb'),export_format='GLB',use_selection=True,export_animations=False)
