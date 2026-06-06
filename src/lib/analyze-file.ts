import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { AnalysisPayload, AnalysisResponse, AnalysisRun } from "./analyze-file-types";
import { CORE_REPO_PATH, VALIDATOR_VENV_PYTHON } from "./c2fa-config";
export { CORE_REPO_PATH, VALIDATOR_VENV_PYTHON } from "./c2fa-config";
const ANALYZE_ARGS = ["-m", "cli.main", "analyze", "--format", "json"] as const;
const ANALYZE_TIMEOUT_MS = 45_000;

type RunCommandOptions = {
  label: AnalysisRun["label"];
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
};

function parseJson(stdout: string): { payload: AnalysisPayload | null; parseError?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { payload: null, parseError: "analyze did not write JSON to stdout." };
  }

  try {
    return { payload: JSON.parse(trimmed) as AnalysisPayload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
    return { payload: null, parseError: message };
  }
}

function safeExtension(fileName: string): string {
  const match = fileName.match(/\.([A-Za-z0-9]{1,8})$/);
  if (!match) {
    return "";
  }

  return `.${match[1]}`;
}

async function runCommand({
  label,
  command,
  args,
  cwd,
  timeoutMs = ANALYZE_TIMEOUT_MS,
}: RunCommandOptions): Promise<AnalysisRun> {
  const startedAt = new Date().toISOString();

  return await new Promise<AnalysisRun>((resolve) => {
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let settled = false;

    const finalize = (result: AnalysisRun) => {
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
      const { payload, parseError } = parseJson(stdout);

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

export function resolveAnalyzeRuntime() {
  if (existsSync(VALIDATOR_VENV_PYTHON)) {
    return {
      label: "validator" as const,
      command: VALIDATOR_VENV_PYTHON,
    };
  }

  return {
    label: "default" as const,
    command: "python3",
  };
}

async function analyzeTempFile(filePath: string): Promise<AnalysisRun> {
  const runtime = resolveAnalyzeRuntime();
  return await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...ANALYZE_ARGS, "--file", filePath],
    cwd: CORE_REPO_PATH,
  });
}

export async function analyzeUploadedFile(file: File): Promise<AnalysisResponse> {
  const checkedAt = new Date().toISOString();
  const runtime = resolveAnalyzeRuntime();

  if (!existsSync(CORE_REPO_PATH)) {
    return {
      ok: false,
      checked_at: checkedAt,
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: runtime.label,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || null,
        last_modified: file.lastModified || null,
      },
      analysis: null,
      cleanup: {
        attempted: false,
        ok: false,
        error: `Core repo not found at ${CORE_REPO_PATH}.`,
      },
      error: {
        code: "CORE_REPO_MISSING",
        message: "The core repository path is not available.",
        details: CORE_REPO_PATH,
      },
    };
  }

  let cleanupError: string | undefined;
  let analysis: AnalysisRun | null = null;
  let tempDir: string | null = null;
  let response: AnalysisResponse = {
    ok: false,
    checked_at: checkedAt,
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    runtime_used: runtime.label,
    file: {
      name: file.name,
      size: file.size,
      type: file.type || null,
      last_modified: file.lastModified || null,
    },
    analysis: null,
    cleanup: {
      attempted: true,
      ok: false,
    },
  };

  try {
    tempDir = await mkdtemp(`${tmpdir()}/c2fa-local-analysis-`);
    const extension = safeExtension(file.name);
    const tempFilePath = `${tempDir}/upload${extension || ".bin"}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempFilePath, bytes);
    analysis = await analyzeTempFile(tempFilePath);

    response = {
      ok: analysis.parse_error || analysis.runtime_error || analysis.timed_out ? false : true,
      checked_at: checkedAt,
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: analysis.label,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || null,
        last_modified: file.lastModified || null,
      },
      analysis,
      cleanup: {
        attempted: true,
        ok: true,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis error.";
    response = {
      ok: false,
      checked_at: checkedAt,
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: runtime.label,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || null,
        last_modified: file.lastModified || null,
      },
      analysis: analysis ?? null,
      cleanup: {
        attempted: true,
        ok: false,
        error: cleanupError,
      },
      error: {
        code: analysis?.runtime_error ? "COMMAND_FAILURE" : "ANALYSIS_FAILED",
        message: "Unable to analyze the uploaded file.",
        details: message,
      },
    };
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : "Unknown cleanup error.";
      }
    }
  }

  response.cleanup.attempted = tempDir !== null;
  if (cleanupError) {
    response.cleanup.ok = false;
    response.cleanup.error = cleanupError;
  }

  return response;
}
