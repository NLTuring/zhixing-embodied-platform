"""Convert the supplied OBJ into a lightweight continuously skinned demonstration GLB.

Run: py tools/prepare_robot.py
Dependency: py -m pip install --target tools/.asset-deps fast-simplification --no-deps
Joint placements are prototype geometry annotations, not calibrated robot data.
"""
from pathlib import Path
import io
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / '.asset-deps'))
import numpy as np
import trimesh
from PIL import Image
from scipy.spatial import cKDTree
import fast_simplification

OUT = ROOT / 'web' / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
archive = ROOT / '3Dmodels' / '机器人_obj.rar'
prefix = 'JGI54551683356_obj/'
def read(member):
    return subprocess.check_output(['tar', '-xOf', str(archive), prefix + member])

source = trimesh.load(io.BytesIO(read('source/3d66.com_JGI54551683356.obj')), file_type='obj', process=False)
if isinstance(source, trimesh.Scene):
    source = trimesh.util.concatenate(tuple(source.geometry.values()))
verts = np.asarray(source.vertices).copy()
center = (verts.min(axis=0) + verts.max(axis=0)) / 2
verts[:, 0] -= center[0]
verts[:, 2] -= center[2]
verts[:, 1] -= verts[:, 1].min()
verts *= .01
texture = np.asarray(Image.open(io.BytesIO(read('textures/3d66-export-JGI54551683356-001.jpg'))).convert('RGB'))
uv = np.asarray(source.visual.uv)
tx = np.clip((uv[:, 0] * (texture.shape[1] - 1)).astype(int), 0, texture.shape[1] - 1)
ty = np.clip(((1 - uv[:, 1]) * (texture.shape[0] - 1)).astype(int), 0, texture.shape[0] - 1)
colors = texture[ty, tx]
mesh = trimesh.Trimesh(vertices=verts, faces=source.faces, process=False)
mesh.merge_vertices()
print('Simplifying original geometry...', flush=True)
points, faces = fast_simplification.simplify(np.asarray(mesh.vertices, dtype=np.float64), np.asarray(mesh.faces, dtype=np.int32), target_count=80000)
nearest = cKDTree(verts).query(points, workers=-1)[1]
rgba = np.column_stack([colors[nearest], np.full(len(points), 255, dtype=np.uint8)])
from skin_robot import export_skin
export_skin(points, faces, rgba, OUT)
