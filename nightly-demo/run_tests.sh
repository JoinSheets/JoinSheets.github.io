#!/bin/bash
set -e
# An explicit list, not a recursive node --test auto-search: otherwise, with the
# optional submodule initialized (import/, see JoinSheetsImport), its own tests
# (import/tests/*.test.js) would get swept into this run too -- two separate
# repositories with their own tests and runs shouldn't mix.
node --test tests/*.test.js
