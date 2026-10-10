"""Export the supplied surface as one continuous, smoothly bound glTF skin.

The OBJ has no authored rig. Joint centers below are measured from its visible
mechanical joints; they are visual annotations, not hardware calibration.
"""
import json
import struct
import numpy as np
import trimesh
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import spsolve


def export_skin(points, faces, rgba, output):
    pivots = {'root': [0, 0, 0], 'torso': [0, 1.02, -.04], 'head': [0, 1.49, -.07]}
    parents = {'root': None, 'torso': 'root', 'head': 'torso'}
    for side, sign in [('L', 1), ('R', -1)]:
        for name, pos, parent in [
            ('Upper', [.205, 1.415, -.105], 'torso'),
            ('Lower', [.225, 1.19, -.12], f'arm{side}Upper'),
            ('hand', [.268, .925, -.025], f'arm{side}Lower'),
            ('finger', [.276, .842, .005], f'hand{side}'),
        ]:
            key = f'arm{side}{name}' if name in ['Upper', 'Lower'] else f'{name}{side}'
            pivots[key] = [pos[0] * sign, pos[1], pos[2]]
            parents[key] = parent
    names = list(pivots)
    weights = np.zeros((len(points), len(names)), dtype=np.float32)
    x, y, z = points.T
    edges = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    edge_weights = 1/np.maximum(np.linalg.norm(points[edges[:, 0]]-points[edges[:, 1]], axis=1), .001)
    graph = coo_matrix((np.tile(edge_weights, 2),
                       (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])),
                      shape=(len(points), len(points))).tocsr()
    laplace = diags(np.asarray(graph.sum(axis=1)).ravel())-graph
    def smooth(a, b, value):
        t = np.clip((value-a)/(b-a), 0, 1)
        return t*t*(3-2*t)
    # Keep the pelvis and legs still, with a continuous waist transition.
    torso = smooth(.97, 1.055, y)
    head = smooth(1.46, 1.515, y)
    weights[:, names.index('root')] = 1-torso
    weights[:, names.index('torso')] = torso*(1-head)
    weights[:, names.index('head')] = head
    for side, sign in [('L', 1), ('R', -1)]:
        # Harmonic weights follow surface connectivity around the armpit.
        # A coordinate cut alone incorrectly pulls the lateral chest plate.
        sx = x*sign
        fixed_body = (sx < .14) | (y < .74) | (y > 1.5) | ((y > 1.15) & (z > -.035) & (sx < .19)) | ((y < .94) & (sx < .20))
        fixed_arm = (sx > .20) & (y > .78) & (y < 1.44) & ((y < 1.2) | (z < -.04)) & ~fixed_body
        unknown = ~(fixed_body | fixed_arm)
        arm = np.zeros(len(points))
        arm[fixed_arm] = 1
        # The diagonal term anchors tiny disconnected source fragments.
        matrix = laplace[unknown][:, unknown] + diags(np.full(unknown.sum(), 1e-6))
        arm[unknown] = spsolve(matrix, -laplace[unknown][:, fixed_arm] @ np.ones(fixed_arm.sum()))
        arm = np.clip(arm, 0, 1)
        elbow = 1-smooth(1.15, 1.225, y)
        wrist = 1-smooth(.905, .945, y)
        fingers = 1-smooth(.815, .855, y)
        weights *= (1-arm[:, None])
        weights[:, names.index(f'arm{side}Upper')] = arm*(1-elbow)
        weights[:, names.index(f'arm{side}Lower')] = arm*elbow*(1-wrist)
        weights[:, names.index(f'hand{side}')] = arm*elbow*wrist*(1-fingers)
        weights[:, names.index(f'finger{side}')] = arm*elbow*wrist*fingers
    joints = np.argsort(weights, axis=1)[:, -4:]
    values = np.take_along_axis(weights, joints, axis=1)
    values /= values.sum(axis=1, keepdims=True)
    mesh = trimesh.Trimesh(vertices=points, faces=faces, process=False)
    data = bytearray()
    views, accessors = [], []
    def add(array, component, kind, bounds=False, normalized=False):
        while len(data) % 4:
            data.append(0)
        raw = array.tobytes()
        views.append({'buffer': 0, 'byteOffset': len(data), 'byteLength': len(raw)})
        data.extend(raw)
        acc = {'bufferView': len(views)-1, 'componentType': component, 'count': len(array), 'type': kind}
        if bounds:
            acc.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        if normalized:
            acc['normalized'] = True
        accessors.append(acc)
        return len(accessors)-1
    attributes = {
        'POSITION': add(points.astype('<f4'), 5126, 'VEC3', True),
        'NORMAL': add(np.asarray(mesh.vertex_normals).astype('<f4'), 5126, 'VEC3'),
        'COLOR_0': add(rgba.astype('u1'), 5121, 'VEC4', normalized=True),
        'JOINTS_0': add(joints.astype('<u2'), 5123, 'VEC4'),
        'WEIGHTS_0': add(values.astype('<f4'), 5126, 'VEC4'),
    }
    indices = add(faces.flatten().astype('<u4'), 5125, 'SCALAR')
    inverse = np.tile(np.eye(4), (len(names), 1, 1))
    for i, name in enumerate(names):
        inverse[i, :3, 3] = -np.asarray(pivots[name])
    bind = add(inverse.transpose(0, 2, 1).reshape(-1, 16).astype('<f4'), 5126, 'MAT4')
    nodes = []
    for name in names:
        parent = parents[name]
        offset = np.asarray(pivots[name])-np.asarray(pivots[parent] if parent else [0, 0, 0])
        nodes.append({'name': name, 'translation': offset.tolist(), 'children': [names.index(n) for n in names if parents[n] == name]})
    nodes.append({'name': 'robotSurface', 'mesh': 0, 'skin': 0})
    doc = {
        'asset': {'version': '2.0', 'generator': 'Zhixing continuous skin'},
        'scene': 0, 'scenes': [{'nodes': [0, len(names)]}], 'nodes': nodes,
        'skins': [{'joints': list(range(len(names))), 'inverseBindMatrices': bind, 'skeleton': 0}],
        'meshes': [{'primitives': [{'attributes': attributes, 'indices': indices, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'metallicFactor': .48, 'roughnessFactor': .47}}],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(data)}],
    }
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    data.extend(b'\0' * (-len(data) % 4))
    glb = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(data))
    glb += struct.pack('<II', len(encoded), 0x4e4f534a)+encoded
    glb += struct.pack('<II', len(data), 0x004e4942)+data
    (output/'zhixing-robot.glb').write_bytes(glb)
    metadata = {'source': '机器人_obj.rar', 'units': 'meters', 'up': '+Y', 'front': '+Z', 'leftSide': '+X',
                'rigType': 'continuous weighted skin', 'faces': len(faces), 'vertices': len(points),
                'bytes': len(glb), 'pivots': pivots, 'parents': parents}
    (output/'robot-rig.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(metadata, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    raise SystemExit('Run py tools/prepare_robot.py to convert and bind the supplied OBJ.')
