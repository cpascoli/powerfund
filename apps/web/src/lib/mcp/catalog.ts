import { z } from "zod";

import { agentOpenApiDocument } from "@/lib/api/agent/openapi";

import { POWERFUND_TOOLS, type PowerFundTool } from "./tools";

/**
 * Renders the generated half of docs/mcp-tools.md from the tool definitions,
 * so the catalog cannot drift from what tools/list serves. catalog.test.ts
 * fails when the committed doc differs; regenerate with
 * `UPDATE_MCP_CATALOG=1 pnpm test -- catalog`.
 */

export const CATALOG_BEGIN = "<!-- BEGIN GENERATED TOOL CATALOG -->";
export const CATALOG_END = "<!-- END GENERATED TOOL CATALOG -->";

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};

function objectShape(schema: JsonSchema): string {
  const required = new Set(schema.required ?? []);
  const keys = Object.entries(schema.properties ?? {}).map(([key, value]) =>
    value.const !== undefined ? `${key}: ${JSON.stringify(value.const)}` : required.has(key) ? key : `${key}?`,
  );
  return `{ ${keys.join(", ")} }`;
}

function typeOf(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    return union.map((row) => (row.type === "object" ? objectShape(row) : typeOf(row))).join(" | ");
  }
  if (schema.type === "array") return `${typeOf(schema.items ?? {})}[]`;
  if (schema.type === "object") return objectShape(schema);
  const base = Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "any");
  // zod emits MAX_SAFE_INTEGER as the bound of every integer; it says nothing.
  const maximum = schema.maximum != null && schema.maximum < Number.MAX_SAFE_INTEGER ? schema.maximum : null;
  const minimum = schema.minimum != null && schema.minimum > Number.MIN_SAFE_INTEGER ? schema.minimum : null;
  const bounds = [
    schema.format === "uuid" ? "uuid" : null,
    schema.format !== "uuid" && schema.pattern?.includes("\\d{4}-") ? "YYYY-MM-DD" : null,
    minimum != null || maximum != null ? (maximum != null ? `${minimum ?? ""}–${maximum}` : `≥ ${minimum}`) : null,
  ].filter(Boolean);
  return bounds.length > 0 ? `${base} (${bounds.join(", ")})` : base;
}

function cell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function restOperations(): Map<string, string> {
  const doc = agentOpenApiDocument("https://powerfund.finance");
  const map = new Map<string, string>();
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, { operationId?: string }>)) {
      if (op?.operationId) map.set(op.operationId, `${method.toUpperCase()} ${path}`);
    }
  }
  return map;
}

function kind(tool: PowerFundTool): string {
  if (tool.annotations.readOnlyHint) return "Read";
  return tool.annotations.destructiveHint ? "Write — modifies or withdraws" : "Write — append";
}

function renderTool(tool: PowerFundTool, rest: Map<string, string>): string {
  const schema = z.toJSONSchema(z.strictObject(tool.inputSchema)) as JsonSchema;
  const required = new Set(schema.required ?? []);
  const inputs = Object.entries(schema.properties ?? {});
  const a = tool.annotations;
  const lines = [
    `### \`${tool.name}\` — ${tool.title}`,
    "",
    tool.description,
    "",
    "| | |",
    "|---|---|",
    `| Kind | ${kind(tool)} |`,
    `| Annotations | readOnlyHint=${a.readOnlyHint}, destructiveHint=${a.destructiveHint}, idempotentHint=${a.idempotentHint}, openWorldHint=${a.openWorldHint} |`,
    `| Scopes (all required) | ${tool.scopes.map((scope) => `\`${scope}\``).join(", ")} |`,
    `| Backing REST | ${tool.operations.map((op) => `\`${op}\` (\`${rest.get(op) ?? "?"}\`)`).join("<br>")} |`,
    "",
  ];
  if (inputs.length === 0) {
    lines.push("No arguments.", "");
  } else {
    lines.push("| Argument | Type | Required | Notes |", "|---|---|---|---|");
    for (const [name, property] of inputs) {
      lines.push(
        `| \`${name}\` | ${cell(typeOf(property))} | ${required.has(name) ? "yes" : ""} | ${cell(property.description)} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderToolCatalog(): string {
  const rest = restOperations();
  const summary = [
    "| Tool | Kind | Scopes | Backing REST operations |",
    "|---|---|---|---|",
    ...POWERFUND_TOOLS.map(
      (tool) =>
        `| \`${tool.name}\` | ${kind(tool)} | ${tool.scopes.map((scope) => `\`${scope}\``).join(" ")} | ${tool.operations.join(", ")} |`,
    ),
  ];
  return [
    CATALOG_BEGIN,
    "",
    ...summary,
    "",
    ...POWERFUND_TOOLS.map((tool) => renderTool(tool, rest)),
    CATALOG_END,
  ].join("\n");
}
