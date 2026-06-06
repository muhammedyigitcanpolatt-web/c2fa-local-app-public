const DEFAULT_CORE_REPO_PATH = "/path/to/c2fa";

function cleanValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const CORE_REPO_PATH = cleanValue(process.env.C2FA_CORE_PATH, DEFAULT_CORE_REPO_PATH);
export const VALIDATOR_VENV_PYTHON = cleanValue(
  process.env.C2FA_VALIDATOR_VENV_PYTHON,
  `${CORE_REPO_PATH}/.venv-c2pa311/bin/python`,
);
