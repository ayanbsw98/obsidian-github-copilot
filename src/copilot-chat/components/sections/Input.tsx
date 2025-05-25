import React, { useState, KeyboardEvent, useRef, useEffect } from "react";
import { concat, cx } from "../../../utils/style";
import { useCopilotStore } from "../../store/store";
import { usePlugin } from "../../hooks/usePlugin";
import ModelSelector from "./ModelSelector";
import FileSuggestion from "../atoms/FileSuggestion";
import { Notice } from "obsidian";

const BASE_CLASSNAME = "copilot-chat-input";

interface InputProps {
	isLoading?: boolean;
	mode: "chat" | "edit";
}

interface CursorPosition {
	start: number;
	end: number;
}

const Input: React.FC<InputProps> = ({ isLoading = false, mode }) => {
	const [message, setMessage] = useState("");
	const plugin = usePlugin();
	const { sendMessage, isAuthenticated } = useCopilotStore();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
		start: 0,
		end: 0,
	});
	const [showFileSuggestion, setShowFileSuggestion] = useState(false);
	const [fileSearchQuery, setFileSearchQuery] = useState("");
	const [dropdownPosition] = useState({ top: 0, left: 0 });

	// Edit mode state
	const [editInstruction, setEditInstruction] = useState("");
	const [selectedFile, setSelectedFile] = useState<string>("");
	const [editStatus, setEditStatus] = useState<string>("");
	const [isEditing, setIsEditing] = useState(false);

	const markdownFiles = plugin?.app?.vault?.getMarkdownFiles?.() || [];

	const updateCursorPosition = () => {
		if (!textareaRef.current) return;

		setCursorPosition({
			start: textareaRef.current.selectionStart,
			end: textareaRef.current.selectionEnd,
		});
	};

	const checkForFileLinkPattern = (value: string, cursorPos: number) => {
		const textBeforeCursor = value.substring(0, cursorPos);
		const openBracketIndex = textBeforeCursor.lastIndexOf("[[");

		if (openBracketIndex >= 0) {
			const closeBracketBeforeCursor = textBeforeCursor
				.substring(openBracketIndex)
				.indexOf("]]");
			if (closeBracketBeforeCursor === -1) {
				const query = textBeforeCursor.substring(openBracketIndex + 2);
				return {
					isInPattern: true,
					query,
					startIndex: openBracketIndex,
				};
			}
		}

		return { isInPattern: false, query: "", startIndex: -1 };
	};

	const handleFileSelect = (file: { path: string; filename: string }) => {
		if (!textareaRef.current) return;

		const textarea = textareaRef.current;
		const value = textarea.value;
		const { start, end } = cursorPosition;

		const { startIndex } = checkForFileLinkPattern(value, start);
		if (startIndex === -1) return;

		const newValue =
			value.substring(0, startIndex) +
			`[[${file.filename}]]` +
			value.substring(end);

		setMessage(newValue);

		setShowFileSuggestion(false);

		setTimeout(() => {
			if (textareaRef.current) {
				const newCursorPos = startIndex + `[[${file.filename}]]`.length;
				textareaRef.current.focus();
				textareaRef.current.setSelectionRange(
					newCursorPos,
					newCursorPos,
				);
				updateCursorPosition();
			}
		}, 0);
	};

	const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const newValue = e.target.value;
		setMessage(newValue);

		const cursorPos = e.target.selectionStart;

		const { isInPattern, query } = checkForFileLinkPattern(
			newValue,
			cursorPos,
		);

		if (isInPattern) {
			setFileSearchQuery(query);
			setShowFileSuggestion(true);
		} else {
			setShowFileSuggestion(false);
		}

		setCursorPosition({
			start: e.target.selectionStart,
			end: e.target.selectionEnd,
		});
	};

	const extractLinkedNotes = async () => {
		if (!plugin) return null;

		const fileRefs: { path: string; filename: string; content: string }[] =
			[];
		const regex = /\[\[(.*?)\]\]/g;
		let match;

		const processedFiles = new Set<string>();

		while ((match = regex.exec(message)) !== null) {
			const filename = match[1];

			if (processedFiles.has(filename)) continue;

			processedFiles.add(filename);

			const files = plugin.app.vault.getMarkdownFiles();
			const file = files.find((f) => f.basename === filename);

			if (file) {
				try {
					const content = await plugin.app.vault.read(file);
					fileRefs.push({
						path: file.path,
						filename: file.basename,
						content,
					});
				} catch (error) {
					console.error(`Error reading file ${filename}:`, error);
					new Notice(`Could not read file: ${filename}`);
				}
			} else {
				new Notice(`File not found: ${filename}`);
			}
		}

		return fileRefs.length > 0 ? fileRefs : undefined;
	};

	const handleSubmit = async () => {
		if (message.trim() === "" || isLoading || !isAuthenticated) return;

		try {
			const linkedNotes = (await extractLinkedNotes()) || undefined;
			const displayMessage = message;
			const apiMessage = linkedNotes
				? `${message}\n\n${linkedNotes
						.map(
							(note) =>
								`Referenced content from [[${note.filename}]]:\n${note.content}`,
						)
						.join("\n\n")}`
				: message;

			await sendMessage(plugin, apiMessage, displayMessage, linkedNotes);
			setMessage("");
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (!plugin) return;

		const invertBehavior = plugin.settings.invertEnterSendBehavior;

		if (e.key === "Enter" && !showFileSuggestion) {
			if (invertBehavior) {
				if (e.shiftKey) {
					e.preventDefault();
					handleSubmit();
				}
			} else {
				if (!e.shiftKey) {
					e.preventDefault();
					handleSubmit();
				}
			}
		}

		updateCursorPosition();
	};

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.addEventListener("click", updateCursorPosition);
			textareaRef.current.addEventListener(
				"select",
				updateCursorPosition,
			);
		}

		return () => {
			if (textareaRef.current) {
				textareaRef.current.removeEventListener(
					"click",
					updateCursorPosition,
				);
				textareaRef.current.removeEventListener(
					"select",
					updateCursorPosition,
				);
			}
		};
	}, []);

	const handleApplyEdit = async () => {
		if (!plugin || !selectedFile || !editInstruction) {
			setEditStatus("Please select a note and enter an instruction.");
			return;
		}
		if (!plugin.copilotAgent || typeof plugin.copilotAgent.getClient !== "function") {
			setEditStatus("Copilot is not ready yet! Please check your settings and make sure you are signed in.");
			return;
		}
		const client = plugin.copilotAgent.getClient();
		if (!client || typeof client.customEdit !== "function") {
			setEditStatus("Copilot client is not ready yet! Please check your settings and make sure you are signed in.");
			return;
		}
		setIsEditing(true);
		setEditStatus("");
		try {
			const file = markdownFiles.find((f) => f.path === selectedFile);
			if (!file) {
				setEditStatus("File not found.");
				setIsEditing(false);
				return;
			}
			const original = await plugin.app.vault.read(file);
			const edited = await client.customEdit(original, editInstruction);
			if (edited && edited !== original) {
				await plugin.app.vault.modify(file, edited);
				setEditStatus("Edit applied!");
				setEditInstruction("");
			} else {
				setEditStatus("No changes suggested.");
			}
		} catch (e) {
			setEditStatus("Edit failed: " + (e?.message || e));
		} finally {
			setIsEditing(false);
		}
	};

	if (mode === "edit") {
		return (
			<div className={concat(BASE_CLASSNAME, "edit-mode-container")}>
				<label>
					Select note:
					<select
						value={selectedFile}
						onChange={(e) => setSelectedFile(e.target.value)}
						className={concat(BASE_CLASSNAME, "edit-note-selector")}
					>
						<option value="">-- Choose a note --</option>
						{markdownFiles.map((f) => (
							<option key={f.path} value={f.path}>
								{f.basename}
							</option>
						))}
					</select>
				</label>
				<label style={{ display: "block", marginTop: 8 }}>
					Edit instruction:
					<textarea
						value={editInstruction}
						onChange={(e) => setEditInstruction(e.target.value)}
						rows={3}
						className={concat(
							BASE_CLASSNAME,
							"edit-instruction-input",
						)}
						placeholder="E.g. Summarize, fix grammar, rephrase, etc."
						style={{ width: "100%" }}
					/>
				</label>
				<button
					className={cx("mod-cta", concat(BASE_CLASSNAME, "button"))}
					onClick={handleApplyEdit}
					disabled={isEditing || !selectedFile || !editInstruction}
					style={{ marginTop: 8 }}
				>
					{isEditing ? "Applying..." : "Apply Edit"}
				</button>
				{editStatus && (
					<div
						style={{
							marginTop: 8,
							color: editStatus.includes("fail")
								? "var(--text-error)"
								: "var(--text-normal)",
						}}
					>
						{editStatus}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className={concat(BASE_CLASSNAME, "container")}>
			<ModelSelector isAuthenticated={isAuthenticated} />
			<div className={concat(BASE_CLASSNAME, "input-container")}>
				<textarea
					ref={textareaRef}
					className={cx(
						"setting-item-input",
						concat(BASE_CLASSNAME, "input"),
					)}
					value={message}
					onChange={handleMessageChange}
					onKeyDown={handleKeyDown}
					placeholder="Ask GitHub Copilot something... Use [[]] to link notes"
					disabled={isLoading || !isAuthenticated}
				/>
				{showFileSuggestion && (
					<FileSuggestion
						query={fileSearchQuery}
						position={dropdownPosition}
						onSelect={handleFileSelect}
						onClose={() => setShowFileSuggestion(false)}
						plugin={plugin}
					/>
				)}
				<button
					className={cx("mod-cta", concat(BASE_CLASSNAME, "button"))}
					onClick={handleSubmit}
					disabled={
						isLoading || message.trim() === "" || !isAuthenticated
					}
				>
					{isLoading ? "Thinking..." : "Send"}
				</button>
			</div>
		</div>
	);
};

export default Input;
