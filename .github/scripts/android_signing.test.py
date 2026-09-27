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


class SigningModeTests(unittest.TestCase):
    def test_supported_mode_matrix(self):
        for mode, subject, pin in [("release", RELEASE_SUBJECT, None),
                                   ("test-debug", DEBUG_SUBJECT, None),
                                   ("legacy-debug", DEBUG_SUBJECT, FINGERPRINT)]:
            with self.subTest(mode=mode):
                result = verify_android_signing(certificate_output(subject), mode, pin)
                self.assertEqual(result["signingMode"], mode)
                self.assertEqual(result["certificateSha256"], FINGERPRINT)
                self.assertEqual(result["expectedCertificateSha256"], pin)

    def test_legacy_is_explicitly_described_as_debug(self):
        result = verify_android_signing(certificate_output(), "legacy-debug", FINGERPRINT)
        self.assertIn("Legacy Android debug signing", result["description"])
        self.assertNotIn("Formal release", result["description"])

    def test_unknown_modes_are_rejected(self):
        for mode in [None, "", "debug", "legacy", "Release", [], False]:
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "mode"):
                verify_android_signing(certificate_output(), mode)

    def test_legacy_requires_a_pin(self):
        for pin in [None, ""]:
            with self.subTest(pin=pin), self.assertRaisesRegex(ValueError, "pin"):
                verify_android_signing(certificate_output(), "legacy-debug", pin)

    def test_every_provided_pin_is_checked_in_every_mode(self):
        for mode in ["release", "test-debug", "legacy-debug"]:
            subject = RELEASE_SUBJECT if mode == "release" else DEBUG_SUBJECT
            with self.subTest(mode=mode):
                result = verify_android_signing(certificate_output(subject), mode, FINGERPRINT)
                self.assertEqual(result["expectedCertificateSha256"], FINGERPRINT)
                with self.assertRaisesRegex(ValueError, "match"):
                    verify_android_signing(certificate_output(subject), mode, OTHER_FINGERPRINT)

    def test_invalid_pins_are_not_normalized(self):
        invalid = ["", FINGERPRINT.upper(), "a" * 63, "a" * 65, "g" * 64,
                   ":".join(["aa"] * 32), FINGERPRINT + "\n", " " + FINGERPRINT, 1, b"a" * 64]
        for mode in ["release", "test-debug", "legacy-debug"]:
            subject = RELEASE_SUBJECT if mode == "release" else DEBUG_SUBJECT
            for pin in invalid:
                with self.subTest(mode=mode, pin=pin), self.assertRaisesRegex(ValueError, "pin"):
                    verify_android_signing(certificate_output(subject), mode, pin)

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

    def test_invalid_actual_digest_is_rejected(self):
        for fingerprint in ["a" * 63, "a" * 65, "g" * 64, ":".join(["aa"] * 32), "aa bb"]:
            with self.subTest(fingerprint=fingerprint), self.assertRaises(ValueError):
                verify_android_signing(certificate_output(fingerprint=fingerprint), "test-debug")

    def test_missing_subject_or_certificate_digest_is_rejected(self):
        summaries = ["", None, b"certificate", "Signer #1 certificate DN: \n",
                     f"Signer #1 certificate SHA-256 digest: {FINGERPRINT}\n",
                     f"Signer #1 certificate DN: {DEBUG_SUBJECT}\n"
                     f"Signer #1 public key SHA-256 digest: {FINGERPRINT}\n"]
        for summary in summaries:
            with self.subTest(summary=summary), self.assertRaises(ValueError):
                verify_android_signing(summary, "test-debug")

    def test_public_key_digest_does_not_replace_the_certificate_digest(self):
        summary = (f"Signer #1 public key SHA-256 digest: {OTHER_FINGERPRINT}\n" + certificate_output())
        result = verify_android_signing(summary, "legacy-debug", FINGERPRINT)
        self.assertEqual(result["certificateSha256"], FINGERPRINT)

    def test_multiple_or_duplicate_certificates_are_rejected(self):
        summaries = [certificate_output() + certificate_output(signer=2),
                     certificate_output() + certificate_output(),
                     certificate_output() + f"Signer #1 certificate SHA-256 digest: {OTHER_FINGERPRINT}\n",
                     certificate_output(signer=0), certificate_output(signer=2)]
        for summary in summaries:
            with self.subTest(summary=summary), self.assertRaises(ValueError):
                verify_android_signing(summary, "test-debug")

    def test_subject_control_characters_are_rejected(self):
        for subject in ["CN=Android\tDebug", "CN=Android\x00Debug", "CN=Android\x7fDebug"]:
            with self.subTest(subject=subject), self.assertRaises(ValueError):
                verify_android_signing(certificate_output(subject), "test-debug")

    def test_errors_do_not_echo_certificate_or_pin_input(self):
        with self.assertRaises(ValueError) as error:
            verify_android_signing(certificate_output(), "legacy-debug", OTHER_FINGERPRINT)
        self.assertNotIn(FINGERPRINT, str(error.exception))
        self.assertNotIn(OTHER_FINGERPRINT, str(error.exception))
        self.assertNotIn(DEBUG_SUBJECT, str(error.exception))


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
        (self.root / "android/gradle.properties").write_text(
            "android.enableMinifyInReleaseBuilds=true\nandroid.enableShrinkResourcesInReleaseBuilds=true\n")
        (self.root / "android/app/build.gradle").write_text('getDefaultProguardFile("proguard-android-optimize.txt")')
        (self.root / "android/app/proguard-rules.pro").write_text("-keep @interface expo.modules.kotlin.records.** { *; }")
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
                return certificate_output()
            if command == ["git", "rev-parse", "HEAD"]:
                return self.source + "\n"
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
