# Result Interpretation

## Validator Status

- `NEEDS_ATTENTION`: the default runtime does not have the validator backend available.
- `READY_FOR_PRIVATE_PILOT`: the validator-enabled Python 3.11 runtime is available and the doctor check passed.

These are evidence states, not production claims.

## File Analysis Results

- `verified`: validator-backed C2PA validation status, not physical-world truth.
- `not_present`: no C2PA manifest was detected.
- `invalid`: C2PA data was present but validation failed.
- `error/unsupported`: the file could not be analyzed through the current validator path.

## Export Results

- Receipt and report exports are local JSON evidence records.
- They are generated only after a user-initiated export action.
- They are not certification.

## What Not To Infer

- Do not infer media truth from a verification result.
- Do not infer authenticity from metadata presence.
- Do not infer certification from a JSON export.
- Do not infer physical-world evidence from a successful local analysis.
