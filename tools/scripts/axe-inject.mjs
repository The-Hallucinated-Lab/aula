// Emits axe-core as a single JS expression the browser tool can evaluate.
import { readFileSync } from 'node:fs'
process.stdout.write(readFileSync('node_modules/axe-core/axe.min.js', 'utf-8'))
