import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imagePath = path.join(root, 'public', 'icons', 'icon-192.png')
const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:5173/'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke test failed: ${message}`)
}

async function waitText(page, text, timeout = 10000) {
  await page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout }, text)
}

async function clickText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (needle) => [...document.querySelectorAll('button, a')].some((el) => el.innerText?.includes(needle)),
    { timeout },
    text,
  )
  await page.evaluate((needle) => {
    const el = [...document.querySelectorAll('button, a')].find((node) => node.innerText?.includes(needle))
    el?.click()
  }, text)
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10000 })
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel)
      if (!el) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    { sel: selector, val: value },
  )
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1280, height: 900 },
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error('Page error:', error.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await waitText(page, 'Wardrobe')
  await waitText(page, 'Start your digital wardrobe')

  await clickText(page, 'Add clothes')
  await waitText(page, 'Add item manually')
  await clickText(page, 'Add item manually')
  await waitText(page, 'Manual item')

  const fileInput = await page.$('input[type="file"]')
  assert(fileInput, 'Manual file input not found')
  await fileInput.uploadFile(imagePath)
  await waitText(page, 'icon-192.png')

  await page.type('input[placeholder="Linen shirt"]', 'Test Tee')
  await page.type('input[placeholder="navy"]', 'navy')
  await clickText(page, 'Add to wardrobe')
  await waitText(page, 'Item added to your wardrobe')

  await clickText(page, 'Wardrobe')
  await waitText(page, 'Test Tee')
  await setInputValue(page, 'input[placeholder="Search names, colors, tags"]', 'Test Tee')
  await page.waitForFunction(() => document.body.innerText.includes('Test Tee'))

  await clickText(page, 'Test Tee')
  await waitText(page, 'ITEM DETAILS')
  await setInputValue(page, 'input[placeholder="Linen shirt"]', 'Test Tee Edited')
  await clickText(page, 'Save changes')
  await waitText(page, 'Test Tee Edited')

  await clickText(page, 'Wardrobe')
  await clickText(page, 'Outfit AI')
  await waitText(page, 'Recommendations use only items already in your wardrobe')
  await clickText(page, 'Generate outfits')
  await page.waitForFunction(() => document.body.innerText.includes('Settings') || document.body.innerText.includes('Add your Gemini API key'), { timeout: 5000 })

  await page.setViewport({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle0' })
  await waitText(page, 'Wardrobe')
  const mobileNavCount = await page.evaluate(() => document.querySelectorAll('nav.fixed.bottom-0 button').length)
  assert(mobileNavCount >= 5, `Expected mobile bottom nav, found ${mobileNavCount}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  assert(!overflow, 'Mobile layout has horizontal overflow')

  console.log('Smoke test passed')
} finally {
  await browser.close()
}
