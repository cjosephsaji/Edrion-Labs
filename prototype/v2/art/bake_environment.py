import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/archipelago.blend'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
mat=meshes[0].data.materials[0];img=bpy.data.images.new('Archipelago baked occlusion',width=2048,height=2048,alpha=False);img.colorspace_settings.name='Non-Color'
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;mat.node_tree.nodes.active=tex
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.bake.margin=4
bpy.ops.object.bake(type='AO');img.filepath_raw=str(ROOT/'art/archipelago-ao-2k.png');img.file_format='PNG';img.save()
group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket('Occlusion',socket_type='NodeSocketFloat');group.nodes.new('NodeGroupOutput');group.nodes.new('NodeGroupInput');node=mat.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=group;mat.node_tree.links.new(tex.outputs['Color'],node.inputs['Occlusion'])
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/world-v3/archipelago.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=False)
