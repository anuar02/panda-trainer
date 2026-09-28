# Local prototype fonts

Downloaded 2026-09-23 from the official Google Fonts repository, unmodified.
Normal-style variable TTF files retain the upstream character coverage and weight
range. No external font service is needed at runtime. Total: 1,621,512 bytes.

| Local file | Source | Git blob SHA-1 |
|---|---|---|
| Inter-variable.ttf | [Inter](https://github.com/google/fonts/blob/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf) | `047c92f6e2212473dc436020afed689527076d44` |
| Montserrat-variable.ttf | [Montserrat](https://github.com/google/fonts/blob/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf) | `c97aca18592834d8706549c279cb8d5ac5d85f69` |

Copyright notices and full SIL Open Font License 1.1 texts are included in
[inter-OFL.txt](inter-OFL.txt) and [montserrat-OFL.txt](montserrat-OFL.txt).
Upstream licenses: [Inter](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt),
[Montserrat](https://github.com/google/fonts/blob/main/ofl/montserrat/OFL.txt).

This is a prototype choice, not a production font-delivery budget: before shipping,
consider WOFF2 and language subsetting while preserving needed Cyrillic/Kazakh glyphs
and the required notices. Do not silently replace these with Latin-only files.

## Instrument additions (28 September 2026)

`JetBrainsMono-variable.ttf` is the upright variable font from the official
JetBrains Mono repository, downloaded from
`https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/variable/JetBrainsMono%5Bwght%5D.ttf`.
License: `jetbrains-mono-OFL.txt` (SIL Open Font License 1.1).
SHA-256: `3cfafa86e28b87184d592fef82846e8c10cb48653c62efcda34f082da225ec34`.

Instrument also gives the existing Inter variable font an `Inter Display` face
alias and uses its `opsz` axis at 32 for screen headings. No additional Inter
binary or license is needed.
