/**
 * One JSON line per MCP request and per tool call, for Netlify's function
 * log. Fields are chosen so a failure can be placed — adapter, authorization
 * or PowerFund API — without logging what was asked or returned: no tokens,
 * no Authorization header, no arguments, no portfolio payloads.
 */
export type ToolLogEntry = {
  tool: string;
  principal: string;
  outcome: "ok" | "error";
  duration_ms: number;
  error_source?: string;
  error_code?: string;
  downstream: Array<{ op: string; status: number; ms: number }>;
};

export type RequestLogEntry = {
  method: string;
  /** JSON-RPC methods in the body, e.g. ["tools/call"]. */
  rpc: string[];
  status: number;
  duration_ms: number;
  principal?: string;
  auth?: "oauth" | "agent_key" | "none";
  auth_error?: string;
};

export type McpLogger = {
  request(entry: RequestLogEntry): void;
  tool(entry: ToolLogEntry): void;
  error(event: string, error: unknown, context?: Record<string, string>): void;
};

export function createMcpLogger(
  requestId: string,
  sink: (line: string) => void = (line) => console.log(line),
): McpLogger {
  const emit = (event: string, fields: object) =>
    sink(JSON.stringify({ evt: event, request_id: requestId, ...fields }));
  return {
    request: (entry) => emit("mcp.request", entry),
    tool: (entry) => emit("mcp.tool", entry),
    error: (event, error, context) =>
      emit(event, {
        ...context,
        // Name and message only. A stack is useful locally but can carry
        // query text; Netlify retains these logs.
        error_name: error instanceof Error ? error.name : typeof error,
        error_message: error instanceof Error ? error.message.slice(0, 300) : undefined,
      }),
  };
}

export const silentMcpLogger: McpLogger = {
  request: () => {},
  tool: () => {},
  error: () => {},
};
