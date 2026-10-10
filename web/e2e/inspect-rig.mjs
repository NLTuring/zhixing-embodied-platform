// Unobstructed asset inspection, separate from the furniture-inclusive UI checks.
import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
await page.goto('http://127.0.0.1:5173/')
await page.evaluate(async () => {
  const T = await import('/node_modules/.vite/deps/three.js')
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
  const { createRobotRig, applyRobotPose } = await import('/src/robotPose.ts')
  const { sampleMotion } = await import('/src/motion.ts')
  const { generatePlan, DEFAULT_SCENE } = await import('/src/domain.ts')
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(1200, 900)
  renderer.setPixelRatio(1)
  document.body.append(renderer.domElement)
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:9999'
  const world = new T.Scene()
  world.background = new T.Color('#edf1f6')
  world.add(new T.HemisphereLight('#ffffff', '#67758b', 3))
  const light = new T.DirectionalLight('#ffffff', 3)
  light.position.set(2, 4, 3)
  world.add(light)
  const model = (await new GLTFLoader().loadAsync('/models/zhixing-robot.glb')).scene
  world.add(model)
  const rig = createRobotRig(model)
  const camera = new T.PerspectiveCamera(30, 1200 / 900, 0.01, 100)
  const plan = generatePlan('把两个杯子放进柜子，避开障碍，最后关好柜门').plan
  window.inspectRig = (time, side) => {
    const frame = sampleMotion(plan, time, DEFAULT_SCENE)
    applyRobotPose(model, rig, frame)
    camera.position.set(side ? 2.6 : 1.2, 1.7, side ? -0.4 : 2.8)
    camera.lookAt(0.15, 1.22, 0.1)
    renderer.render(world, camera)
  }
})
for (const side of [false, true]) {
  for (const time of [0, 2, 3.5, 7.1, 10, 12.5, 17.5, 27]) {
    await page.evaluate(({ time, side }) => window.inspectRig(time, side), { time, side })
    await page.screenshot({ path: `../preview/runtime/rig-${side ? 'side' : 'front'}-${time}.png` })
  }
}
await browser.close()
