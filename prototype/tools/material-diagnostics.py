import bpy,json
from pathlib import Path
for name in ['sol','woodBase','wall.009','wall.005']:
 o=bpy.data.objects.get(name)
 print(name,[m.name if m else None for m in o.data.materials])
for name in ['woodFloor','woodPlanks','beigeWall']:
 m=bpy.data.materials[name]
 print(name,[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name)for l in m.node_tree.links])
