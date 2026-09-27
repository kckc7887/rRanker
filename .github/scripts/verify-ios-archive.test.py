import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("ios_archive", Path(__file__).with_name("verify-ios-archive.py"))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class ArchiveIdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.app = Path(self.directory.name) / "app.app"
        self.sha = "a" * 40
        self.config = self.app / "EXConstants.bundle/app.config"
        self.config.parent.mkdir(parents=True)
        self.config.write_text(json.dumps({"extra": {"buildCommit": self.sha}}))
        self.metadata = {"CFBundleVersion": "42", "CFBundleShortVersionString": "0.4.0",
                         "CFBundleIdentifier": "com.rranker.app"}
        self.write_metadata()

    def write_metadata(self):
        (self.app / "Info.plist").write_bytes(plistlib.dumps(self.metadata))

    def verify(self, build="42"):
        return archive.verify_app(self.app, self.sha, "0.4.0", "com.rranker.app", build)

    def test_signed_and_unsigned_metadata(self):
        self.assertEqual(self.verify()["buildNumber"], "42")
        self.assertEqual(self.verify(None)["sourceSha"], self.sha)

    def test_deep_resource_bundle(self):
        target = self.app / "EXConstants.bundle/Contents/Resources/app.config"
        target.parent.mkdir(parents=True)
        self.config.rename(target)
        self.assertEqual(self.verify()["sourceSha"], self.sha)

    def test_stale_embedded_source(self):
        self.config.write_text(json.dumps({"extra": {"buildCommit": "b" * 40}}))
        with self.assertRaisesRegex(ValueError, "identity"):
            self.verify()

    def test_missing_or_duplicate_embedded_config(self):
        self.config.unlink()
        with self.assertRaisesRegex(ValueError, "one embedded"):
            self.verify()
        self.config.write_text('{}')
        target = self.app / "EXConstants.bundle/Contents/Resources/app.config"
        target.parent.mkdir(parents=True)
        target.write_text('{}')
        with self.assertRaisesRegex(ValueError, "one embedded"):
            self.verify()

    def test_mismatched_native_metadata(self):
        for key, value in [("CFBundleVersion", "41"), ("CFBundleShortVersionString", "0.3.0"),
                           ("CFBundleIdentifier", "other.app")]:
            with self.subTest(key=key):
                previous = self.metadata[key]
                self.metadata[key] = value
                self.write_metadata()
                with self.assertRaises(ValueError):
                    self.verify()
                self.metadata[key] = previous

    def test_invalid_source_sha(self):
        with self.assertRaisesRegex(ValueError, "identity"):
            archive.verify_app(self.app, "master", "0.4.0", "com.rranker.app")

    def make_ipa(self, extra=()):
        package = self.app.parent / "app.ipa"
        with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for path in self.app.rglob("*"):
                if path.is_file():
                    output.write(path, "Payload/app.app/" + path.relative_to(self.app).as_posix())
            for name, content in extra:
                output.writestr(name, content)
        return package

    def test_final_ipa_identity_and_stale_export(self):
        package = self.make_ipa()
        self.assertEqual(archive.verify_ipa(package, self.sha, "0.4.0", "com.rranker.app", "42")["sourceSha"], self.sha)
        self.config.write_text(json.dumps({"extra": {"buildCommit": "b" * 40}}))
        with self.assertRaisesRegex(ValueError, "identity"):
            archive.verify_ipa(self.make_ipa(), self.sha, "0.4.0", "com.rranker.app", "42")

    def test_ambiguous_or_oversized_ipa_metadata(self):
        for extra in [[("Payload/other.app/Info.plist", b"fake")],
                      [("Payload/app.app/EXConstants.bundle/Contents/Resources/app.config", b"x" * (2 * 1024 * 1024 + 1))]]:
            with self.subTest(extra=extra[0][0]), self.assertRaises(ValueError):
                archive.verify_ipa(self.make_ipa(extra), self.sha, "0.4.0", "com.rranker.app", "42")


if __name__ == "__main__":
    unittest.main()
