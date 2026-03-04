import { createAnthropic } from "@ai-sdk/anthropic"
import type { PlaywrightBrowserManager } from "../browser/playwright-manager.js"
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from "../browser/playwright-manager.js"

/** Map xdotool-style key names to Playwright key names. */
const KEY_MAP: Record<string, string> = {
	Return: "Enter",
	BackSpace: "Backspace",
	space: " ",
	Page_Up: "PageUp",
	Page_Down: "PageDown",
	Up: "ArrowUp",
	Down: "ArrowDown",
	Left: "ArrowLeft",
	Right: "ArrowRight",
	super: "Meta",
	ctrl: "Control",
	alt: "Alt",
	shift: "Shift",
}

function mapKey(key: string): string {
	return key
		.split("+")
		.map((k) => KEY_MAP[k] || k)
		.join("+")
}

async function takeScreenshot(browserManager: PlaywrightBrowserManager) {
	const data = await browserManager.screenshot()
	return [{ type: "image" as const, data, mimeType: "image/jpeg" as const }]
}

/**
 * Creates an Anthropic computer_20251124 provider-defined tool backed by
 * a headless Playwright browser. The tool lets Claude take screenshots
 * and interact with web pages via mouse/keyboard.
 *
 * Uses computer_20251124 which is required for Claude Opus 4.5+, Sonnet 4.6+.
 */
export function createComputerUseTool(
	browserManager: PlaywrightBrowserManager,
) {
	const anthropic = createAnthropic({})

	return anthropic.tools.computer_20251124({
		displayWidthPx: DISPLAY_WIDTH,
		displayHeightPx: DISPLAY_HEIGHT,
		execute: async ({
			action,
			coordinate,
			text,
			scroll_direction,
			scroll_amount,
			start_coordinate,
			duration,
			region,
		}) => {
			const page = await browserManager.getPage()
			const ok = [{ type: "text" as const, text: "ok" }]

			switch (action) {
				case "screenshot":
					return takeScreenshot(browserManager)

				case "left_click":
					if (coordinate) await page.mouse.click(coordinate[0], coordinate[1])
					return ok

				case "right_click":
					if (coordinate)
						await page.mouse.click(coordinate[0], coordinate[1], {
							button: "right",
						})
					return ok

				case "double_click":
					if (coordinate)
						await page.mouse.dblclick(coordinate[0], coordinate[1])
					return ok

				case "triple_click":
					if (coordinate)
						await page.mouse.click(coordinate[0], coordinate[1], {
							clickCount: 3,
						})
					return ok

				case "middle_click":
					if (coordinate)
						await page.mouse.click(coordinate[0], coordinate[1], {
							button: "middle",
						})
					return ok

				case "left_click_drag":
					if (start_coordinate && coordinate) {
						await page.mouse.move(start_coordinate[0], start_coordinate[1])
						await page.mouse.down()
						await page.mouse.move(coordinate[0], coordinate[1])
						await page.mouse.up()
					}
					return ok

				case "left_mouse_down":
					if (coordinate) await page.mouse.move(coordinate[0], coordinate[1])
					await page.mouse.down()
					return ok

				case "left_mouse_up":
					if (coordinate) await page.mouse.move(coordinate[0], coordinate[1])
					await page.mouse.up()
					return ok

				case "mouse_move":
					if (coordinate) await page.mouse.move(coordinate[0], coordinate[1])
					return ok

				case "type":
					if (text) await page.keyboard.type(text, { delay: 12 })
					return ok

				case "key":
					if (text) await page.keyboard.press(mapKey(text))
					return ok

				case "hold_key":
					if (text) {
						const key = mapKey(text)
						await page.keyboard.down(key)
						await page.waitForTimeout(duration ?? 500)
						await page.keyboard.up(key)
					}
					return ok

				case "scroll": {
					if (coordinate) await page.mouse.move(coordinate[0], coordinate[1])
					const amount = (scroll_amount ?? 3) * 100
					const deltaX =
						scroll_direction === "left"
							? -amount
							: scroll_direction === "right"
								? amount
								: 0
					const deltaY =
						scroll_direction === "up"
							? -amount
							: scroll_direction === "down"
								? amount
								: 0
					await page.mouse.wheel(deltaX, deltaY)
					await page.waitForTimeout(300)
					return ok
				}

				case "zoom": {
					if (region) {
						const [x1, y1, x2, y2] = region
						const clip = {
							x: x1,
							y: y1,
							width: x2 - x1,
							height: y2 - y1,
						}
						const buffer = await page.screenshot({
							type: "jpeg",
							quality: 80,
							fullPage: false,
							clip,
						})
						return [
							{
								type: "image" as const,
								data: buffer.toString("base64"),
								mimeType: "image/jpeg" as const,
							},
						]
					}
					return takeScreenshot(browserManager)
				}

				case "cursor_position":
					return [
						{
							type: "text" as const,
							text: "Cursor position tracking is not available in headless mode. Use mouse_move to position the cursor.",
						},
					]

				case "wait":
					await page.waitForTimeout((duration ?? 1) * 1000)
					return ok

				default:
					return [
						{
							type: "text" as const,
							text: `Unknown action: ${action}`,
						},
					]
			}
		},
	})
}
