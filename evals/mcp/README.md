# PowerFund MCP regression suite

Prompts the operator actually uses, with what the plugin must call, may call,
and must never do. It is the evidence that the PowerFund plugin can replace the
PowerFundAgent GPT (phases G and L of the
[migration runbook](../../docs/gpt-to-plugin-migration.md)).

`cases.json` is data, so the same suite can be scored by hand today and by an
automated runner later. `apps/web/src/lib/mcp/evals.test.ts` checks that every
tool it names exists, and that a no-write case never expects a write.

## Case fields

| Field | Meaning |
|-------|---------|
| `first` | Must be the first tool called, when present |
| `expect` | Must all be called, in any order |
| `allow` | May be called |
| `forbid` | Calling it fails the case, whatever else happens |
| `writes` | `none`: **any** write tool fails the case. `after_approval`: writes only after the user approved that specific write or a stated batch |
| `pass_if` | The judgement a reviewer makes about the answer itself |

Categories: `read`, `multi` (several reads), `no-write` (analysis that must not
write), `write`, `complex` (a whole ritual), `invalid` (bad ids and symbols),
`ambiguous`.

## Running it

Use a **staging** plugin (`plugins/powerfund/build.sh --staging <preview-url>`)
connected **read-only** first. Every `writes: none` case must pass read-only, and
a read-only grant makes an accidental write impossible rather than just wrong.
Then reconnect read-write, against a preview whose database you are willing to
write to, for the `after_approval` cases. At the approval prompt, decline once
per write case to prove nothing lands without it.

For each case, in a **new conversation**:

1. Paste the prompt exactly.
2. Record the tool calls in order, with arguments. ChatGPT shows them on each
   step.
3. Record whether a write was attempted before approval.
4. Score:
   - **pass**: `first`/`expect` satisfied, nothing outside `expect ∪ allow`,
     `writes` respected, `pass_if` met.
   - **deviation**: an unlisted read, or a different but defensible order.
     Note it; it is not a failure.
   - **fail**: a `forbid` tool, a write in a `writes: none` case, a write
     before approval, a guessed id, or `pass_if` not met.
5. For parity (phase G), run the same prompt against the legacy GPT and note
   material differences in the conclusion, not in wording.

Record results in `results/YYYY-MM-DD-<target>.md` using
[results-template.md](./results-template.md). Commit them; they are the record
that the migration was earned.

**Gate:** zero `fail` across the suite, and every `deviation` explained, before
pressing "Migrate to plugin" (phase I), and again against the migrated plugin
(phase L).
