import * as path from "path"
import * as os from "os"

export interface ElectronState {
	// Linear integration
	linearApiKey: string
	linearTeamId: string
	linkedLinearIssueId: string
	linkedLinearIssueIdentifier: string
	linkedLinearDoneStateId: string
	// GitHub integration
	githubToken: string
	githubOwner: string
	githubRepo: string
	githubUsername: string
	linkedGithubIssueNumber: number
	linkedGithubIssueTitle: string
	// Misc
	prInstructions: string
	defaultClonePath: string
}

const DEFAULTS: ElectronState = {
	linearApiKey: "",
	linearTeamId: "",
	linkedLinearIssueId: "",
	linkedLinearIssueIdentifier: "",
	linkedLinearDoneStateId: "",
	githubToken: "",
	githubOwner: "",
	githubRepo: "",
	githubUsername: "",
	linkedGithubIssueNumber: 0,
	linkedGithubIssueTitle: "",
	prInstructions: "",
	defaultClonePath: path.join(os.homedir(), "mastra-code", "workspaces"),
}

export class ElectronStateManager {
	private state: ElectronState

	constructor(initial?: Partial<ElectronState>) {
		this.state = { ...DEFAULTS, ...initial }
	}

	getState(): Readonly<ElectronState> {
		return this.state
	}

	setState(updates: Partial<ElectronState>): void {
		this.state = { ...this.state, ...updates }
	}
}
