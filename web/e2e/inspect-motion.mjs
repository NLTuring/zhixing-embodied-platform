import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
page.on('pageerror', (error) => {
  throw error
})
await page.goto('http://127.0.0.1:5173/')
await page.locator('canvas').waitFor()
await page
  .getByLabel('任务指令', { exact: true })
  .fill('把蓝色杯子放进柜子，避开障碍，最后关好柜门')
await page.getByRole('button', { name: '生成计划', exact: true }).click()
await page.getByRole('button', { name: '全屏场景', exact: true }).click()
await page.addStyleTag({
  content:
    '.scene-label,.scene-top-left,.object-dock,.scene-tools,.scene-bottom{visibility:hidden!important}',
})
await page.waitForTimeout(1200)
const times = process.argv.includes('--transitions')
  ? [2, 20.5]
  : [0, 2, 3.5, 5.7, 7.1, 8, 10, 12.5, 14.7, 16.5, 18.5, 20.5]
for (const view of ['rear', 'side', 'front']) {
  if (view !== 'rear') {
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(755, 400, { steps: 24 })
    await page.mouse.up()
    await page.waitForTimeout(350)
  }
  for (const time of times) {
    await page.getByLabel('回放时间').evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, String(time))
    await page.waitForTimeout(100)
    await page.screenshot({ path: `../preview/runtime/motion-${view}-${time}.png` })
  }
}
await browser.close()
