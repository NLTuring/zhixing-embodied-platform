import { test, expect, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (e) => errors.get(page)!.push(e.message))
  await page.goto('/')
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function example(page: Page, name: string) {
  await page.getByRole('button', { name: '示例任务', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByLabel('回放速度').selectOption('4')
}
async function complete(page: Page) {
  await page.getByRole('button', { name: '开始验证', exact: true }).click()
  await expect(page.locator('.run-badge')).toHaveText('验证通过')
}
async function records(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('zhixing.experiments.v1') || '[]'))
}

test('通过实验保存完整配置，回放不产生重复记录', async ({ page }) => {
  await example(page, '一次顺利的收纳')
  await complete(page)
  expect(await records(page)).toHaveLength(1)
  expect((await records(page))[0].capability.payload).toBe(3)
  await page.getByRole('button', { name: '机器人', exact: true }).click()
  await page.getByRole('button', { name: '编辑能力', exact: true }).click()
  await page.getByLabel('示例负载（kg）').fill('0.1')
  await page.getByRole('button', { name: '保存能力配置' }).click()
  await page.getByRole('button', { name: '实验记录', exact: true }).click()
  await page.getByRole('button', { name: '回放', exact: true }).click()
  await expect(page.getByTestId('diagnostic')).toHaveCount(0)
  await page.getByRole('button', { name: '继续回放', exact: true }).click()
  await expect(page.locator('.run-badge')).toHaveText('验证通过')
  expect(await records(page)).toHaveLength(1)
  await page.reload()
  await page.getByRole('button', { name: '实验记录', exact: true }).click()
  await expect(page.locator('.experiment-row')).toHaveCount(1)
})

test('复制实验保留用户修改，导出包含快照', async ({ page }) => {
  await page.getByRole('button', { name: '步骤 4 接近柜口' }).hover()
  await page.getByRole('button', { name: '编辑动作 4', exact: true }).click()
  await page.getByLabel('动作时长（秒）').fill('6')
  await page.getByLabel('接近高度（cm）').fill('12')
  await page.getByRole('button', { name: '保存动作', exact: true }).click()
  await page.getByRole('button', { name: '保存实验', exact: true }).click()
  await page.getByRole('button', { name: '实验记录', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^导出实验/ }).click()
  expect((await download).suggestedFilename()).toMatch(/\.json$/)
  await page.getByRole('button', { name: /^复制实验/ }).click()
  await expect(page.getByRole('button', { name: '步骤 4 接近柜口' })).toContainText('6s · 12cm')
  await expect(page.locator('.version').first()).toHaveText('v1')
})

test('碰撞在审核模式暂停，应用修复后通过', async ({ page }) => {
  await example(page, '发现问题，修复路径')
  await page.getByRole('button', { name: '审核', exact: true }).click()
  await page.getByRole('button', { name: '开始验证', exact: true }).click()
  await expect(page.getByTestId('diagnostic')).toContainText('杯底与柜口下沿发生接触')
  await expect(page.locator('.run-badge')).toHaveText('待修复')
  await page.screenshot({ path: '../preview/runtime/collision-review.png' })
  await page.getByRole('button', { name: '应用修复并验证', exact: true }).click()
  await expect(page.locator('.run-badge')).toHaveText('验证通过')
  expect((await records(page))[0].repairs).toBe(1)
  expect((await records(page))[0].plan.version).toBe(2)
  expect((await records(page))[0].referencePlan.version).toBe(1)
  await page.getByRole('button', { name: /修复已应用 · 计划/ }).click()
  await expect(page.getByRole('dialog')).toContainText('10 cm')
  await page.getByRole('button', { name: '在场景中比较路径' }).click()
  await page.screenshot({ path: '../preview/runtime/repaired-complete.png' })
  await page.reload()
  await page.getByRole('button', { name: '实验记录', exact: true }).click()
  await page.getByRole('button', { name: '回放', exact: true }).click()
  await page.getByRole('button', { name: /修复已应用 · 计划/ }).click()
  await expect(page.getByRole('dialog')).toContainText('接近高度调整为 10 cm')
  await expect(page.getByRole('dialog')).not.toContainText('补入动作')
})

