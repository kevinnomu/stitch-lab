#!/usr/bin/env python3
"""Build the standalone Stitch Lab HTML from its local source. No network access."""
from pathlib import Path
import re,sys
root=Path(__file__).resolve().parent
out=root.parent/'index.html'
text=(root/'template.html').read_text()
def load(m):
 p=(root/m.group(1)).resolve()
 if not p.is_relative_to(root) or not p.is_file():raise ValueError('Missing or invalid source: '+m.group(1))
 return p.read_text()
result=re.sub(r'@@FERVOR_SOURCE:([A-Za-z0-9_./-]+)@@',load,text)
if '--check' in sys.argv:
 if not out.exists() or out.read_text()!=result:raise SystemExit('Source build does not match release HTML')
 print('Stitch Lab source build verified')
else:
 out.write_text(result)
 print('Built',out)
