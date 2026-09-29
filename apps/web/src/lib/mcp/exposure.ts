/**
 * Which agent API operations the MCP surface exposes, decided one by one.
 *
 * The MCP surface is curated, not derived: an operation added to
 * /api/v1/agent/* does not become an LLM capability by existing. What is
 * enforced (exposure.test.ts) is that every operation has been *classified*
 * here, exposed or excluded with a reason, and that the tools agree with that
 * classification. A new route therefore fails the build until someone decides
 * what it means for the agent, which is the decision worth forcing.
 *
 * Today every operation but the index is exposed, because the agent API was
 * designed for PowerFundAgent and the plugin must not lose anything the GPT
 * could do. That is a property of this table, not a rule about the future.
 */
export type OperationExposure =
  | { mcp: "exposed" }
  | { mcp: "excluded"; reason: string };

export const AGENT_OPERATION_EXPOSURE: Record<string, OperationExposure> = {
  getAgentIndex: {
    mcp: "excluded",
    reason: "Discovery document for HTTP clients; MCP clients discover capabilities with tools/list.",
  },
  getFundState: { mcp: "exposed" },
  getPortfolio: { mcp: "exposed" },
  getPerformance: { mcp: "exposed" },
  getJournal: { mcp: "exposed" },
  getCalibrationStatus: { mcp: "exposed" },
  getPlannedActions: { mcp: "exposed" },
  getResearchInbox: { mcp: "exposed" },
  getReviewQueue: { mcp: "exposed" },
  getCompanyDossier: { mcp: "exposed" },
  getDossierVersions: { mcp: "exposed" },
  getDossierVersion: { mcp: "exposed" },
  updateDossier: { mcp: "exposed" },
  createDecision: { mcp: "exposed" },
  recordDecisionOutcome: { mcp: "exposed" },
  createPlannedAction: { mcp: "exposed" },
  updatePlannedAction: { mcp: "exposed" },
  createReviewTask: { mcp: "exposed" },
  updateReviewTask: { mcp: "exposed" },
  completeReviewTask: { mcp: "exposed" },
  addWatchlistCompany: { mcp: "exposed" },
  setWatchlistArchived: { mcp: "exposed" },
};
