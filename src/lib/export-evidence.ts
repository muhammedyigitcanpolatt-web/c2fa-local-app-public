import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolveAnalyzeRuntime, CORE_REPO_PATH, VALIDATOR_VENV_PYTHON } from "./analyze-file";
import type { ExportCommandRun, ExportKind, ExportResponse } from "./export-evidence-types";

const CAPTURE_ARGS = ["-m", "cli.main", "capture"] as const;
const RECEIPT_ARGS = ["-m", "cli.main", "receipt"] as const;
const REPORT_ARGS = ["-m", "cli.main", "report"] as const;
const EXPORT_TIMEOUT_MS = 60_000;

type RunCommandOptions = {
  label: ExportCommandRun["label"];
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
};

function parseJson(stdout: string): { payload: unknown | null; parseError?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { payload: null, parseError: "export command did not write JSON to stdout." };
  }

  try {
    return { payload: JSON.parse(trimmed) as unknown };
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

function sanitizeStem(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "");
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

function toTimestampSlug(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

async function readJsonFile(path: string): Promise<{ payload: Record<string, unknown> | null; parseError?: string }> {
  try {
    const content = await readFile(path, "utf8");
    if (!content.trim()) {
      return { payload: null, parseError: "export artifact file is empty." };
    }

    return { payload: readJsonObject(JSON.parse(content) as unknown) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export artifact read error.";
    return { payload: null, parseError: message };
  }
}

async function runCommand({
  label,
  command,
  args,
  cwd,
  timeoutMs = EXPORT_TIMEOUT_MS,
}: RunCommandOptions): Promise<ExportCommandRun> {
  const startedAt = new Date().toISOString();

  return await new Promise<ExportCommandRun>((resolve) => {
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let settled = false;

    const finalize = (result: ExportCommandRun) => {
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

function makeDownloadName(kind: ExportKind, fileName: string, checkedAt: string): string {
  const stem = sanitizeStem(fileName);
  const timestamp = toTimestampSlug(checkedAt);
  return `c2fa-${kind}-${stem}-${timestamp}.json`;
}

function baseResponse(
  exportKind: ExportKind,
  file: ExportResponse["file"],
  runtimeUsed: ExportResponse["runtime_used"],
  checkedAt: string,
  cleanup: ExportResponse["cleanup"],
): ExportResponse {
  return {
    ok: false,
    checked_at: checkedAt,
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    runtime_used: runtimeUsed,
    export_kind: exportKind,
    file,
    capture: null,
    receipt: null,
    report: null,
    artifact: null,
    download_name: null,
    cleanup,
  };
}

async function generateReceiptArtifact({
  filePath,
  tempDir,
  runtime,
  file,
  checkedAt,
}: {
  filePath: string;
  tempDir: string;
  runtime: ReturnType<typeof resolveAnalyzeRuntime>;
  file: ExportResponse["file"];
  checkedAt: string;
}): Promise<ExportResponse> {
  const captureDir = `${tempDir}/capture`;
  const receiptPath = `${tempDir}/receipt.json`;
  await mkdir(captureDir, { recursive: true });

  const capture = await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...CAPTURE_ARGS, "--file", filePath, "--out", captureDir],
    cwd: CORE_REPO_PATH,
  });

  const capturePayload = readJsonObject(capture.payload);
  const recordPath = typeof capturePayload?.record_path === "string" ? capturePayload.record_path : null;

  if (capture.runtime_error || capture.timed_out || capture.parse_error || capture.exit_code !== 0 || !recordPath) {
    return {
      ...baseResponse("receipt", file, runtime.label, checkedAt, { attempted: true, ok: false }),
      capture,
      error: {
        code: !recordPath ? "CAPTURE_RECORD_MISSING" : capture.runtime_error ? "CAPTURE_COMMAND_FAILURE" : capture.timed_out ? "CAPTURE_TIMED_OUT" : capture.parse_error ? "CAPTURE_INVALID_JSON" : "CAPTURE_FAILED",
        message: !recordPath
          ? "The capture step did not provide a record path."
          : "Unable to capture the local file for receipt export.",
        details: capture.raw_stderr.trim() || capture.raw_stdout.trim() || capture.parse_error || capture.runtime_error || undefined,
      },
    };
  }

  const receipt = await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...RECEIPT_ARGS, "--record", recordPath, "--file", filePath, "--include-analysis", "--out", receiptPath],
    cwd: CORE_REPO_PATH,
  });

  const receiptFile = await readJsonFile(receiptPath);
  if (receipt.runtime_error || receipt.timed_out || receipt.parse_error || receipt.exit_code !== 0 || receiptFile.parseError || !receiptFile.payload) {
    return {
      ...baseResponse("receipt", file, runtime.label, checkedAt, { attempted: true, ok: false }),
      capture,
      receipt,
      error: {
        code: receipt.runtime_error
          ? "RECEIPT_COMMAND_FAILURE"
          : receipt.timed_out
            ? "RECEIPT_TIMED_OUT"
            : receipt.parse_error
              ? "RECEIPT_INVALID_JSON"
              : receiptFile.parseError
                ? "RECEIPT_FILE_INVALID_JSON"
                : "RECEIPT_FAILED",
        message: "Unable to build the receipt export for the selected local file.",
        details: receipt.raw_stderr.trim() || receipt.raw_stdout.trim() || receipt.parse_error || receipt.runtime_error || receiptFile.parseError || undefined,
      },
    };
  }

  return {
    ok: true,
    checked_at: checkedAt,
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    runtime_used: runtime.label,
    export_kind: "receipt",
    file,
    capture,
    receipt,
    report: null,
    artifact: receiptFile.payload,
    download_name: file ? makeDownloadName("receipt", file.name, checkedAt) : null,
    cleanup: { attempted: true, ok: true },
  };
}

async function generateReportArtifact({
  filePath,
  tempDir,
  runtime,
  file,
  checkedAt,
}: {
  filePath: string;
  tempDir: string;
  runtime: ReturnType<typeof resolveAnalyzeRuntime>;
  file: ExportResponse["file"];
  checkedAt: string;
}): Promise<ExportResponse> {
  const captureDir = `${tempDir}/capture`;
  const receiptPath = `${tempDir}/receipt.json`;
  const reportPath = `${tempDir}/report.json`;
  await mkdir(captureDir, { recursive: true });

  const capture = await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...CAPTURE_ARGS, "--file", filePath, "--out", captureDir],
    cwd: CORE_REPO_PATH,
  });

  const capturePayload = readJsonObject(capture.payload);
  const recordPath = typeof capturePayload?.record_path === "string" ? capturePayload.record_path : null;
  if (capture.runtime_error || capture.timed_out || capture.parse_error || capture.exit_code !== 0 || !recordPath) {
    return {
      ...baseResponse("report", file, runtime.label, checkedAt, { attempted: true, ok: false }),
      capture,
      error: {
        code: !recordPath ? "CAPTURE_RECORD_MISSING" : capture.runtime_error ? "CAPTURE_COMMAND_FAILURE" : capture.timed_out ? "CAPTURE_TIMED_OUT" : capture.parse_error ? "CAPTURE_INVALID_JSON" : "CAPTURE_FAILED",
        message: !recordPath
          ? "The capture step did not provide a record path."
          : "Unable to capture the local file for report export.",
        details: capture.raw_stderr.trim() || capture.raw_stdout.trim() || capture.parse_error || capture.runtime_error || undefined,
      },
    };
  }

  const receipt = await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...RECEIPT_ARGS, "--record", recordPath, "--file", filePath, "--include-analysis", "--out", receiptPath],
    cwd: CORE_REPO_PATH,
  });

  const receiptFile = await readJsonFile(receiptPath);
  if (receipt.runtime_error || receipt.timed_out || receipt.parse_error || receipt.exit_code !== 0 || receiptFile.parseError || !receiptFile.payload) {
    return {
      ...baseResponse("report", file, runtime.label, checkedAt, { attempted: true, ok: false }),
      capture,
      receipt,
      error: {
        code: receipt.runtime_error
          ? "RECEIPT_COMMAND_FAILURE"
          : receipt.timed_out
            ? "RECEIPT_TIMED_OUT"
            : receipt.parse_error
              ? "RECEIPT_INVALID_JSON"
              : receiptFile.parseError
                ? "RECEIPT_FILE_INVALID_JSON"
                : "RECEIPT_FAILED",
        message: "Unable to build the receipt needed for report export.",
        details: receipt.raw_stderr.trim() || receipt.raw_stdout.trim() || receipt.parse_error || receipt.runtime_error || receiptFile.parseError || undefined,
      },
    };
  }

  const report = await runCommand({
    label: runtime.label,
    command: runtime.command,
    args: [...REPORT_ARGS, "--type", "receipt", "--input", receiptPath, "--out", reportPath],
    cwd: CORE_REPO_PATH,
  });

  const reportFile = await readJsonFile(reportPath);
  if (report.runtime_error || report.timed_out || report.parse_error || report.exit_code !== 0 || reportFile.parseError || !reportFile.payload) {
    return {
      ...baseResponse("report", file, runtime.label, checkedAt, { attempted: true, ok: false }),
      capture,
      receipt,
      report,
      error: {
        code: report.runtime_error
          ? "REPORT_COMMAND_FAILURE"
          : report.timed_out
            ? "REPORT_TIMED_OUT"
            : report.parse_error
              ? "REPORT_INVALID_JSON"
              : reportFile.parseError
                ? "REPORT_FILE_INVALID_JSON"
                : "REPORT_FAILED",
        message: "Unable to generate the report export for the selected local file.",
        details: report.raw_stderr.trim() || report.raw_stdout.trim() || report.parse_error || report.runtime_error || reportFile.parseError || undefined,
      },
    };
  }

  return {
    ok: true,
    checked_at: checkedAt,
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    runtime_used: runtime.label,
    export_kind: "report",
    file,
    capture,
    receipt,
    report,
    artifact: reportFile.payload,
    download_name: file ? makeDownloadName("report", file.name, checkedAt) : null,
    cleanup: { attempted: true, ok: true },
  };
}

