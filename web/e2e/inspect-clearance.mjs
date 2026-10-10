import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
page.on('pageerror', (error) => console.error(error))
await page.goto('http://127.0.0.1:5173/')
await page.locator('canvas').waitFor()
await page.getByLabel('任务指令', { exact: true }).fill('把蓝色杯子放进右侧柜子，避开障碍')
await page.getByRole('button', { name: '生成计划', exact: true }).click()
await page.getByRole('button', { name: '全屏场景', exact: true }).click()
// Hide interface labels for unobstructed inspection; all meshes remain visible.
await page.addStyleTag({
  content:
    '.scene-label,.scene-top-left,.object-dock,.scene-tools,.scene-bottom{visibility:hidden!important}',
})
await page.mouse.move(720, 480)
await page.mouse.wheel(0, -130)
await page.waitForTimeout(700)
for (const [name, time] of [
  ['open', 3.5],
  ['insert', 12.5],
  ['release', 14.6],
  ['return', 16.2],
]) {
  await page.getByLabel('回放时间').evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, String(time))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `../preview/runtime/clearance-${name}.png` })
}
await page.getByLabel('回放时间').evaluate((element) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '12.5')
  element.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.mouse.move(730, 470)
await page.mouse.down()
await page.mouse.move(890, 470, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(400)
await page.screenshot({ path: '../preview/runtime/clearance-side.png' })
await browser.close()
