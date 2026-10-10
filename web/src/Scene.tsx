import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Lightformer,
  Line,
  OrbitControls,
  RoundedBox,
  useGLTF,
} from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { applyRobotPose, createRobotRig } from './robotPose'
import { CABINET, TABLE, cabinetPanels } from './sceneLayout'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { type CupId, type ObjectId, type Plan, type SceneSettings } from './domain'
import { sampleCupPath, sampleMotion, type MotionFrame, type Vec3 } from './motion'

interface Props {
  plan: Plan | null
  referencePlan?: Plan | null
  time: number
  settings: SceneSettings
  selected: ObjectId | null
  onSelect: (id: ObjectId) => void
  onTargetChange: (offset: number) => void
  comparison: boolean
  reach: boolean
  reset: number
  locked: boolean
  robotOnly?: boolean
}

// A new cache key also replaces the previous rigid asset in an already-open tab.
const ROBOT_MODEL_URL = '/models/zhixing-robot.glb?rig=continuous-v2'

function Robot({ frame }: { frame: MotionFrame }) {
  const { scene } = useGLTF(ROBOT_MODEL_URL)
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene)
    clone.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true
        node.receiveShadow = true
        const material = node.material as THREE.MeshStandardMaterial
        material.metalness = 0.48
        material.roughness = 0.47
      }
    })
    return clone
  }, [scene])
  const rig = useMemo(() => createRobotRig(model), [model])
  useFrame(() => applyRobotPose(model, rig, frame))
  return <primitive object={model} dispose={null} />
}

function Cup({
  id,
  position,
  selected,
  onSelect,
}: {
  id: CupId
  position: Vec3
  selected: boolean
  onSelect: Props['onSelect']
}) {
  const color = id === 'cup-blue' ? '#3769e8' : '#e7edf5'
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect(id)
  }
  return (
    <group position={position} onClick={click}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.037, 0.031, 0.107, 36, 1, true]} />
        <meshStandardMaterial
          color={color}
          roughness={0.24}
          metalness={0.12}
          side={THREE.DoubleSide}
          emissive={selected ? '#174be0' : '#000000'}
          emissiveIntensity={0.1}
        />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.031, 0.031, 0.006, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.054, 0]}>
        <torusGeometry args={[0.035, 0.003, 8, 36]} />
        <meshStandardMaterial color={id === 'cup-blue' ? '#97b6ff' : '#ffffff'} roughness={0.2} />
      </mesh>
      <mesh castShadow position={[0.042, 0.002, 0]}>
        <torusGeometry args={[0.024, 0.0055, 10, 24, Math.PI * 1.55]} />
        <meshStandardMaterial color={color} roughness={0.24} />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.057, 0]}>
          <ringGeometry args={[0.049, 0.056, 48]} />
          <meshBasicMaterial color="#396cff" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

function Furniture({
  frame,
  settings,
  onSelect,
}: {
  frame: MotionFrame
  settings: SceneSettings
  onSelect: Props['onSelect']
}) {
  return (
    <>
      <RoundedBox
        position={TABLE.position}
        args={TABLE.size}
        radius={0.014}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#f9fbfd" roughness={0.35} metalness={0.15} />
      </RoundedBox>
      {[
        [-0.18, 0.21],
        [-0.18, 0.35],
        [0.28, 0.21],
        [0.28, 0.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.462, z]} castShadow>
          <boxGeometry args={[0.026, 0.924, 0.026]} />
          <meshStandardMaterial color="#aab5c4" metalness={0.65} roughness={0.3} />
        </mesh>
      ))}
      <group
        onClick={(e) => {
          e.stopPropagation()
          onSelect('cabinet')
        }}
      >
        {cabinetPanels(frame.door).map((panel) => (
          <mesh
            key={panel.name}
            name={panel.name}
            position={panel.position}
            rotation={panel.rotation}
            castShadow
            receiveShadow
          >
            <boxGeometry args={panel.size} />
            {panel.name === '柜门' ? (
              <meshPhysicalMaterial
                color="#c6d8ec"
                transparent
                opacity={0.22}
                roughness={0.25}
                metalness={0.15}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            ) : (
              <meshStandardMaterial
                color={
                  panel.name === '背板'
                    ? '#b7c4d6'
                    : panel.name.includes('滑轨')
                      ? '#98aabd'
                      : '#e9edf2'
                }
                roughness={0.4}
                metalness={0.2}
              />
            )}
          </mesh>
        ))}
        {[0.3, 0.6, 0.9].map((y) => (
          <mesh key={y} position={[CABINET.x, y, 0.399]}>
            <boxGeometry args={[0.34, 0.003, 0.002]} />
            <meshBasicMaterial color="#b6c1cf" />
          </mesh>
        ))}
        <group position={[CABINET.x + CABINET.doorSlide * frame.door, 1.325, CABINET.doorZ]}>
          {[-0.195, 0.195].map((x) => (
            <mesh key={x} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.012, 0.49, 0.022]} />
              <meshStandardMaterial color="#dfe6ef" metalness={0.55} roughness={0.3} />
            </mesh>
          ))}
          {[-0.245, 0.245].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <boxGeometry args={[0.39, 0.012, 0.022]} />
              <meshStandardMaterial color="#dfe6ef" metalness={0.55} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[-0.17, -0.075, -0.035]} castShadow>
            <boxGeometry args={[0.018, 0.09, 0.025]} />
            <meshStandardMaterial color="#718399" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
        {settings.obstacle && (
          <mesh position={[CABINET.x, 1.103, 0.332]} castShadow>
            <boxGeometry args={[0.36, 0.045, 0.025]} />
            <meshStandardMaterial color="#b6c3d6" metalness={0.55} roughness={0.27} />
          </mesh>
        )}
      </group>
    </>
  )
}

