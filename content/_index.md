+++
title = "JoinSheets"
+++

# A browser-only table builder

Join flat data sources on a key, compute fields, and export the result —
no server, no install, nothing leaves your machine.

{{< button "/demo/" "Try the demo" >}}
{{< button "/docs/quick-start/" "Quick Start" >}}

## What it does

{{< grid "3" >}}
{{< column >}}
<span class="feature-title">Join flat tables</span>

Combine data sources by key, using set operations — union, subtraction,
intersection, and more.
{{< /column >}}
{{< column >}}
<span class="feature-title">Parse any data</span>

Text, dates, numbers, booleans, or empty values — typed and validated
automatically.
{{< /column >}}
{{< column >}}
<span class="feature-title">Compute fields</span>

Aggregation, formulas, and priority-based collision resolution when sources
disagree.
{{< /column >}}
{{< column >}}
<span class="feature-title">Work the table</span>

Search, sort, group, and filter the joined result, live.
{{< /column >}}
{{< column >}}
<span class="feature-title">End to end</span>

Data comes in and goes out as tables — import from Excel, work the result,
export back to Excel or CSV.
{{< /column >}}
{{< /grid >}}

## Why JoinSheets

{{< grid "2" >}}
{{< column >}}
**No server**

Download the repository and open `index.html` — that's the whole install.
{{< /column >}}
{{< column >}}
**Your data stays local**

JoinSheets only reads the files you point it at. Nothing is uploaded,
nothing is tracked.
{{< /column >}}
{{< column >}}
**Zero build**

No bundler, no package manager, no build step — plain files, runs straight
off `file://`.
{{< /column >}}
{{< column >}}
**Open source**

Apache-2.0 licensed, on GitHub for anyone to read, fork, or contribute to.
{{< /column >}}
{{< /grid >}}

## Where to go next

New to JoinSheets? Start with the five-step walkthrough, or browse the full
documentation.

{{< button "/docs/quick-start/" "Quick Start" >}}
{{< button "/docs/" "Documentation" >}}

{{< tip >}}
**Want to learn how JoinSheets works under the hood?** The
[advanced course](https://github.com/JoinSheets/JoinSheetsRoast) walks
through this exact codebase — browser internals, DevTools, testing — and is
also the fastest way to onboard onto the project itself if you're thinking
of contributing. Its capstone ports one of the app's hot paths to Rust and
WebAssembly for a measured performance win. Russian only, for now.
{{< /tip >}}
