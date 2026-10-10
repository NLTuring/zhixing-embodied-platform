import * as THREE from 'three'
import type { MotionFrame } from './motion'

export function createRobotRig(model: THREE.Object3D) {
  const upper = model.getObjectByName('armLUpper')!
  const lower = model.getObjectByName('armLLower')!
  const hand = model.getObjectByName('handL')!
  return {
    upper,
    lower,
    hand,
    torso: model.getObjectByName('torso')!,
    head: model.getObjectByName('head')!,
    finger: model.getObjectByName('fingerL'),
    upperRest: lower.position.clone(),
    lowerRest: hand.position.clone(),
    wristRest: hand.getWorldPosition(new THREE.Vector3()),
  }
}
export function applyRobotPose(
  model: THREE.Object3D,
  rig: ReturnType<typeof createRobotRig>,
  frame: MotionFrame,
) {
  const { upper, lower, hand, torso, head, finger, upperRest, lowerRest } = rig
  const target = new THREE.Vector3(...frame.hand)
  const engagement = THREE.MathUtils.clamp(target.distanceTo(rig.wristRest) / 0.22, 0, 1)
  const engaged = engagement * engagement * (3 - 2 * engagement)
  torso.rotation.z = 0
  torso.rotation.x = 0.1 * engaged
  head.rotation.y = 0.12 * engaged
  head.rotation.x = 0.1 * engaged
  upper.quaternion.identity()
  lower.quaternion.identity()
  hand.quaternion.identity()
  model.updateMatrixWorld(true)
  const shoulder = upper.getWorldPosition(new THREE.Vector3())
  const delta = target.clone().sub(shoulder)
  const a = upperRest.length(),
    b = lowerRest.length()
  const length = THREE.MathUtils.clamp(delta.length(), Math.abs(a - b) + 0.0001, a + b - 0.0001)
  const direction = delta.normalize()
  const along = (a * a - b * b + length * length) / (2 * length)
  const restElbow = lower.getWorldPosition(new THREE.Vector3()).sub(shoulder)
  const restNormal = restElbow.addScaledVector(direction, -restElbow.dot(direction)).normalize()
  const normal = restNormal.lerp(new THREE.Vector3(0.65, -0.6, -0.25).normalize(), engaged)
  normal.addScaledVector(direction, -normal.dot(direction)).normalize()
  const elbow = shoulder
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(normal, Math.sqrt(Math.max(0, a * a - along * along)))
  const parentQ = upper.parent!.getWorldQuaternion(new THREE.Quaternion())
  const upperDirection = elbow
    .clone()
    .sub(shoulder)
    .normalize()
    .applyQuaternion(parentQ.clone().invert())
  upper.quaternion.setFromUnitVectors(upperRest.clone().normalize(), upperDirection)
  model.updateMatrixWorld(true)
  const elbowActual = lower.getWorldPosition(new THREE.Vector3())
  const wrist = shoulder.clone().addScaledVector(direction, length)
  const upperWorldQ = upper.getWorldQuaternion(new THREE.Quaternion())
  const lowerDirection = wrist
    .sub(elbowActual)
    .normalize()
    .applyQuaternion(upperWorldQ.clone().invert())
  lower.quaternion.setFromUnitVectors(lowerRest.clone().normalize(), lowerDirection)
  model.updateMatrixWorld(true)
  const wristWorld = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    frame.handPitch,
  )
  hand.quaternion.copy(
    lower.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wristWorld),
  )
  if (finger) finger.rotation.z = frame.grip * -0.4
  model.updateMatrixWorld(true)
}
