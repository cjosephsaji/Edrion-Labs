from pathlib import Path
s=Path(__file__).with_name("build_world.py").read_text()
exec(compile(s[:s.index("# 3D Petros:")]+s[s.index("positions={"):s.index("# Authored reusable cloud")],__file__,"exec"))
