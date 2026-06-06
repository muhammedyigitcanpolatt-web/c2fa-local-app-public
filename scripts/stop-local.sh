#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PORT="${C2FA_LOCAL_PORT:-3005}"
STATE_DIR="${TMPDIR:-/tmp}/c2fa-local"
PID_FILE="${STATE_DIR}/start-local.pid"
URL="http://127.0.0.1:${PORT}"

cd "${APP_ROOT}"

candidate_pids=()
saved_pid=""
if [[ -f "${PID_FILE}" ]]; then
  saved_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${saved_pid}" ]]; then
    candidate_pids+=("${saved_pid}")
  fi
fi

if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [[ -n "${pid}" ]] && candidate_pids+=("${pid}")
  done < <(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)
fi

if [[ "${#candidate_pids[@]}" -eq 0 ]]; then
  echo "No process is currently listening on ${URL}."
  exit 0
fi

stopped_any=0
seen_pids=" "

pid_seen() {
  case "${seen_pids}" in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

mark_pid_seen() {
  seen_pids="${seen_pids}${1} "
}

for pid in "${candidate_pids[@]}"; do
  [[ -n "${pid}" ]] || continue
  if pid_seen "${pid}"; then
    continue
  fi
  mark_pid_seen "${pid}"

  if ! ps -p "${pid}" >/dev/null 2>&1; then
    continue
  fi

  cmd="$(ps -p "${pid}" -o command= | sed 's/^ *//')"
  is_saved_pid=0
  if [[ -n "${saved_pid}" && "${pid}" == "${saved_pid}" ]]; then
    is_saved_pid=1
  fi

  if [[ "${is_saved_pid}" -eq 1 ]]; then
    if ! lsof -nP -p "${pid}" -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Skipping PID ${pid}; saved PID file does not match a listener on port ${PORT}."
      continue
    fi
  elif [[ "${cmd}" != *"${APP_ROOT}"* && "${cmd}" != *"next dev"* && "${cmd}" != *"next start"* && "${cmd}" != *"next-server"* ]]; then
    echo "Skipping PID ${pid}; command does not clearly match the local app."
    echo "Command: ${cmd}"
    continue
  fi

  echo "Stopping PID ${pid}"
  echo "Command: ${cmd}"
  kill "${pid}" >/dev/null 2>&1 || true
  stopped_any=1
done

sleep 2

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is still in use."
  echo "If the remaining process is unrelated, stop it manually."
  exit 1
fi

if [[ "${stopped_any}" -eq 1 ]]; then
  echo "Local app stopped on ${URL}."
else
  echo "No safe local-app process was stopped."
fi
