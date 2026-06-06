import { NextResponse } from "next/server";
import { CORE_REPO_PATH, VALIDATOR_VENV_PYTHON, analyzeUploadedFile } from "@/lib/analyze-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        checked_at: new Date().toISOString(),
        core_repo_path: CORE_REPO_PATH,
        validator_venv_path: VALIDATOR_VENV_PYTHON,
        runtime_used: "default",
        file: null,
        analysis: null,
        cleanup: {
          attempted: false,
          ok: false,
        },
        error: {
          code: "INVALID_FORM_DATA",
          message: "The analysis request did not include valid multipart form data.",
        },
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        checked_at: new Date().toISOString(),
        core_repo_path: CORE_REPO_PATH,
        validator_venv_path: VALIDATOR_VENV_PYTHON,
        runtime_used: "default",
        file: null,
        analysis: null,
        cleanup: {
          attempted: false,
          ok: false,
        },
        error: {
          code: "MISSING_FILE",
          message: "No file was supplied for analysis.",
        },
      },
      { status: 400 },
    );
  }

  const payload = await analyzeUploadedFile(file);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 400 });
}
