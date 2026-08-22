#!/usr/bin/env bash
# Usage: ./.orchestrator/delegate.sh <model> <prompt-file> <output-file> [think]
#
# Dispatches one delegation packet to a local model.
#
# Uses /api/generate rather than `ollama run`: piping `ollama run` into a file
# injects terminal control sequences (\e[5D\e[K) mid-word, which silently
# corrupts the output. Thinking is off by default and enabled only for code
# tasks, per CLAUDE.md §3.1.
set -euo pipefail
MODEL="${1:?model required}"
PROMPT_FILE="${2:?prompt file required}"
OUT_FILE="${3:?output file required}"
THINK="${4:-false}"
NUM_CTX="${ORCH_CTX:-32768}"

mkdir -p .orchestrator/logs
START=$(date +%s)

ORCH_MODEL="$MODEL" ORCH_PROMPT_FILE="$PROMPT_FILE" ORCH_OUT="$OUT_FILE" \
ORCH_THINK="$THINK" ORCH_NUMCTX="$NUM_CTX" python - <<'PY'
import json, os, urllib.request

prompt = open(os.environ['ORCH_PROMPT_FILE'], encoding='utf-8', errors='replace').read()
payload = json.dumps({
    "model": os.environ['ORCH_MODEL'],
    "prompt": prompt,
    "stream": False,
    "think": os.environ['ORCH_THINK'] == 'true',
    "options": {"num_ctx": int(os.environ['ORCH_NUMCTX']), "temperature": 0.2},
}).encode('utf-8')

req = urllib.request.Request(
    "http://localhost:11434/api/generate", data=payload,
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=1800) as r:
    data = json.loads(r.read().decode('utf-8'))

text = data.get('response') or data.get('error') or ''
with open(os.environ['ORCH_OUT'], 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
PY

END=$(date +%s)
echo "MODEL=$MODEL DURATION=$((END-START))s BYTES=$(wc -c < "$OUT_FILE")"
