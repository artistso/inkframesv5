# Free Hugging Face code review

InkFrame can use a public Hugging Face model without Hugging Face Jobs, paid inference, or committed model weights.

## Purpose

The workflow is an advisory second reviewer for failed Kotlin, Android, Compose, OpenGL ES, Gradle, and GitHub Actions runs. It does not replace the compiler, tests, package inspection, physical Galaxy Tab validation, or human review.

## Model

- Repository: `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF`
- File: `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`
- License: Apache-2.0
- Runtime: pinned CPU build of `llama.cpp`
- Authentication: none; the model is public

The 1.5B Q4 model is intentionally small enough for a standard public-repository GitHub-hosted Linux runner. Larger models must not be substituted without measuring download size, disk use, peak memory, execution time, and review quality.

## Safety boundary

The workflow:

- runs only through `workflow_dispatch`;
- requires a GitHub Actions run ID;
- has read-only `contents` and `actions` permissions;
- downloads the public model into the runner cache;
- redacts common GitHub, Hugging Face, password, token, secret, and API-key patterns;
- treats diagnostics and diffs as untrusted data;
- limits diagnostic and diff context before inference;
- uploads Markdown output as an Actions artifact;
- never edits files, pushes commits, comments on pull requests, merges code, publishes packages, or becomes a required release check.

Model output can be wrong. Apply no suggestion until the relevant source is inspected and the proposed correction passes Gradle, unit tests, package checks, and device acceptance.

## Running a review

1. Open the repository's **Actions** tab.
2. Select **Free Hugging Face Code Review**.
3. Choose **Run workflow**.
4. Select the branch containing this workflow.
5. Enter the numeric run ID of the failed Android or Kotlin workflow.
6. Optionally enter a narrow focus, such as `GlassCanvasScreen lifecycle compile failure`.
7. Download the `hf-free-code-review-<run-id>` artifact after completion.

The artifact contains:

- `review.md` — model analysis;
- `failed.log` — GitHub's failed-job diagnostics used as evidence;
- `branch.diff` — the bounded source-change context;
- `run-metadata.json` — the reviewed workflow metadata;
- `llama.stderr.log` — local inference diagnostics.

## Cache behavior

The Hugging Face model and `llama.cpp` runtime are cached by exact model filename and runtime version. A cache miss downloads them again. They are never added to Git history or Android packages.

## Failure behavior

A model download or inference failure causes this manual diagnostic workflow to fail and preserves its logs. It does not alter the status of Android CI and does not block a release by itself.