function Target({
  offset,
  onChange,
  onSelect,
  locked,
}: {
  offset: number
  onChange: Props['onTargetChange']
  onSelect: Props['onSelect']
  locked: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const { controls } = useThree()
  useEffect(() => {
    if (controls) (controls as OrbitControlsImpl).enabled = !dragging
    return () => {
      if (controls) (controls as OrbitControlsImpl).enabled = true
    }
  }, [dragging, controls])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.083), [])
  return (
    <mesh
      position={[CABINET.x + offset, 1.083, CABINET.targetZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect('target')
        if (locked) return
        setDragging(true)
        ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        setDragging(false)
        ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        e.stopPropagation()
        const hit = e.ray.intersectPlane(plane, new THREE.Vector3())
        if (hit)
          onChange(Math.max(-CABINET.maxOffset, Math.min(CABINET.maxOffset, hit.x - CABINET.x)))
      }}
    >
      <planeGeometry args={[0.29, 0.14]} />
      <meshBasicMaterial
        color="#2d70e8"
        transparent
        opacity={dragging ? 0.38 : 0.16}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function Camera({ reset, robotOnly }: { reset: number; robotOnly?: boolean }) {
  const { camera } = useThree()
  const ref = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    camera.position.set(robotOnly ? 2.15 : 3.7, 1.95, robotOnly ? 3.3 : -1.6)
    ref.current?.target.set(robotOnly ? 0 : 0.24, 0.88, 0.12)
    ref.current?.update()
  }, [camera, reset, robotOnly])
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enablePan
      minDistance={1.7}
      maxDistance={6}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI / 2 - 0.03}
      target={[0.24, 0.88, 0.12]}
    />
  )
}

