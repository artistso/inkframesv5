#!/usr/bin/env python3
"""Validate InkFrame's native Android runtime boundary.

This script is intentionally dependency-free so GitHub Actions, local agents,
and Codex-style sandboxes can run it before expensive Android builds.
"""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "docs/NATIVE_STATUS.md",
    "docs/MAINLINE_KOTLIN_MIGRATION.md",
    "docs/GLASS_HORIZON_VISUAL_CONTRACT.md",
    "gradle/inkframe-app.properties",
    "app/src/main/AndroidManifest.xml",
    "app/src/main/kotlin/com/inkframe/studio/MainActivity.kt",
    "app/build.gradle.kts",
]

ACTIVE_DOCS = [
    "README.md",
    "BUILD.md",
    "AGENT.md",
    "ROADMAP.md",
    "PRIVACY.md",
    "TESTING.md",
    "RELEASE_CHECKLIST.md",
    "RELEASING.md",
    "docs/NATIVE_STATUS.md",
    "docs/MAINLINE_KOTLIN_MIGRATION.md",
]

CANONICAL_NATIVE_PHRASE = (
    "InkFrame for Android is a native Kotlin / Jetpack Compose / OpenGL ES application."
)

STALE_DOC_PATTERNS = [
    re.compile(r"single-file HTML build", re.IGNORECASE),
    re.compile(r"runs anywhere HTML runs", re.IGNORECASE),
    re.compile(r"same code everywhere", re.IGNORECASE),
    re.compile(r"thin WebView shell", re.IGNORECASE),
    re.compile(r"Android WebView shell", re.IGNORECASE),
    re.compile(r"bundled web app", re.IGNORECASE),
    re.compile(r"current bundled app", re.IGNORECASE),
    re.compile(r"production Android app is the offline WebView runtime", re.IGNORECASE),
    re.compile(r"shipping web runtime", re.IGNORECASE),
    re.compile(r"WebView editor remains", re.IGNORECASE),
    re.compile(r"WebView studio", re.IGNORECASE),
    re.compile(r"ships as an Android APK via", re.IGNORECASE),
    re.compile(r"IndexedDB autosaves", re.IGNORECASE),
]

NEGATIVE_CONTEXT = re.compile(
    r"\b(no|not|never|must not|does not|do not|rejected|historical|reference only|not packaged|not executed)\b",
    re.IGNORECASE,
)

RUNTIME_FORBIDDEN = {
    "app/src/main/kotlin/com/inkframe/studio/MainActivity.kt": [
        re.compile(r"\bStudioScreen\b"),
        re.compile(r"\bGlassCanvasScreen\b"),
        re.compile(r"android\.webkit"),
        re.compile(r"WebView\s*\("),
        re.compile(r"JavascriptInterface"),
        re.compile(r"addJavascriptInterface"),
    ],
    "app/build.gradle.kts": [
        re.compile(r"registerWebAssetPipeline"),
        re.compile(r"androidx\.webkit"),
        re.compile(r"assets/index\.html"),
        re.compile(r"brush-engine-v2"),
    ],
    "app/src/main/AndroidManifest.xml": [
        re.compile(r"android\.permission\.INTERNET"),
    ],
}


def read_text(path: str) -> str:
    file_path = ROOT / path
    try:
        return file_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def parse_properties(text: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        props[key.strip()] = value.strip()
    return props


def check_required_files(errors: list[str]) -> None:
    for path in REQUIRED_FILES:
        if not (ROOT / path).is_file():
            fail(errors, f"Missing required native-boundary file: {path}")


def check_android_metadata(errors: list[str]) -> None:
    props = parse_properties(read_text("gradle/inkframe-app.properties"))
    expected = {
        "applicationId": "com.inkframe.studio",
        "minSdk": "26",
        "targetSdk": "36",
    }
    for key, value in expected.items():
        actual = props.get(key)
        if actual != value:
            fail(errors, f"gradle/inkframe-app.properties {key}={actual!r}; expected {value!r}")

    version = props.get("versionName", "")
    if not version.startswith("0.5.0-native"):
        fail(errors, f"Native versionName should remain on the 0.5.0-native line; got {version!r}")


def check_runtime_sources(errors: list[str]) -> None:
    main_activity = read_text("app/src/main/kotlin/com/inkframe/studio/MainActivity.kt")
    if "ClosedBetaGlassHorizonScreen" not in main_activity and "GlassHorizonScreen" not in main_activity:
        fail(errors, "MainActivity must launch the native Glass Horizon screen.")

    build_gradle = read_text("app/build.gradle.kts")
    if 'implementation(project(":feature-canvas"))' not in build_gradle:
        fail(errors, "app/build.gradle.kts must depend on :feature-canvas.")
    if "compose = true" not in build_gradle:
        fail(errors, "app/build.gradle.kts must keep Compose enabled.")

    for path, patterns in RUNTIME_FORBIDDEN.items():
        text = read_text(path)
        for pattern in patterns:
            if pattern.search(text):
                fail(errors, f"Forbidden Android runtime marker in {path}: {pattern.pattern}")


def check_active_docs(errors: list[str]) -> None:
    required_phrase_docs = [
        "README.md",
        "BUILD.md",
        "AGENT.md",
        "docs/NATIVE_STATUS.md",
    ]
    for path in required_phrase_docs:
        text = read_text(path)
        if CANONICAL_NATIVE_PHRASE not in text:
            fail(errors, f"{path} must include the canonical native Android phrase.")

    for path in ACTIVE_DOCS:
        text = read_text(path)
        if not text:
            fail(errors, f"Missing active documentation file: {path}")
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern in STALE_DOC_PATTERNS:
                if pattern.search(line) and not NEGATIVE_CONTEXT.search(line):
                    fail(errors, f"Stale Android/WebView documentation in {path}:{lineno}: {line.strip()}")


def main() -> int:
    errors: list[str] = []
    check_required_files(errors)
    check_android_metadata(errors)
    check_runtime_sources(errors)
    check_active_docs(errors)

    if errors:
        print("Native boundary check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Native boundary check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