test('自动修复碰撞并保存修复后的计划', async ({ page }) => {
  await page.getByLabel('回放速度').selectOption('4')
  await complete(page)
  expect((await records(page))[0].repairs).toBe(1)
  await expect(page.getByTestId('diagnostic')).toHaveCount(0)
})

test('缺失开门前置条件可以补齐，删除接近动作会被检查', async ({ page }) => {
  await example(page, '计划少了一步')
  await expect(page.getByTestId('diagnostic')).toContainText('柜门尚未打开')
  await complete(page)
  expect(
    (await records(page))[0].plan.steps.some((s: { skill: string }) => s.skill === 'open'),
  ).toBe(true)
  await page.getByRole('button', { name: '步骤 4 接近柜口' }).hover()
  await page.getByRole('button', { name: '删除动作 4', exact: true }).click()
  await expect(page.getByTestId('diagnostic')).toContainText('尚未经过柜口接近点')
  await page.getByRole('button', { name: '撤销计划编辑' }).click()
  await expect(page.getByTestId('diagnostic')).toHaveCount(0)
})

test('不支持的任务给出提示，双杯计划按输入顺序完成', async ({ page }) => {
  await page.getByLabel('任务指令', { exact: true }).fill('把红色杯子放进柜子')
  await page.getByRole('button', { name: '生成计划', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('当前场景支持')
  await example(page, '有顺序的双杯收纳')
  await expect(page.getByRole('button', { name: '步骤 3 抓取杯子' })).toContainText('白色杯子')
  await complete(page)
  expect((await records(page))[0].plan.objects).toEqual(['cup-white', 'cup-blue'])
  await page.screenshot({ path: '../preview/runtime/multi-complete.png' })
})

test('技能筛选、默认时长、插入和刷新持久化', async ({ page }) => {
  await page.getByRole('button', { name: '技能库', exact: true }).click()
  await page.getByLabel('搜索技能', { exact: true }).fill('不存在的技能')
  await expect(page.getByRole('heading', { name: '没有匹配的技能' })).toBeVisible()
  await page.getByLabel('搜索技能', { exact: true }).fill('抓取')
  await expect(page.locator('.skill-row')).toHaveCount(1)
  await page.getByLabel('默认动作时长', { exact: true }).fill('5')
  await page.reload()
  await page.getByRole('button', { name: '技能库', exact: true }).click()
  await expect(page.getByLabel('默认动作时长', { exact: true })).toHaveValue('5')
  await page.getByRole('button', { name: '插入当前计划', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('动作时长（秒）')).toHaveValue('5')
  await page.getByRole('button', { name: '保存动作', exact: true }).click()
  await expect(page.locator('.step-row')).toHaveCount(8)
  await expect(page.getByTestId('diagnostic')).toBeVisible()
})

test('能力导入校验，负载不足阻止执行', async ({ page }) => {
  await page.getByRole('button', { name: '机器人', exact: true }).click()
  await page.getByLabel('导入能力 JSON').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  })
  await expect(page.getByRole('status')).toContainText('文件格式无效')
  await page.getByLabel('导入能力 JSON').setInputFiles({
    name: 'robot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ name: '轻载机器人', payload: 0.1, reach: 0.65, version: 1 }),
    ),
  })
  await expect(page.getByRole('heading', { name: '轻载机器人' })).toBeVisible()
  await page.getByRole('button', { name: '用于新任务', exact: true }).click()
  await expect(page.getByTestId('diagnostic')).toContainText('本体负载不足')
  await page.getByRole('button', { name: '开始验证', exact: true }).click()
  await expect(page.locator('.run-badge')).toHaveText('待修复')
  expect(await records(page)).toHaveLength(0)
})

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
  [1024, 768],
]) {
  test(`${width} 宽度布局可用且关键文字清晰`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await expect(page.locator('canvas')).toBeVisible()
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page
        .getByLabel('任务指令', { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16)
    if (width === 1024) await page.getByRole('button', { name: '动作计划', exact: true }).click()
    await expect(page.getByRole('button', { name: '开始验证', exact: true })).toBeVisible()
    expect(
      await page
        .locator('.step-copy strong')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16)
    if (width === 1024) await page.getByRole('button', { name: '关闭动作计划面板' }).click()
    await page.screenshot({ path: `../preview/runtime/verified-${width}.png` })
  })
}
