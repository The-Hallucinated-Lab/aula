#!/usr/bin/env bash
# Keeps the reader resident so every later call answers in a second or two.
READER="${ORCH_READER:-orch-reader}"
curl -s http://localhost:11434/api/generate \
  -d "{\"model\":\"$READER\",\"prompt\":\"ok\",\"keep_alive\":\"8h\",\"stream\":false}" \
  > /dev/null && echo "READER_WARM=$READER"
