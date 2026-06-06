import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { DoctorPayload, DoctorRun, ValidatorStatusResponse } from "./validator-status-types";
import { CORE_REPO_PATH, VALIDATOR_VENV_PYTHON } from "./c2fa-config";
const VALIDATOR_DOCTOR_ARGS = ["-m", "cli.main", "validator-doctor"] as const;
const DOCTOR_TIMEOUT_MS = 15_000;

type RunCommandOptions = {
  label: DoctorRun["label"];
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
};

function parseDoctorOutput(stdout: string): { payload: DoctorPayload | null; parseError?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { payload: null, parseError: "validator-doctor did not write JSON to stdout." };
  }

  try {
    return { payload: JSON.parse(trimmed) as DoctorPayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
    return { payload: null, parseError: message };
  }
}

async function runCommand({
  label,
  command,
  args,
  cwd,
  timeoutMs = DOCTOR_TIMEOUT_MS,
}: RunCommandOptions): Promise<DoctorRun> {
  const startedAt = new Date().toISOString();

  return await new Promise<DoctorRun>((resolve) => {
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let settled = false;

    const finalize = (result: DoctorRun) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      finalize({
        label,
        command: [command, ...args].join(" "),
        cwd,
        available: false,
        exit_code: null,
        timed_out: false,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        raw_stdout: stdout,
        raw_stderr: stderr,
        payload: null,
        runtime_error: error.message,
      });
    });

    child.on("close", (code) => {
      exitCode = typeof code === "number" ? code : null;
      const { payload, parseError } = parseDoctorOutput(stdout);

      finalize({
        label,
        command: [command, ...args].join(" "),
        cwd,
        available: true,
        exit_code: exitCode,
        timed_out: timedOut,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        raw_stdout: stdout,
        raw_stderr: stderr,
        payload,
        parse_error: parseError,
      });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
  });
}

async function runDefaultDoctor(): Promise<DoctorRun> {
  return await runCommand({
    label: "default",
    command: "python3",
    args: VALIDATOR_DOCTOR_ARGS,
    cwd: CORE_REPO_PATH,
  });
}

async function runValidatorDoctor(): Promise<DoctorRun> {
  if (!existsSync(VALIDATOR_VENV_PYTHON)) {
    return {
      label: "validator",
      command: `${VALIDATOR_VENV_PYTHON} -m cli.main validator-doctor`,
      cwd: CORE_REPO_PATH,
      available: false,
      exit_code: null,
      timed_out: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      raw_stdout: "",
      raw_stderr: "",
      payload: null,
      skipped_reason: "Missing .venv-c2pa311 validator environment.",
    };
  }

  return await runCommand({
    label: "validator",
    command: VALIDATOR_VENV_PYTHON,
    args: VALIDATOR_DOCTOR_ARGS,
    cwd: CORE_REPO_PATH,
  });
}

export async function collectValidatorStatus(): Promise<ValidatorStatusResponse> {
  if (!existsSync(CORE_REPO_PATH)) {
    return {
      ok: false,
      checked_at: new Date().toISOString(),
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      default_runtime: {
        label: "default",
        command: "python3 -m cli.main validator-doctor",
        cwd: CORE_REPO_PATH,
        available: false,
        exit_code: null,
        timed_out: false,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        raw_stdout: "",
        raw_stderr: "",
        payload: null,
        skipped_reason: `Core repo not found at ${CORE_REPO_PATH}.`,
      },
      validator_runtime: {
        label: "validator",
        command: `${VALIDATOR_VENV_PYTHON} -m cli.main validator-doctor`,
        cwd: CORE_REPO_PATH,
        available: false,
        exit_code: null,
        timed_out: false,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        raw_stdout: "",
        raw_stderr: "",
        payload: null,
        skipped_reason: `Core repo not found at ${CORE_REPO_PATH}.`,
      },
      error: {
        code: "CORE_REPO_MISSING",
        message: "The core repository path is not available.",
        details: CORE_REPO_PATH,
      },
    };
  }

  const [defaultRuntime, validatorRuntime] = await Promise.all([runDefaultDoctor(), runValidatorDoctor()]);

  const runHadHardFailure = [defaultRuntime, validatorRuntime].some(
    (run) => run.runtime_error || run.parse_error || run.timed_out,
  );

  return {
    ok: !runHadHardFailure,
    checked_at: new Date().toISOString(),
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    default_runtime: defaultRuntime,
    validator_runtime: validatorRuntime,
  };
}