export async function exportEvidence(file: File, exportKind: ExportKind): Promise<ExportResponse> {
  const checkedAt = new Date().toISOString();
  const runtime = resolveAnalyzeRuntime();

  if (!existsSync(CORE_REPO_PATH)) {
    return {
      ok: false,
      checked_at: checkedAt,
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: runtime.label,
      export_kind: exportKind,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || null,
        last_modified: file.lastModified || null,
      },
      capture: null,
      receipt: null,
      report: null,
      artifact: null,
      download_name: null,
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
  let tempDir: string | null = null;
  let response: ExportResponse = {
    ok: false,
    checked_at: checkedAt,
    core_repo_path: CORE_REPO_PATH,
    validator_venv_path: VALIDATOR_VENV_PYTHON,
    runtime_used: runtime.label,
    export_kind: exportKind,
    file: {
      name: file.name,
      size: file.size,
      type: file.type || null,
      last_modified: file.lastModified || null,
    },
    capture: null,
    receipt: null,
    report: null,
    artifact: null,
    download_name: null,
    cleanup: {
      attempted: true,
      ok: false,
    },
  };

  try {
    tempDir = await mkdtemp(`${tmpdir()}/c2fa-local-export-`);
    const extension = safeExtension(file.name);
    const tempFilePath = `${tempDir}/upload${extension || ".bin"}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempFilePath, bytes);

    response =
      exportKind === "receipt"
        ? await generateReceiptArtifact({
            filePath: tempFilePath,
            tempDir,
            runtime,
            file: response.file,
            checkedAt,
          })
        : await generateReportArtifact({
            filePath: tempFilePath,
            tempDir,
            runtime,
            file: response.file,
            checkedAt,
          });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error.";
    response = {
      ok: false,
      checked_at: checkedAt,
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: runtime.label,
      export_kind: exportKind,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || null,
        last_modified: file.lastModified || null,
      },
      capture: null,
      receipt: null,
      report: null,
      artifact: null,
      download_name: null,
      cleanup: {
        attempted: tempDir !== null,
        ok: false,
        error: cleanupError,
      },
      error: {
        code: "EXPORT_FAILED",
        message: "Unable to export evidence for the selected local file.",
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
  } else if (response.ok) {
    response.cleanup.ok = true;
  }

  return response;
}
