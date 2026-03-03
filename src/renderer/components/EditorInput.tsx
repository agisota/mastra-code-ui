import { useRef, useState, useCallback, useEffect } from "react"
import {
	useSlashAutocomplete,
	type SlashCommand,
} from "./SlashCommandAutocomplete"

export interface AttachedFile {
	type: "image" | "file"
	name: string
	mimeType: string
	data: string // base64 for images, text content for files
	preview: string // data URL for images, empty for files
}

interface EditorInputProps {
	onSend: (content: string, files?: AttachedFile[]) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	onBuiltinCommand?: (name: string) => void
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

export function EditorInput({
	onSend,
	onAbort,
	isAgentActive,
	modeId,
	onBuiltinCommand,
}: EditorInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [value, setValue] = useState("")
	const [showSlashMenu, setShowSlashMenu] = useState(false)
	const [slashFilter, setSlashFilter] = useState("")
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null)
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])

	useEffect(() => {
		textareaRef.current?.focus()
	}, [isAgentActive])

	const processImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			const dataUrl = reader.result as string
			const base64 = dataUrl.split(",")[1]
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "image",
					name: file.name,
					mimeType: file.type,
					data: base64,
					preview: dataUrl,
				},
			])
		}
		reader.readAsDataURL(file)
	}, [])

	const processNonImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "file",
					name: file.name,
					mimeType: file.type || "application/octet-stream",
					data: reader.result as string,
					preview: "",
				},
			])
		}
		reader.readAsText(file)
	}, [])

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = e.clipboardData?.items
			if (!items) return
			for (const item of items) {
				if (item.type.startsWith("image/")) {
					e.preventDefault()
					const file = item.getAsFile()
					if (file) processImageFile(file)
					return
				}
			}
		},
		[processImageFile],
	)

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files
			if (!files) return
			for (const file of files) {
				if (file.type.startsWith("image/")) {
					processImageFile(file)
				} else {
					processNonImageFile(file)
				}
			}
			e.target.value = ""
		},
		[processImageFile, processNonImageFile],
	)

	const handleCommandSelect = useCallback(
		(command: SlashCommand) => {
			if (command.builtin && onBuiltinCommand) {
				onBuiltinCommand(command.name)
				setValue("")
				setActiveCommand(null)
				setShowSlashMenu(false)
				textareaRef.current?.focus()
			} else {
				setActiveCommand(command)
				setValue("")
				setShowSlashMenu(false)
				textareaRef.current?.focus()
			}
		},
		[onBuiltinCommand],
	)

	const handleSlashClose = useCallback(() => {
		setShowSlashMenu(false)
	}, [])

	const slash = useSlashAutocomplete(
		slashFilter,
		showSlashMenu,
		handleCommandSelect,
		handleSlashClose,
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Delegate to slash autocomplete first when open
			if (showSlashMenu && slash.handleKeyDown(e)) {
				return
			}

			// Backspace at start of input removes the command chip
			if (e.key === "Backspace" && activeCommand && value === "") {
				e.preventDefault()
				setActiveCommand(null)
				return
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				if (isAgentActive) return
				const trimmed = value.trim()
				if (!trimmed && !activeCommand && attachedFiles.length === 0) return
				const message = activeCommand
					? `/${activeCommand.name} ${trimmed}`.trim()
					: trimmed
				onSend(message, attachedFiles.length > 0 ? attachedFiles : undefined)
				setValue("")
				setActiveCommand(null)
				setAttachedFiles([])
				setShowSlashMenu(false)
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[value, isAgentActive, onSend, onAbort, showSlashMenu, slash, activeCommand, attachedFiles],
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newVal = e.target.value
			setValue(newVal)

			// Detect slash commands (only when no command chip is active)
			if (!activeCommand && newVal.startsWith("/") && !newVal.includes("\n")) {
				setShowSlashMenu(true)
				setSlashFilter(newVal.slice(1).split(" ")[0])
			} else {
				setShowSlashMenu(false)
			}

			// Auto-resize
			const ta = e.target
			ta.style.height = "auto"
			ta.style.height = Math.min(ta.scrollHeight, 200) + "px"
		},
		[activeCommand],
	)

	const borderColor = modeColors[modeId] ?? "var(--border)"

	const hasContent = value.trim() || activeCommand || attachedFiles.length > 0

	return (
		<div
			style={{
				padding: "8px 24px 12px",
				borderTop: "1px solid var(--border-muted)",
				flexShrink: 0,
			}}
		>
			<div style={{ position: "relative" }}>
				{slash.element}
				{/* Attachment previews */}
				{attachedFiles.length > 0 && (
					<div
						style={{
							display: "flex",
							gap: 8,
							padding: "8px 12px",
							background: "var(--bg-surface)",
							border: `1px solid ${borderColor}44`,
							borderBottom: "none",
							borderRadius: "8px 8px 0 0",
							overflowX: "auto",
						}}
					>
						{attachedFiles.map((file, i) => (
							<div
								key={i}
								style={{
									position: "relative",
									flexShrink: 0,
								}}
							>
								{file.type === "image" ? (
									<img
										src={file.preview}
										alt={file.name}
										style={{
											height: 64,
											maxWidth: 120,
											objectFit: "cover",
											borderRadius: 6,
											border: "1px solid var(--border-muted)",
										}}
									/>
								) : (
									<div
										title={file.name}
										style={{
											height: 64,
											minWidth: 80,
											maxWidth: 120,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											gap: 4,
											padding: "6px 10px",
											borderRadius: 6,
											border: "1px solid var(--border-muted)",
											background: "var(--bg-elevated)",
										}}
									>
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
											<polyline points="14 2 14 8 20 8" />
										</svg>
										<span style={{
											fontSize: 10,
											color: "var(--muted)",
											maxWidth: 100,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}>
											{file.name}
										</span>
									</div>
								)}
								<button
									onClick={() =>
										setAttachedFiles((prev) =>
											prev.filter((_, idx) => idx !== i),
										)
									}
									style={{
										position: "absolute",
										top: -6,
										right: -6,
										width: 18,
										height: 18,
										borderRadius: "50%",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										color: "var(--text)",
										fontSize: 11,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "pointer",
										lineHeight: 1,
										padding: 0,
									}}
								>
									&times;
								</button>
							</div>
						))}
					</div>
				)}
				<div
					style={{
						display: "flex",
						alignItems: "flex-end",
						flexWrap: "wrap",
						gap: 6,
						background: "var(--bg-surface)",
						border: `1px solid ${borderColor}44`,
						borderRadius: attachedFiles.length > 0 ? "0 0 8px 8px" : 8,
						padding: "8px 12px",
						transition: "border-color 0.15s",
					}}
				>
					{/* Attach button */}
					{!isAgentActive && (
						<button
							onClick={() => fileInputRef.current?.click()}
							title="Attach file"
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 24,
								height: 24,
								borderRadius: 4,
								background: "transparent",
								color: "var(--muted)",
								cursor: "pointer",
								flexShrink: 0,
								padding: 0,
								border: "none",
								transition: "color 0.15s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "var(--text)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "var(--muted)"
							}}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="8" y1="3" x2="8" y2="13" />
								<line x1="3" y1="8" x2="13" y2="8" />
							</svg>
						</button>
					)}
					<input
						ref={fileInputRef}
						type="file"
						multiple
						onChange={handleFileSelect}
						style={{ display: "none" }}
					/>
					{activeCommand && (
						<span
							onClick={() => {
								setActiveCommand(null)
								textareaRef.current?.focus()
							}}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								background: "var(--accent)" + "22",
								color: "var(--accent)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "var(--font-mono, monospace)",
								fontWeight: 500,
								flexShrink: 0,
								cursor: "pointer",
								lineHeight: 1.5,
							}}
						>
							/{activeCommand.name}
							<span style={{ fontSize: 10, opacity: 0.6 }}>&times;</span>
						</span>
					)}
					<textarea
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						placeholder={
							isAgentActive
								? "Agent is running... (Esc to abort)"
								: activeCommand
									? "Add a message..."
									: "Send a message... (Enter to send, Shift+Enter for newline)"
						}
						disabled={isAgentActive}
						rows={1}
						style={{
							flex: 1,
							background: "transparent",
							border: "none",
							outline: "none",
							color: "var(--text)",
							fontSize: 13,
							fontFamily: "inherit",
							lineHeight: 1.5,
							resize: "none",
							minHeight: 20,
							maxHeight: 200,
							opacity: isAgentActive ? 0.5 : 1,
						}}
					/>
					{isAgentActive ? (
						<button
							onClick={onAbort}
							style={{
								padding: "4px 12px",
								background: "var(--error)",
								color: "#fff",
								borderRadius: 4,
								fontSize: 11,
								fontWeight: 500,
								cursor: "pointer",
								flexShrink: 0,
							}}
						>
							Stop
						</button>
					) : (
						<button
							onClick={() => {
								const trimmed = value.trim()
								if (!trimmed && !activeCommand && attachedFiles.length === 0) return
								const message = activeCommand
									? `/${activeCommand.name} ${trimmed}`.trim()
									: trimmed
								onSend(message, attachedFiles.length > 0 ? attachedFiles : undefined)
								setValue("")
								setActiveCommand(null)
								setAttachedFiles([])
								setShowSlashMenu(false)
							}}
							style={{
								padding: "4px 12px",
								background: hasContent
									? "var(--accent)"
									: "var(--bg-elevated)",
								color: hasContent ? "#fff" : "var(--dim)",
								borderRadius: 4,
								fontSize: 11,
								fontWeight: 500,
								cursor: hasContent ? "pointer" : "default",
								flexShrink: 0,
							}}
						>
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
