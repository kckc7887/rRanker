import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from android_signing import verify_android_signing


FINGERPRINT = "a" * 64
OTHER_FINGERPRINT = "b" * 64
DEBUG_SUBJECT = "CN=Android Debug, O=Android, C=US"
RELEASE_SUBJECT = "CN=Application Distribution"


def certificate_output(subject=DEBUG_SUBJECT, fingerprint=FINGERPRINT, signer=1):
    return (f"Signer #{signer} certificate DN: {subject}\n"
            f"Signer #{signer} certificate SHA-256 digest: {fingerprint}\n")


def scheme_certificate_output(scheme="V2", subject=DEBUG_SUBJECT, fingerprint=FINGERPRINT):
    return ("Verifies\nNumber of signers: 1\n"
            f"{scheme} Signer: certificate DN: {subject}\n"
            f"{scheme} Signer: certificate SHA-256 digest: {fingerprint}\n"
            f"{scheme} Signer: certificate SHA-1 digest: {'c' * 40}\n"
            f"{scheme} Signer: public key SHA-256 digest: {OTHER_FINGERPRINT}\n")


class SigningModeTests(unittest.TestCase):
    def test_build_tools_37_single_signer_formats_keep_pin_and_mode_checks(self):
        for scheme in ["V1", "V2", "V3.0"]:
            for mode in ["release", "test-debug", "legacy-debug"]:
                subject = RELEASE_SUBJECT if mode == "release" else DEBUG_SUBJECT
                with self.subTest(scheme=scheme, mode=mode):
                    summary = scheme_certificate_output(scheme, subject)
                    result = verify_android_signing(summary, mode, FINGERPRINT)
                    self.assertEqual(result["certificateSha256"], FINGERPRINT)
                    self.assertEqual(result["certificateSubject"], subject)
                    with self.assertRaisesRegex(ValueError, "match"):
                        verify_android_signing(summary, mode, OTHER_FINGERPRINT)


    def test_source_stamp_is_not_the_apk_signer_in_either_tool_format(self):
        for summary in [certificate_output(), scheme_certificate_output()]:
            for label in ["Source Stamp Signer", "Source Stamp Signer:"]:
                output = (summary + f"{label} certificate DN: CN=Stamp\n"
                          f"{label} certificate SHA-256 digest: {OTHER_FINGERPRINT}\n")
                with self.subTest(label=label, summary=summary):
                    self.assertEqual(verify_android_signing(output, "legacy-debug", FINGERPRINT)[
                        "certificateSha256"], FINGERPRINT)


    def test_legacy_requires_a_pin(self):
        for pin in [None, ""]:
            with self.subTest(pin=pin), self.assertRaisesRegex(ValueError, "pin"):
                verify_android_signing(certificate_output(), "legacy-debug", pin)


    def test_release_rejects_debug_even_with_the_correct_pin(self):
        for subject in [DEBUG_SUBJECT, "CN=android debug", "CN=Android  Debug"]:
            with self.subTest(subject=subject), self.assertRaisesRegex(ValueError, "debug"):
                verify_android_signing(certificate_output(subject), "release", FINGERPRINT)

    def test_debug_modes_reject_release_certificate_even_with_the_correct_pin(self):
        for mode in ["test-debug", "legacy-debug"]:
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "debug"):
                verify_android_signing(certificate_output(RELEASE_SUBJECT), mode, FINGERPRINT)

    def test_actual_certificate_digest_can_be_canonicalized(self):
        result = verify_android_signing(certificate_output(fingerprint=FINGERPRINT.upper()),
                                        "legacy-debug", FINGERPRINT)
        self.assertEqual(result["certificateSha256"], FINGERPRINT)


    def test_missing_subject_or_certificate_digest_is_rejected(self):
        summaries = ["", None, b"certificate", "Signer #1 certificate DN: \n",
                     f"Signer #1 certificate SHA-256 digest: {FINGERPRINT}\n",
                     f"Signer #1 certificate DN: {DEBUG_SUBJECT}\n"
                     f"Signer #1 public key SHA-256 digest: {FINGERPRINT}\n"]
        for summary in summaries:
            with self.subTest(summary=summary), self.assertRaises(ValueError):
                verify_android_signing(summary, "test-debug")


    def test_multiple_or_duplicate_certificates_are_rejected(self):
        summaries = [certificate_output() + certificate_output(signer=2),
                     certificate_output() + certificate_output(),
                     certificate_output() + f"Signer #1 certificate SHA-256 digest: {OTHER_FINGERPRINT}\n",
                     certificate_output(signer=0), certificate_output(signer=2)]
        for summary in summaries:
            with self.subTest(summary=summary), self.assertRaises(ValueError):
                verify_android_signing(summary, "test-debug")


class ApkVerifierIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = "c" * 40
        self.script = Path(__file__).with_name("verify-android-apks.py").resolve()
        self.release = self.root / "android/app/build/outputs/apk/release"
        self.release.mkdir(parents=True)
        (self.root / "app.json").write_text(json.dumps({"expo": {"version": "0.4.0", "android": {
            "versionCode": 3, "package": "com.rranker.app"}}}))
        self.abis = ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]
        elements = []
        for abi in self.abis:
            name = f"app-{abi}-release.apk"
            with zipfile.ZipFile(self.release / name, "w") as archive:
                archive.writestr(f"lib/{abi}/libfixture.so", b"fixture")
            elements.append({"outputFile": name, "versionName": "0.4.0", "versionCode": 3,
                             "filters": [{"filterType": "ABI", "value": abi}]})
        (self.release / "output-metadata.json").write_text(json.dumps({"elements": elements}))
        self.tools = self.root / "sdk/build-tools/36.0.0"
        self.tools.mkdir(parents=True)
        self.latest_tools = self.root / "sdk/build-tools/37.0.0"
        self.latest_tools.mkdir(parents=True)
        self.signing_output = scheme_certificate_output()
        mapping = self.root / "android/app/build/outputs/mapping/release/mapping.txt"
        mapping.parent.mkdir(parents=True)
        mapping.write_text("fixture mapping")
        self.environment = {"ANDROID_HOME": str(self.tools.parents[1]), "SIGNING_MODE": "legacy-debug",
                            "EXPECTED_CERTIFICATE_SHA256": FINGERPRINT, "BUILD_SOURCE_COMMIT": self.source,
                            "ANDROID_OPTIMIZATION_MODE": "A", "GITHUB_OUTPUT": str(self.root / "output.txt"),
                            "GITHUB_STEP_SUMMARY": str(self.root / "summary.md")}

    def run_verifier(self):
        def command_output(command, **_kwargs):
            if Path(command[0]).name == "aapt":
                return "package: name='com.rranker.app' versionCode='3' versionName='0.4.0'\n"
            if Path(command[0]).name == "apksigner":
                self.assertEqual(Path(command[0]).parent, self.latest_tools)
                self.assertEqual(command[1:4], ["verify", "--verbose", "--print-certs"])
                return self.signing_output
            raise AssertionError("Unexpected verification subprocess")

        previous_directory = Path.cwd()
        try:
            os.chdir(self.root)
            with patch.dict(os.environ, self.environment, clear=True), patch(
                "subprocess.check_output", side_effect=command_output
            ), contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(self.script), run_name="__main__")
        finally:
            os.chdir(previous_directory)

    def test_legacy_evidence_and_summary_share_verified_signing_mode(self):
        self.run_verifier()
        evidence = json.loads((self.root / "build/android-apks/verification.json").read_text())
        self.assertEqual(evidence["signingMode"], "legacy-debug")
        self.assertEqual(evidence["expectedCertificateSha256"], FINGERPRINT)
        self.assertEqual(len(evidence["apks"]), 4)
        self.assertEqual({item["file"] for item in evidence["apks"]},
                         {"rRanker-arm64.apk", "rRanker-armeabi.apk", "rRanker-x86.apk", "rRanker-x86_64.apk"})
        self.assertEqual({item["certificateSha256"] for item in evidence["apks"]}, {FINGERPRINT})
        summary = (self.root / "summary.md").read_text()
        self.assertIn(evidence["signingDescription"], summary)
        self.assertIn("Legacy Android debug signing", summary)
        self.assertNotIn("Formal release", summary)

    def test_mismatched_legacy_pin_stops_before_publishing(self):
        self.environment["EXPECTED_CERTIFICATE_SHA256"] = OTHER_FINGERPRINT
        with self.assertRaisesRegex(ValueError, "match"):
            self.run_verifier()
        self.assertFalse((self.root / "build/android-apks/verification.json").exists())
        self.assertFalse((self.root / "output.txt").exists())
        self.assertFalse((self.root / "summary.md").exists())

    def test_unqualified_signer_output_is_accepted_by_the_apk_entrypoint(self):
        self.signing_output = "Verifies\nNumber of signers: 1\n" + certificate_output()
        self.run_verifier()
        evidence = json.loads((self.root / "build/android-apks/verification.json").read_text())
        self.assertEqual({item["certificateSha256"] for item in evidence["apks"]}, {FINGERPRINT})

    def test_multiple_signers_stop_before_publishing_even_when_the_pin_matches(self):
        self.signing_output = scheme_certificate_output().replace("Number of signers: 1", "Number of signers: 2")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            self.run_verifier()
        self.assertFalse((self.root / "output.txt").exists())
        self.assertFalse((self.root / "build/android-apks/verification.json").exists())

    def test_missing_legacy_pin_stops_before_publishing(self):
        self.environment.pop("EXPECTED_CERTIFICATE_SHA256")
        with self.assertRaisesRegex(ValueError, "pin"):
            self.run_verifier()
        self.assertFalse((self.root / "output.txt").exists())

    def test_test_mode_allows_absent_environment_pin(self):
        self.environment["SIGNING_MODE"] = "test-debug"
        self.environment["EXPECTED_CERTIFICATE_SHA256"] = ""
        self.run_verifier()
        evidence = json.loads((self.root / "build/android-apks/verification.json").read_text())
        self.assertEqual(evidence["signingMode"], "test-debug")
        self.assertIsNone(evidence["expectedCertificateSha256"])


if __name__ == "__main__":
    unittest.main()
