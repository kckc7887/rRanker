"""Validate verified apksigner certificate output and describe its signing mode."""
import re


def verify_android_signing(apksigner_output, mode, expected_certificate_sha256=None):
    if mode not in ("release", "test-debug", "legacy-debug"):
        raise ValueError("Unknown Android signing mode")
    if expected_certificate_sha256 is not None and (
        not isinstance(expected_certificate_sha256, str)
        or not re.fullmatch(r"[a-f0-9]{64}", expected_certificate_sha256)
    ):
        raise ValueError("Invalid expected Android certificate SHA-256 pin")
    if mode == "legacy-debug" and expected_certificate_sha256 is None:
        raise ValueError("Legacy Android debug signing requires a certificate SHA-256 pin")
    if not isinstance(apksigner_output, str):
        raise ValueError("Invalid Android signing certificate summary")

    fields = {}
    for line in apksigner_output.splitlines():
        line = line.strip()
        if not line.startswith("Signer #") or not re.search(r" certificate (?:DN|SHA-256 digest):", line):
            continue
        match = re.fullmatch(r"Signer #([1-9][0-9]*) certificate (DN|SHA-256 digest): (.+)", line)
        if not match:
            raise ValueError("Invalid Android signing certificate summary")
        key = (int(match[1]), match[2])
        if key in fields:
            raise ValueError("Ambiguous Android signing certificate summary")
        fields[key] = match[3]
    if set(fields) != {(1, "DN"), (1, "SHA-256 digest")}:
        raise ValueError("Expected exactly one Android signing certificate")
    subject = fields[(1, "DN")]
    fingerprint = fields[(1, "SHA-256 digest")]
    if not subject.strip() or any(ord(character) < 32 or ord(character) == 127 for character in subject):
        raise ValueError("Invalid Android signing certificate subject")
    if not re.fullmatch(r"[A-Fa-f0-9]{64}", fingerprint):
        raise ValueError("Invalid Android certificate SHA-256 digest")
    fingerprint = fingerprint.lower()
    if expected_certificate_sha256 is not None and fingerprint != expected_certificate_sha256:
        raise ValueError("Android signing certificate does not match the expected SHA-256 pin")

    debug = bool(re.search(r"android\s+debug", subject, re.IGNORECASE))
    if mode == "release" and debug:
        raise ValueError("Formal release signing cannot use an Android debug certificate")
    if mode in ("test-debug", "legacy-debug") and not debug:
        raise ValueError("Android debug signing requires a debug certificate subject")
    descriptions = {
        "release": f"Formal release signing (SHA-256 `{fingerprint}`).",
        "test-debug": f"Android debug signing (test build, SHA-256 `{fingerprint}`).",
        "legacy-debug": f"Legacy Android debug signing (pinned SHA-256 `{fingerprint}`; reused certificate).",
    }
    return {
        "signingMode": mode,
        "certificateSha256": fingerprint,
        "certificateSubject": subject,
        "expectedCertificateSha256": expected_certificate_sha256,
        "description": descriptions[mode],
    }
