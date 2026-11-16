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

  const fileInput = await page.$('[data-testid="manual-input"]')
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
  await page.waitForFunction(() => document.body.innerText.includes('Settings') || document.body.innerText.includes('Add your API key'), { timeout: 5000 })


  await clickText(page, 'Settings')
  await waitText(page, 'API provider')
  await setInputValue(page, 'input[type="password"]', 'gsk_smoke_test_key_not_real')
  await clickText(page, 'Save settings')
  await waitText(page, 'Settings saved')

  const mockBody = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            garments: [
              {
                name: 'Smoke Test Tee',
                category: 'top',
                type: 't-shirt',
                primary_color: 'navy',
                pattern: 'solid',
                style: [],
                seasons: ['all-season'],
                formality: 'casual',
                description: 'A navy tee for smoke tests',
                tags: ['test'],
                confidence: 0.94,
                box_2d: [50, 50, 900, 900],
              },
            ],
          }),
        },
      },
    ],
  }
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = request.url()
    const isAi = /chat\/completions|:generateContent|generativelanguage|api\.groq\.com|openrouter\.ai|api\.openai\.com/.test(url)
    if (isAi && request.method() === 'OPTIONS') {
      void request.respond({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
      })
      return
    }
    if (isAi && request.method() === 'POST') {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(mockBody),
      })
      return
    }
    void request.continue()
  })

  await clickText(page, 'Add clothes')
  await waitText(page, 'Upload clothing photos')
  const uploadInput = await page.$('[data-testid="upload-input"]')
  assert(uploadInput, 'Upload file input not found')
  await uploadInput.uploadFile(imagePath)
  await page.waitForFunction(
    () => document.body.innerText.includes('Analyzing') || document.body.innerText.includes('Review detections'),
    { timeout: 15000 },
  )
  await waitText(page, 'Review detections', 20000)
  await waitText(page, 'Smoke Test Tee')
  await clickText(page, 'Approve all')
  await clickText(page, 'Save 1 approved')
  await waitText(page, 'Saved 1 item')

  await clickText(page, 'Add clothes')
  await waitText(page, 'Upload clothing photos')
  await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob()
    const file = new File([blob], 'pasted.png', { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.dispatchEvent(event)
  }, new URL('icons/icon-192.png', baseUrl).href)
  await waitText(page, 'Review detections', 20000)
  await waitText(page, 'Smoke Test Tee')

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
