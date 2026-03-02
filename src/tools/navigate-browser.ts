import { createTool } from "@mastra/core/tools"
import { z } from "zod"
import type { PlaywrightBrowserManager } from "../browser/playwright-manager.js"

export function createNavigateBrowserTool(
	browserManager: PlaywrightBrowserManager,
) {
	return createTool({
		id: "navigate-browser",
		description:
			"Navigate the headless browser to a URL. Use this before using the computer tool to interact with a webpage. The browser persists across tool calls so you can navigate, then use the computer tool to screenshot and interact with the page.",
		inputSchema: z.object({
			url: z.string().describe("The URL to navigate to"),
		}),
		outputSchema: z.object({
			title: z.string(),
			url: z.string(),
			isError: z.boolean(),
		}),
		execute: async ({ url }) => {
			try {
				await browserManager.navigate(url)
				const page = await browserManager.getPage()
				const title = await page.title()
				return { title, url: page.url(), isError: false }
			} catch (error) {
				return {
					title: "",
					url,
					isError: true,
				}
			}
		},
	})
}
