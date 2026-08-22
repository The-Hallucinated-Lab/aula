#!/usr/bin/env python3
"""Strip prose and fences so only the artefact lands on disk.

Handles the markdown case where the answer itself contains nested code fences:
taking the first ``` pair would truncate at the inner fence, so when the outer
fence is tagged `markdown` (or `md`) we take everything up to the LAST fence.
"""
import re
import sys

raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()

# Terminal control sequences, in case a caller still shells out to `ollama run`.
raw = re.sub(r"\x1b?\[[0-9]*[A-Za-z]", "", raw)

out = raw
blocks = 0

opening = re.search(r"```([a-zA-Z0-9+#-]*)\n", raw)
if opening:
    tag = opening.group(1).lower()
    body_start = opening.end()
    closing = raw.rfind("```")
    if tag in ("markdown", "md") and closing > body_start:
        # outermost block: inner fences are part of the content
        out = raw[body_start:closing]
        blocks = 1
    else:
        found = re.findall(r"```(?:[a-zA-Z0-9+#-]*)\n(.*?)```", raw, re.S)
        blocks = len(found)
        if found:
            out = found[0]

with open(sys.argv[2], "w", encoding="utf-8", newline="\n") as f:
    f.write(out.rstrip() + "\n")

print(f"EXTRACTED_LINES={len(out.splitlines())} BLOCKS_FOUND={blocks}")
