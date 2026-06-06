import { NextResponse } from "next/server";
import { CORE_REPO_PATH, VALIDATOR_VENV_PYTHON } from "@/lib/analyze-file";
import { exportEvidence } from "@/lib/export-evidence";
import type { ExportKind } from "@/lib/export-evidence-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidResponse(message: string, code: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      checked_at: new Date().toISOString(),
      core_repo_path: CORE_REPO_PATH,
      validator_venv_path: VALIDATOR_VENV_PYTHON,
      runtime_used: "default",
      export_kind: "receipt",
      file: null,
      capture: null,
      receipt: null,
      report: null,
      artifact: null,
      download_name: null,
      cleanup: {
        attempted: false,
        ok: false,
      },
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return invalidResponse(
      "The export request did not include valid multipart form data.",
      "INVALID_FORM_DATA",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return invalidResponse("No file was supplied for export.", "MISSING_FILE");
  }

  const kindValue = formData.get("kind");
  if (kindValue !== "receipt" && kindValue !== "report") {
    return invalidResponse(
      "The export kind must be either receipt or report.",
      "INVALID_EXPORT_KIND",
    );
  }

  const payload = await exportEvidence(file, kindValue as ExportKind);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 400 });
}
