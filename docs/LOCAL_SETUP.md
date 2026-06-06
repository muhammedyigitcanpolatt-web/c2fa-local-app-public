# Local Setup

## Purpose

This document shows how to run the public-safe `C2FA Local` source preview on your own machine.

## Requirements

- Node.js installed
- A local clone of the C2FA core repository
- `C2FA_CORE_PATH` pointing to that core repository

## Environment

Copy `.env.example` to `.env` and set the core path.

```bash
cp .env.example .env
```

Example `.env` values:

```bash
C2FA_CORE_PATH=/path/to/c2fa
C2FA_LOCAL_PORT=3005
```

## Install

```bash
npm install
```

## Verify

```bash
./scripts/check-local.sh
```

## Start

```bash
./scripts/start-local.sh
```

The app will run on `http://127.0.0.1:3005` by default.

## Stop

```bash
./scripts/stop-local.sh
```

## Notes

- The app stays local-only.
- Files are written to ignored temporary storage only for the request lifecycle.
- Nothing is uploaded to external services by the app.
