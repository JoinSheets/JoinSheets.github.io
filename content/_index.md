+++
title = "JoinSheets"
+++

{{< block "grid-2" >}}
{{< column >}}
# A browser-only table builder

Join flat data sources on a key, compute fields, and export the result —
no server, no install, nothing leaves your machine.

{{< button "/demo/" "Try the demo" >}}
{{< button "/docs/quick-start/" "Quick Start" >}}
{{< /column >}}

{{< column >}}
*Two sources, one key, one result:*

| Customer  | Revenue | Region |
|-----------|---------|--------|
| Acme Corp | 48 000  | EMEA   |
| Globex    | 71 500  | APAC   |
| Initech   | 33 200  | AMER   |
{{< /column >}}
{{< /block >}}

## What it does

{{< grid "3" >}}
{{< column >}}
**Join flat tables**

Combine data sources by key, using set operations — union, subtraction,
intersection, and more.
{{< /column >}}
{{< column >}}
**Parse any data**

Text, dates, numbers, booleans, or empty values — typed and validated
automatically.
{{< /column >}}
{{< column >}}
**Compute fields**

Aggregation, formulas, and priority-based collision resolution when sources
disagree.
{{< /column >}}
{{< column >}}
**Work the table**

Search, sort, group, and filter the joined result, live.
{{< /column >}}
{{< column >}}
**Export anywhere**

Send the result straight to Excel or CSV.
{{< /column >}}
{{< column >}}
**Import from Excel**

Load source data directly with the optional
[JoinSheetsImport](https://github.com/JoinSheets/JoinSheetsImport)
submodule.
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
