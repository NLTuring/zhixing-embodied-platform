import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
await page.goto('http://127.0.0.1:5173/')
await page.locator('canvas').waitFor()
await page.waitForTimeout(1800)
console.log(
  'fonts',
  await page.evaluate(() => ({
    yahei: document.fonts.check('16px "Microsoft YaHei"'),
    fonts: getComputedStyle(document.body).fontFamily,
  })),
)
for (const [name, time] of [
  ['open', 3.4],
  ['grasp', 7.1],
  ['approach', 10.2],
  ['place', 13.8],
]) {
  await page.getByLabel('回放时间').evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, String(time))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `../preview/runtime/${name}.png` })
}
for (const [width, height] of [
  [1280, 800],
  [1024, 768],
]) {
  await page.setViewportSize({ width, height })
  await page.getByRole('button', { name: '重置回放', exact: true }).click()
  await page.waitForTimeout(300)
  console.log(
    'width',
    width,
    await page.evaluate(() => ({
      viewport: innerWidth,
      body: document.body.scrollWidth,
      main: document.querySelector('main').scrollWidth,
      mainWidth: document.querySelector('main').clientWidth,
    })),
  )
  await page.screenshot({ path: `../preview/runtime/workbench-${width}.png` })
}
await page.setViewportSize({ width: 1440, height: 960 })
for (const [name, nav] of [
  ['robot', '机器人'],
  ['skills', '技能库'],
  ['experiments', '实验记录'],
]) {
  await page.getByRole('button', { name: nav, exact: true }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `../preview/runtime/${name}.png` })
}
await browser.close()