function World(
  props: Props & { labels: RefObject<HTMLButtonElement | null>[]; onReady: () => void },
) {
  const frame = sampleMotion(props.robotOnly ? null : props.plan, props.time, props.settings)
  useEffect(props.onReady, [props.onReady])
  useFrame(({ camera, size }) => {
    if (props.robotOnly) return
    const positions: Vec3[] = [
      [frame.cups['cup-blue'][0], frame.cups['cup-blue'][1] + 0.16, frame.cups['cup-blue'][2]],
      [CABINET.x + props.settings.targetOffset, 1.67, CABINET.z],
    ]
    props.labels.forEach((ref, i) => {
      if (!ref.current) return
      const point = new THREE.Vector3(...positions[i]).project(camera)
      ref.current.style.visibility = point.z > -1 && point.z < 1 ? 'visible' : 'hidden'
      ref.current.style.transform = `translate(${((point.x + 1) * size.width) / 2}px, ${((-point.y + 1) * size.height) / 2}px) translate(-50%, -50%)`
    })
  })
  const trails = useMemo(() => {
    if (!props.comparison || !props.plan) return []
    return props.plan.objects.map((cup) => ({
      cup,
      current: sampleCupPath(props.plan!, cup, props.settings),
      previous: props.referencePlan ? sampleCupPath(props.referencePlan, cup, props.settings) : [],
    }))
  }, [props.comparison, props.plan, props.referencePlan, props.settings])
  return (
    <>
      <color attach="background" args={['#edf1f6']} />
      <fog attach="fog" args={['#edf1f6', 5, 11]} />
      <ambientLight intensity={1.5} />
      <directionalLight
        position={[-2, 5, 3]}
        intensity={2.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-2}
        shadow-normalBias={0.015}
      />
      <directionalLight position={[3, 2, -2]} intensity={2} color="#d9e8ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer
          position={[0, 4, -2]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[6, 6, 1]}
          intensity={2}
        />
        <Lightformer
          position={[-3, 2, 1]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[3, 5, 1]}
          intensity={3}
        />
        <Lightformer
          position={[2, 2, 3]}
          rotation={[0, -Math.PI / 3, 0]}
          scale={[2, 4, 1]}
          intensity={2}
        />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#edf1f6" roughness={0.86} />
      </mesh>
      <gridHelper args={[5, 25, '#ced7e5', '#dce3ed']} position={[0, -0.003, 0]} />
      <ContactShadows
        position={[0, -0.002, 0]}
        opacity={0.32}
        scale={4}
        blur={2.5}
        far={2.2}
        resolution={256}
        frames={1}
      />
      <Robot frame={frame} />
      {!props.robotOnly && (
        <>
          <Furniture frame={frame} settings={props.settings} onSelect={props.onSelect} />
          <Cup
            id="cup-blue"
            position={frame.cups['cup-blue']}
            selected={props.selected === 'cup-blue'}
            onSelect={props.onSelect}
          />
          <Cup
            id="cup-white"
            position={frame.cups['cup-white']}
            selected={props.selected === 'cup-white'}
            onSelect={props.onSelect}
          />
          <Target
            offset={props.settings.targetOffset}
            onChange={props.onTargetChange}
            onSelect={props.onSelect}
            locked={props.locked}
          />
          {trails.map((trail) => (
            <group key={trail.cup}>
              {trail.current.length > 1 && (
                <Line points={trail.current} color="#3264ea" lineWidth={2.5} />
              )}
              {trail.previous.length > 1 && (
                <Line
                  points={trail.previous}
                  color="#8d9caf"
                  lineWidth={1.6}
                  dashed
                  dashSize={0.032}
                  gapSize={0.02}
                />
              )}
            </group>
          ))}
        </>
      )}
      {props.reach && (
        <mesh position={[0.205, 1.415, -0.105]}>
          <sphereGeometry args={[0.51, 32, 24]} />
          <meshBasicMaterial
            color="#618ff4"
            transparent
            opacity={0.065}
            wireframe
            depthWrite={false}
          />
        </mesh>
      )}
      <Camera reset={props.reset} robotOnly={props.robotOnly} />
    </>
  )
}

export default function Scene(props: Props) {
  const cupLabel = useRef<HTMLButtonElement>(null),
    targetLabel = useRef<HTMLButtonElement>(null)
  const [loaded, setLoaded] = useState(false)
  const ready = useCallback(() => setLoaded(true), [])
  return (
    <div className="three-scene" data-testid="scene">
      <Canvas
        frameloop="demand"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ position: [3.7, 1.95, -1.6], fov: 33 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <World {...props} labels={[cupLabel, targetLabel]} onReady={ready} />
        </Suspense>
      </Canvas>
      {!loaded && (
        <div className="loading-panel">
          <div className="scene-loading">
            <span className="loader" />
            正在装配三维场景
          </div>
        </div>
      )}
      {!props.robotOnly && (
        <>
          <button
            ref={cupLabel}
            className={`scene-tag scene-label ${props.selected === 'cup-blue' ? 'selected' : ''}`}
            onClick={() => props.onSelect('cup-blue')}
          >
            <span className="tag-dot" />
            蓝色杯子
          </button>
          <button
            ref={targetLabel}
            className="scene-tag scene-label"
            onClick={() => props.onSelect('target')}
          >
            放置区域 <span className="tag-coordinate">T₀₁</span>
          </button>
        </>
      )}
    </div>
  )
}
useGLTF.preload(ROBOT_MODEL_URL)
