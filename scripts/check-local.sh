#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

echo "Running local app checks from ${APP_ROOT}"
echo "Core repo: ${C2FA_CORE_PATH}"

if [[ -d "${C2FA_CORE_PATH}/.venv-c2pa311" ]]; then
  echo "Validator venv: present"
else
  echo "Validator venv: missing"
fi

run_doctor() {
  local label="$1"
  shift

  local tmp_json
  tmp_json="$(mktemp)"
  local doctor_exit=0

  set +e
  (
    cd "${C2FA_CORE_PATH}"
    "$@"
  ) >"${tmp_json}"
  doctor_exit=$?
  set -e

  echo "${label} exit code: ${doctor_exit}"
  python3 -m json.tool "${tmp_json}"
  rm -f "${tmp_json}"
}

run_doctor "Default runtime" python3 -m cli.main validator-doctor

if [[ -x "${C2FA_CORE_PATH}/.venv-c2pa311/bin/python" ]]; then
  run_doctor "Validator runtime" "${C2FA_CORE_PATH}/.venv-c2pa311/bin/python" -m cli.main validator-doctor
else
  echo "Validator runtime: skipped because ${C2FA_CORE_PATH}/.venv-c2pa311 is missing."
fi

echo "Running npm run typecheck"
npm run typecheck

echo "Running npm run lint"
npm run lint

echo "Running npm run build"
npm run build

echo "Local checks completed."
