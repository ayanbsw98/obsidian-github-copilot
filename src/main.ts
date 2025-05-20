import { Notice, Plugin, WorkspaceLeaf } from "obsidian";

import EventManager from "./events/EventManager";
import CopilotAgent from "./copilot/CopilotAgent";
import StatusBar from "./status/StatusBar";
import CopilotPluginSettingTab, {
	CopilotPluginSettings,
	DEFAULT_SETTINGS,
} from "./settings/CopilotPluginSettingTab";
import ExtensionManager from "./extensions/ExtensionManager";
import Vault from "./helpers/Vault";
import File from "./helpers/File";
import Logger from "./helpers/Logger";
import Cacher from "./copilot/Cacher";
import ChatView from "./copilot-chat/views/ChatView";

// @ts-expect-error - import to be bundled
import agentInitializer from "official-copilot/agent-initializer.txt";
// @ts-expect-error - import to be bundled
import agent from "official-copilot/agent.txt";
// @ts-expect-error - import to be bundled
import cl100k from "official-copilot/resources/cl100k_base.tiktoken";
// @ts-expect-error - import to be bundled
import o200k from "official-copilot/resources/o200k_base.tiktoken";
// @ts-expect-error - import to be bundled
import cl100kNoIndex from "official-copilot/resources/cl100k_base.tiktoken.noindex";
// @ts-expect-error - import to be bundled
import o200kNoIndex from "official-copilot/resources/o200k_base.tiktoken.noindex";
// @ts-expect-error - import to be bundled
import crypt32 from "official-copilot/resources/crypt32.node";
import { CHAT_VIEW_TYPE } from "./copilot-chat/types/constants";

export default class CopilotPlugin extends Plugin {
	settingsTab: CopilotPluginSettingTab;
	settings: CopilotPluginSettings;
	statusBar: StatusBar | null;
	copilotAgent: CopilotAgent;
	private cmExtensionManager: ExtensionManager;
	private eventManager: EventManager;
	version = "1.1.2";
	tabSize = Vault.DEFAULT_TAB_SIZE;

	async onload() {
		this.settingsTab = new CopilotPluginSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		await this.settingsTab.loadSettings();

		this.statusBar = new StatusBar(this);

		Logger.getInstance().setDebug(this.settings.debug);

		this.tabSize = Vault.getTabSize(this.app);

		// Recreate or update the copilot folder and artifacts from the bundle
		if (
			!File.doesFolderExist(Vault.getCopilotPath(this.app, this.version))
		) {
			await File.createFolder(
				Vault.getCopilotResourcesPath(this.app, this.version),
			);
			await File.createFile(
				Vault.getAgentInitializerPath(this.app, this.version),
				agentInitializer,
			)
			await File.createFile(
				Vault.getAgentPath(this.app, this.version),
				agent,
			);
			await File.createFile(
				`${Vault.getCopilotResourcesPath(this.app, this.version)}/cl100k_base.tiktoken`,
				cl100k,
			);
			await File.createFile(
				`${Vault.getCopilotResourcesPath(this.app, this.version)}/o200k_base.tiktoken`,
				o200k,
			);
			await File.createFile(
				`${Vault.getCopilotResourcesPath(this.app, this.version)}/cl100k_base.tiktoken.noindex`,
				cl100kNoIndex,
			);
			await File.createFile(
				`${Vault.getCopilotResourcesPath(this.app, this.version)}/o200k_base.tiktoken.noindex`,
				o200kNoIndex,
			);
			await File.createFile(
				`${Vault.getCopilotPath(this.app, this.version)}/crypt32.node`,
				crypt32,
			);
			await File.removeOldCopilotFolders(
				this.version,
				Vault.getPluginPath(this.app),
			);
		}

		if (
			this.settings.nodePath === DEFAULT_SETTINGS.nodePath ||
			this.settings.nodePath === ""
		) {
			new Notice(
				"[GitHub Copilot] Please set the path to your node executable in the settings to use autocomplete feature.",
			);
		}

		if (this.settingsTab.isCopilotEnabled() && !this.settings.nodePathUpdatedToNode20) {
			new Notice(
				"[GitHub Copilot] Copilot has changed the minimum node version to 20. Please update your node version if you are using an older version.",
			);	
		}

		this.copilotAgent = new CopilotAgent(this);
		if (await this.settingsTab.isCopilotEnabledWithPathCheck()) {
			await this.copilotAgent.setup();
		}

		this.eventManager = new EventManager(this);
		this.eventManager.registerEvents();

		this.cmExtensionManager = new ExtensionManager(this);
		this.registerEditorExtension(this.cmExtensionManager.getExtensions());

		const file = this.app.workspace.getActiveFile();
		if (file) {
			Cacher.getInstance().setCurrentFilePath(
				Vault.getBasePath(this.app),
				file.path,
			);
		}

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
		this.activateView();

		// --- Copilot Edit Mode Command ---
		this.addCommand({
			id: "copilot-edit-selection",
			name: "Copilot: Edit Selection",
			editorCallback: async (editor, view) => {
				const selectedText = editor.getSelection();
				if (!selectedText) {
					new Notice("No text selected.");
					return;
				}
				const instruction = await (this.app as any).prompt?.("Describe the edit you want Copilot to make:");
				if (!instruction) return;
				try {
					const editedText = await this.copilotAgent.getClient().customEdit(selectedText, instruction);
					if (editedText) editor.replaceSelection(editedText);
					else new Notice("Copilot did not return an edit.");
				} catch (e) {
					new Notice("Copilot edit failed.");
				}
			}
		});

		// --- Copilot Agent Mode Command ---
		this.addCommand({
			id: "copilot-agent-action",
			name: "Copilot: Agent Action",
			callback: async () => {
				const instruction = await (this.app as any).prompt?.("What would you like Copilot to do?");
				if (!instruction) return;
				try {
					const agentResponse = await this.copilotAgent.getClient().customAgent(instruction);
					// Example: handle create_note and run_command actions
					if (agentResponse?.action === "create_note") {
						await this.app.vault.create(agentResponse.title + ".md", agentResponse.content || "");
						new Notice(`Note '${agentResponse.title}' created.`);
					} else if (agentResponse?.action === "run_command") {
						this.app.commands.executeCommandById(agentResponse.commandId);
						new Notice(`Command '${agentResponse.commandId}' executed.`);
					} else {
						new Notice("Copilot agent did not return a recognized action.");
					}
				} catch (e) {
					new Notice("Copilot agent action failed.");
				}
			}
		});
	}

	onunload() {
		this.copilotAgent?.stopAgent();
		this.statusBar = null;
		this.deactivateView();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		}
		if (!leaf) {
			Logger.getInstance().error("Failed to create chat view.");
			return;
		}
	}

	async deactivateView() {
		this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
	}
}
