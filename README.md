# C2FA Local

`C2FA Local` is a local-first experimental source preview for reviewing C2FA evidence on your own machine.

## What It Is

This app is a localhost workspace for validator readiness, local file analysis, and local JSON evidence export.

## What It Is Not

This app is not:

- production ready
- public release ready
- a cloud service
- an authenticated SaaS product
- a payment or billing product
- a full C2PA implementation
- a truth, authenticity, or forensic-proof system
- an export/certification system

## Local-First Privacy Model

Analysis and export requests are sent only to the local Next.js server on localhost. Files are written to ignored temporary storage only for the request lifecycle and are cleaned up after the request where possible. Nothing is uploaded to external services by the app.

## Core Dependency

Set `C2FA_CORE_PATH` to your local clone of the core repository before running the app.

Example:

```bash
export C2FA_CORE_PATH=/path/to/c2fa
```

You can also place the value in `.env` after copying from `.env.example`.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `C2FA_CORE_PATH`.

## Run

```bash
./scripts/check-local.sh
./scripts/start-local.sh
./scripts/stop-local.sh
```

If you prefer to run commands manually:

```bash
npm run typecheck
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1 --port 3005
```

## Validator Runtime

The validator panel checks two local runtimes:

- default runtime: `python3 -m cli.main validator-doctor`
- validator runtime: `${C2FA_CORE_PATH}/.venv-c2pa311/bin/python -m cli.main validator-doctor`

The default runtime is expected to show `NEEDS_ATTENTION` when the validator backend is unavailable there. The validator runtime can show `READY_FOR_PRIVATE_PILOT` when the validator-enabled Python 3.11 environment is present. Those are evidence states, not production claims.

## File Analysis Flow

The analysis panel accepts a local file, sends it only to the localhost API route, runs the core C2FA `analyze` command, and then shows the result in layers:

- human summary
- compact C2PA summary
- expandable advanced technical evidence
- raw technical JSON behind an explicit control

Unsupported, malformed, no-manifest, invalid, and validator-missing outcomes are shown as evidence states, not as proof of truth or authenticity.

## Result Meanings

- `verified` means validator-backed C2PA validation status, not physical-world truth.
- `not_present` means no C2PA manifest was detected.
- `invalid` means C2PA data was present but validation failed.
- `error/unsupported` means the file could not be analyzed through the current validator path.

## Export Meaning

The same local file can also be exported as a receipt or report JSON evidence record through the core CLI.

Exports are generated locally, downloaded only when the operator clicks the export button, and remain evidence records rather than certification.

> Exports are evidence records for local review. They are not certification and do not prove that media content is true or authentic.

## Safety Wording

> C2FA Local verifies file-level integrity evidence and available C2PA-related metadata. It does not prove that media content is true or authentic.

## Limitations

- Full C2PA coverage is not claimed.
- Production readiness is not claimed.
- Public release readiness is not claimed.
- Exported JSON is evidence, not certification.
- The app does not prove media truth, authenticity, or forensic certainty.
- The app does not add cloud upload, auth, payment, analytics, telemetry, or SaaS hosting.

## Status

Public-safe source preview — not production-ready

## Docs

- [Local setup](docs/LOCAL_SETUP.md)
- [Result interpretation](docs/RESULT_INTERPRETATION.md)
- [Claim boundaries](docs/CLAIM_BOUNDARIES.md)
