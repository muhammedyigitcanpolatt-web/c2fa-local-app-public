#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/c2fa-local"
LOG_FILE="${STATE_DIR}/start-local.log"
PID_FILE="${STATE_DIR}/start-local.pid"
HOST="${C2FA_LOCAL_HOST:-127.0.0.1}"
PORT="${C2FA_LOCAL_PORT:-3005}"
URL="http://${HOST}:${PORT}"

load_env() {
  if [[ -f "${APP_ROOT}/.env" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${APP_ROOT}/.env"
    set +a
  fi
}

load_env

if [[ -z "${C2FA_CORE_PATH:-}" ]]; then
  echo "C2FA_CORE_PATH is required."
  echo "Set it in your environment or copy .env.example to .env and edit it."
  exit 1
fi

if [[ ! -d "${C2FA_CORE_PATH}" ]]; then
  echo "Core repo not found at ${C2FA_CORE_PATH}."
  exit 1
fi

if [[ ! -d "${APP_ROOT}/node_modules" ]]; then
  echo "Dependencies are missing."
  echo "Run: npm install"
  exit 1
fi

if [[ ! -d "${APP_ROOT}/.next" ]]; then
  echo "Production build output is missing."
  echo "Run: npm run build"
  exit 1
fi

mkdir -p "${STATE_DIR}"

if command -v lsof >/dev/null 2>&1; then
  existing_pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t || true)"
  if [[ -n "${existing_pids}" ]]; then
    existing_pid="$(printf '%s\n' "${existing_pids}" | head -n 1)"
    existing_cmd="$(ps -p "${existing_pid}" -o command= | sed 's/^ *//')"
    echo "Local app is already listening on ${URL}."
    echo "PID: ${existing_pid}"
    echo "Command: ${existing_cmd}"
    echo "Claim boundary:"
    echo "C2FA Local verifies file-level integrity evidence and available C2PA-related metadata. It does not prove that media content is true or authentic."
    if command -v open >/dev/null 2>&1; then
      open "${URL}" >/dev/null 2>&1 || true
    fi
    exit 0
  fi
fi

echo "Starting local app on ${URL}..."
echo "Claim boundary:"
echo "C2FA Local verifies file-level integrity evidence and available C2PA-related metadata. It does not prove that media content is true or authentic."
echo "No cloud upload, analytics, telemetry, auth, payment, or SaaS hosting is used."
echo "Log file: ${LOG_FILE}"

pid="$(
  APP_ROOT="${APP_ROOT}" \
  HOST="${HOST}" \
  PORT="${PORT}" \
  LOG_FILE="${LOG_FILE}" \
  node <<'NODE'
const { spawn } = require("child_process");
const fs = require("fs");

const appRoot = process.env.APP_ROOT;
const host = process.env.HOST;
const port = process.env.PORT;
const logFile = process.env.LOG_FILE;

const out = fs.openSync(logFile, "a");
const err = fs.openSync(logFile, "a");
const child = spawn(
  `${appRoot}/node_modules/.bin/next`,
  ["start", "--hostname", host, "--port", port],
  {
    cwd: appRoot,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", out, err],
  },
);

child.unref();
process.stdout.write(String(child.pid));
NODE
)"

printf '%s\n' "${pid}" > "${PID_FILE}"

for _ in $(seq 1 60); do
  if curl -fsS "${URL}" >/dev/null 2>&1; then
    echo "Local app is ready at ${URL}"
    if command -v open >/dev/null 2>&1; then
      open "${URL}" >/dev/null 2>&1 || true
    fi
    exit 0
  fi

  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    echo "Local app stopped unexpectedly."
    echo "See: ${LOG_FILE}"
    tail -n 40 "${LOG_FILE}" 2>/dev/null || true
    exit 1
  fi

  sleep 1
done

echo "Timed out waiting for ${URL}."
echo "See: ${LOG_FILE}"
tail -n 40 "${LOG_FILE}" 2>/dev/null || true
exit 1
