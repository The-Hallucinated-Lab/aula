#!/usr/bin/env bash
# Usage: ./.orchestrator/ask.sh <file-or-"-"> "<question>" [max-lines]
#
# Sends content + a question to the resident reader model and returns a short
# answer. Uses /api/generate rather than `ollama run` so that:
#   - thinking mode is explicitly OFF (CLAUDE.md §3.1 — extraction, not reasoning)
#   - the context window and temperature are pinned per call
#   - no TTY spinner escape codes end up in the output
#
# JSON is built and parsed with Python because jq is not available here.
set -euo pipefail
SRC="${1:?file or - required}"
Q="${2:?question required}"
MAXLINES="${3:-25}"
READER="${ORCH_READER:-orch-reader}"
NUM_CTX="${ORCH_CTX:-65536}"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT
if [ "$SRC" = "-" ]; then cat > "$BODY_FILE"; else cat "$SRC" > "$BODY_FILE"; fi

ORCH_Q="$Q" ORCH_MAXLINES="$MAXLINES" ORCH_MODEL="$READER" \
ORCH_NUMCTX="$NUM_CTX" ORCH_BODY_FILE="$BODY_FILE" python - <<'PY' | head -n "$MAXLINES"
import json, os, urllib.request

body = open(os.environ['ORCH_BODY_FILE'], encoding='utf-8', errors='replace').read()
prompt = (
    "You are a code-reading assistant. Answer ONLY from the content below.\n"
    "If the answer is not present, reply exactly: NOT_FOUND.\n"
    "Do not summarize anything not asked. Do not add preamble, reasoning or opinions.\n"
    "Quote exact identifiers and signatures where relevant.\n"
    f"Hard limit: {os.environ['ORCH_MAXLINES']} lines of output.\n\n"
    f"QUESTION: {os.environ['ORCH_Q']}\n\n"
    "--- CONTENT START ---\n" + body + "\n--- CONTENT END ---\n"
)

payload = json.dumps({
    "model": os.environ['ORCH_MODEL'],
    "prompt": prompt,
    "stream": False,
    "think": False,
    "options": {"num_ctx": int(os.environ['ORCH_NUMCTX']), "temperature": 0.1},
}).encode('utf-8')

req = urllib.request.Request(
    "http://localhost:11434/api/generate", data=payload,
    headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=900) as r:
        data = json.loads(r.read().decode('utf-8'))
    print(data.get('response') or data.get('error') or 'NO_RESPONSE')
except Exception as exc:
    print(f'READER_ERROR: {exc}')
PY
