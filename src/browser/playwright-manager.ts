import {
	chromium,
	type Browser,
	type Page,
	type BrowserContext,
} from "playwright-core"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export const DISPLAY_WIDTH = 1024
export const DISPLAY_HEIGHT = 768

/**
 * Manages a single headless Chromium browser instance with a persistent page.
 * Lazily creates the browser on first use and tears it down on close or thread change.
 * Auto-installs Chromium on first launch if not present.
 */
export class PlaywrightBrowserManager {
	private browser: Browser | null = null
	private context: BrowserContext | null = null
	private page: Page | null = null
	private threadId: string | null = null
	private installing: Promise<void> | null = null

	/** Get (or lazily create) the persistent page. Closes and restarts if threadId changed. */
	async getPage(threadId?: string): Promise<Page> {
		if (threadId && this.threadId && threadId !== this.threadId) {
			await this.close()
		}
		if (this.page && !this.page.isClosed()) {
			return this.page
		}
		this.threadId = threadId ?? null
		this.browser = await this.launchBrowser()
		this.context = await this.browser.newContext({
			viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
			deviceScaleFactor: 1,
		})
		this.page = await this.context.newPage()
		return this.page
	}

	/** Launch Chromium, auto-installing if not found. */
	private async launchBrowser(): Promise<Browser> {
		try {
			return await chromium.launch({
				headless: true,
				args: [
					`--window-size=${DISPLAY_WIDTH},${DISPLAY_HEIGHT}`,
					"--disable-gpu",
					"--no-sandbox",
				],
			})
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error)
			if (
				msg.includes("Executable doesn't exist") ||
				msg.includes("browserType.launch") ||
				msg.includes("ENOENT")
			) {
				await this.installChromium()
				return await chromium.launch({
					headless: true,
					args: [
						`--window-size=${DISPLAY_WIDTH},${DISPLAY_HEIGHT}`,
						"--disable-gpu",
						"--no-sandbox",
					],
				})
			}
			throw error
		}
	}

	/** Install Chromium via the Playwright CLI. Deduplicates concurrent calls. */
	private async installChromium(): Promise<void> {
		if (this.installing) return this.installing
		this.installing = (async () => {
			try {
				await execFileAsync("npx", ["playwright", "install", "chromium"], {
					timeout: 5 * 60 * 1000,
				})
			} finally {
				this.installing = null
			}
		})()
		return this.installing
	}

	/** Navigate to a URL. */
	async navigate(url: string): Promise<void> {
		const page = await this.getPage()
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
	}

	/** Take a screenshot, return base64 JPEG (much smaller than PNG for token efficiency). */
	async screenshot(): Promise<string> {
		const page = await this.getPage()
		const buffer = await page.screenshot({
			type: "jpeg",
			quality: 55,
			fullPage: false,
		})
		return buffer.toString("base64")
	}

	/** Clean up all resources. */
	async close(): Promise<void> {
		try {
			await this.page?.close()
		} catch {}
		try {
			await this.context?.close()
		} catch {}
		try {
			await this.browser?.close()
		} catch {}
		this.page = null
		this.context = null
		this.browser = null
		this.threadId = null
	}

	isActive(): boolean {
		return this.browser !== null && this.page !== null && !this.page.isClosed()
	}
}
