import type { CSSProperties, ReactNode } from "react";

import { playbookHref } from "@/lib/docs";

/**
 * Minimal, dependency-free Markdown renderer for our own docs. It supports
 * exactly the constructs we author: ATX headings, paragraphs, ordered/unordered
 * lists (including task checkboxes), GFM tables, horizontal rules, and inline
 * bold / italic / code / markdown links / bare http(s) URLs. It deliberately
 * does not handle raw HTML, so rendering a trusted repo document cannot inject
 * markup.
 */

type Alignment = "left" | "center" | "right";

type InlineType = "link" | "autolink" | "bold" | "code" | "italic";

function splitAutolink(raw: string): { href: string; trailing: string } {
  let href = raw;
  let trailing = "";
  while (href.length > 0 && /[.,;:!?)]$/.test(href)) {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const patterns: Array<{ type: InlineType; re: RegExp }> = [
    { type: "link", re: /\[([^\]]+)\]\(([^)]+)\)/ },
    { type: "autolink", re: /https?:\/\/[^\s<>[\]()]+/ },
    { type: "bold", re: /\*\*([^]+?)\*\*/ },
    { type: "code", re: /`([^`]+)`/ },
    { type: "italic", re: /\*([^]+?)\*/ },
  ];

  const nodes: ReactNode[] = [];
  let rest = text;
  let counter = 0;

  while (rest.length > 0) {
    let best: { type: InlineType; match: RegExpExecArray } | null = null;
    for (const pattern of patterns) {
      const match = pattern.re.exec(rest);
      if (match && (best === null || match.index < best.match.index)) {
        best = { type: pattern.type, match };
      }
    }

    if (best === null) {
      nodes.push(rest);
      break;
    }

    if (best.match.index > 0) {
      nodes.push(rest.slice(0, best.match.index));
    }

    const key = `${keyPrefix}-i${counter++}`;
    switch (best.type) {
      case "link": {
        const label = best.match[1] ?? "";
        const href = best.match[2] ?? "";
        const routed = playbookHref(href);
        if (routed) {
          nodes.push(
            <a key={key} href={routed}>
              {renderInline(label, key)}
            </a>,
          );
        } else if (/^https?:\/\//.test(href)) {
          nodes.push(
            <a key={key} href={href} target="_blank" rel="noreferrer">
              {renderInline(label, key)}
            </a>,
          );
        } else {
          // Relative links to files that are not Playbook routes (reviews,
          // architecture) stay as marked references rather than broken anchors.
          nodes.push(
            <span key={key} className="doc-ref" title={href}>
              {renderInline(label, key)}
            </span>,
          );
        }
        break;
      }
      case "autolink": {
        const { href, trailing } = splitAutolink(best.match[0] ?? "");
        if (/^https?:\/\//.test(href)) {
          nodes.push(
            <a key={key} href={href} target="_blank" rel="noreferrer">
              {href}
            </a>,
          );
          if (trailing.length > 0) nodes.push(trailing);
        } else {
          nodes.push(best.match[0] ?? "");
        }
        break;
      }
      case "bold":
        nodes.push(<strong key={key}>{renderInline(best.match[1] ?? "", key)}</strong>);
        break;
      case "code":
        nodes.push(<code key={key}>{best.match[1]}</code>);
        break;
      case "italic":
        nodes.push(<em key={key}>{renderInline(best.match[1] ?? "", key)}</em>);
        break;
      default: {
        const _exhaustive: never = best.type;
        return _exhaustive;
      }
    }

    rest = rest.slice(best.match.index + best.match[0].length);
  }

  return nodes;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseAlignments(separator: string): Alignment[] {
  return splitTableRow(separator).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

function alignStyle(alignment: Alignment | undefined): CSSProperties | undefined {
  return alignment && alignment !== "left" ? { textAlign: alignment } : undefined;
}

export function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;
  let strippedTitle = false;

  const isTable = (line: string) => line.trim().startsWith("|");
  const isOrdered = (line: string) => /^\s*\d+\.\s+/.test(line);
  const isUnordered = (line: string) => /^\s*[-*]\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const content = heading[2]!;
      // The page supplies its own <h1>; drop the document's leading title.
      if (level === 1 && !strippedTitle) {
        strippedTitle = true;
        index += 1;
        continue;
      }
      const Tag = `h${Math.min(level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={`b${key++}`}>{renderInline(content, `b${key}`)}</Tag>);
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={`b${key++}`} />);
      index += 1;
      continue;
    }

    if (isTable(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTable(lines[index] ?? "")) {
        tableLines.push(lines[index]!);
        index += 1;
      }
      if (tableLines.length >= 2) {
        const header = splitTableRow(tableLines[0]!);
        const alignments = parseAlignments(tableLines[1]!);
        const bodyRows = tableLines.slice(2).map(splitTableRow);
        const tableKey = `b${key++}`;
        blocks.push(
          <table key={tableKey}>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`${tableKey}-h${cellIndex}`} style={alignStyle(alignments[cellIndex])}>
                    {renderInline(cell, `${tableKey}-h${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`${tableKey}-r${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${tableKey}-r${rowIndex}c${cellIndex}`} style={alignStyle(alignments[cellIndex])}>
                      {renderInline(cell, `${tableKey}-r${rowIndex}c${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>,
        );
      }
      continue;
    }

    if (isOrdered(line)) {
      const items: string[] = [];
      while (index < lines.length && isOrdered(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      const listKey = `b${key++}`;
      blocks.push(
        <ol key={listKey}>
          {items.map((item, itemIndex) => (
            <li key={`${listKey}-${itemIndex}`}>{renderInline(item, `${listKey}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (isUnordered(line)) {
      const items: string[] = [];
      while (index < lines.length && isUnordered(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      const listKey = `b${key++}`;
      blocks.push(
        <ul key={listKey}>
          {items.map((item, itemIndex) => {
            const itemKey = `${listKey}-${itemIndex}`;
            const checkbox = /^\[([ xX])\]\s+/.exec(item);
            if (checkbox) {
              const checked = checkbox[1] !== " ";
              const rest = item.slice(checkbox[0].length);
              return (
                <li key={itemKey} className="doc-check">
                  <input
                    type="checkbox"
                    disabled
                    defaultChecked={checked}
                    tabIndex={-1}
                  />
                  <span>{renderInline(rest, itemKey)}</span>
                </li>
              );
            }
            return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
          })}
        </ul>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim() === "" ||
        /^#{1,6}\s+/.test(current) ||
        /^-{3,}$/.test(current.trim()) ||
        isTable(current) ||
        isOrdered(current) ||
        isUnordered(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    const paragraphKey = `b${key++}`;
    blocks.push(<p key={paragraphKey}>{renderInline(paragraph.join(" "), paragraphKey)}</p>);
  }

  return blocks;
}
