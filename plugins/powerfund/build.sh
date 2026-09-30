#!/usr/bin/env bash
# Assemble an installable PowerFund plugin in plugins/dist/.
#
#   plugins/powerfund/build.sh                     # production endpoint
#   plugins/powerfund/build.sh --staging <mcp-url> # e.g. a Deploy Preview
#
# The skill's reference files are copied from docs/ at build time rather than
# committed twice, so the plugin always carries the current operating process.
# A staging build is named powerfund-staging so it can be installed next to
# the real plugin without either shadowing the other.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SRC="$ROOT/plugins/powerfund"
# Production's canonical MCP URL. It must be the primary domain: the server
# advertises its resource from Netlify's primary URL, and a client connecting
# through another hostname (powerfund.netlify.app) fails resource validation.
URL="https://powerfund.finance/api/v1/mcp"
NAME="powerfund"
DISPLAY="PowerFund"

if [[ "${1:-}" == "--staging" ]]; then
  URL="${2:?usage: build.sh --staging <mcp-url>}"
  NAME="powerfund-staging"
  DISPLAY="PowerFund (staging)"
fi

case "$URL" in
  https://*/api/v1/mcp) ;;
  http://localhost:*/api/v1/mcp | http://127.0.0.1:*/api/v1/mcp)
    echo "warning: $URL is plain HTTP; ChatGPT needs HTTPS (use a tunnel or a Deploy Preview)." >&2 ;;
  *) echo "error: MCP URL must end in /api/v1/mcp and be https (got $URL)" >&2; exit 1 ;;
esac

OUT="$ROOT/plugins/dist/$NAME"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$SRC/skills" "$OUT/"
for doc in gpt-agent-process mandate goals themes; do
  cp "$ROOT/docs/$doc.md" "$OUT/skills/powerfund/references/$doc.md"
done

python3 - "$SRC" "$OUT" "$URL" "$NAME" "$DISPLAY" <<'PY'
import json, sys
src, out, url, name, display = sys.argv[1:]
plugin = json.load(open(f"{src}/plugin.json"))
plugin["name"] = name
plugin["extensions"]["com.openai"]["interface"]["displayName"] = display
json.dump(plugin, open(f"{out}/plugin.json", "w"), indent=2)
mcp = json.load(open(f"{src}/mcp.json"))
server = mcp["mcpServers"].pop("powerfund")
server["url"] = url
# No credentials here, ever: the client obtains an OAuth token itself.
assert set(server) == {"type", "url"}, server
mcp["mcpServers"][name] = server
json.dump(mcp, open(f"{out}/mcp.json", "w"), indent=2)
PY

(cd "$ROOT/plugins/dist" && rm -f "$NAME.zip" && zip -qr "$NAME.zip" "$NAME")
echo "Built $OUT and plugins/dist/$NAME.zip → $URL"
