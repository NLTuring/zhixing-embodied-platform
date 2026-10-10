import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { MAX_TARGET_OFFSET } from './domain'
import type { Vec3 } from './motion'

export interface Panel {
  name: string
  position: Vec3
  size: Vec3
  rotation?: Vec3
}
export const CABINET = {
  x: 0.3,
  z: 0.44,
  width: 0.38,
  depth: 0.22,
  front: 0.33,
  floor: 1.08,
  ceiling: 1.57,
  doorZ: 0.312,
  doorSlide: 0.405,
  targetZ: 0.39,
  maxOffset: MAX_TARGET_OFFSET,
}
export const TABLE = { position: [0.05, 0.945, 0.28] as Vec3, size: [0.52, 0.043, 0.2] as Vec3 }
export const doorWrist = (door: number): Vec3 => [0.13 + CABINET.doorSlide * door, 1.25, 0.135]
export function cabinetPanels(door: number): Panel[] {
  return [
    { name: '底座', position: [0.3, 0.534, 0.475], size: [0.38, 1.068, 0.15] },
    { name: '左侧板', position: [0.098, 1.325, 0.44], size: [0.024, 0.49, 0.22] },
    { name: '右侧板', position: [0.502, 1.325, 0.44], size: [0.024, 0.49, 0.22] },
    { name: '底板', position: [0.3, 1.068, 0.44], size: [0.428, 0.024, 0.22] },
    { name: '顶板', position: [0.3, 1.582, 0.44], size: [0.428, 0.024, 0.22] },
    { name: '背板', position: [0.3, 1.325, 0.55], size: [0.38, 0.49, 0.018] },
    {
      name: '柜门',
      position: [CABINET.x + CABINET.doorSlide * door, 1.325, CABINET.doorZ],
      size: [0.39, 0.49, 0.018],
    },
    { name: '上滑轨', position: [0.5025, 1.605, 0.312], size: [0.835, 0.018, 0.026] },
    { name: '下滑轨', position: [0.5025, 1.056, 0.312], size: [0.835, 0.018, 0.026] },
  ]
}
export function panelBounds(panel: Panel, inset = 0) {
  const half = new Vector3(...panel.size).multiplyScalar(0.5).addScalar(-inset)
  return {
    box: new Box3(half.clone().negate(), half),
    matrix: new Matrix4().compose(
      new Vector3(...panel.position),
      new Quaternion().setFromEuler(new Euler(...(panel.rotation ?? [0, 0, 0]))),
      new Vector3(1, 1, 1),
    ),
  }
}
