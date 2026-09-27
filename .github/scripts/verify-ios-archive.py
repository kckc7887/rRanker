"""Check the archived application's actual Expo config and native metadata."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import sys
import zipfile


def verify_metadata(config_bytes, plist_bytes, source_sha, version, bundle_id, build_number=None):
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha or ""):
        raise ValueError("Missing immutable source identity")
    config = json.loads(config_bytes)
    if config.get("extra", {}).get("buildCommit") != source_sha:
        raise ValueError("Archived Expo source identity does not match checkout")
    metadata = plistlib.loads(plist_bytes)
    if (metadata.get("CFBundleShortVersionString"), metadata.get("CFBundleIdentifier")) != (version, bundle_id):
        raise ValueError("Archived application version or bundle identifier differs")
    actual_build = str(metadata.get("CFBundleVersion", ""))
    if not actual_build or (build_number is not None and actual_build != str(build_number)):
        raise ValueError("Archived application build number differs")
    return {"sourceSha": source_sha, "version": version, "bundleId": bundle_id,
            "buildNumber": actual_build,
            "embeddedConfigSha256": hashlib.sha256(config_bytes).hexdigest()}


def verify_app(app, source_sha, version, bundle_id, build_number=None):
    app = Path(app)
    candidates = [app / "EXConstants.bundle/app.config",
                  app / "EXConstants.bundle/Contents/Resources/app.config"]
    configs = [path for path in candidates if path.is_file()]
    if len(configs) != 1:
        raise ValueError("Expected one embedded Expo config")
    return verify_metadata(configs[0].read_bytes(), (app / "Info.plist").read_bytes(),
                           source_sha, version, bundle_id, build_number)


def verify_ipa(ipa, source_sha, version, bundle_id, build_number=None):
    with zipfile.ZipFile(ipa) as package:
        entries = package.infolist()
        manifests = [entry for entry in entries if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", entry.filename)]
        if len(manifests) != 1:
            raise ValueError("Expected one IPA application manifest")
        prefix = manifests[0].filename.removesuffix("Info.plist")
        configs = [entry for entry in entries if entry.filename in {
            prefix + "EXConstants.bundle/app.config", prefix + "EXConstants.bundle/Contents/Resources/app.config"}]
        if len(configs) != 1 or any(entry.file_size > 2 * 1024 * 1024 for entry in [manifests[0], *configs]):
            raise ValueError("Expected one bounded IPA Expo config")
        return verify_metadata(package.read(configs[0]), package.read(manifests[0]),
                               source_sha, version, bundle_id, build_number)


def main():
    target = Path(sys.argv[1])
    production = os.environ["PRODUCTION_BUILD"] == "true"
    if target.suffix == ".ipa":
        verify = verify_ipa
    else:
        apps = list(target.glob("*.app"))
        if len(apps) != 1:
            raise ValueError("Expected exactly one archived application")
        target = apps[0]
        verify = verify_app
    evidence = verify(target, os.environ["SOURCE_SHA"], os.environ["APP_VERSION"],
                      os.environ["BUNDLE_ID"], os.environ["BUILD_NUMBER"] if production else None)
    evidence["signingMode"] = "release" if production else "unsigned-test"
    output = Path("build/export")
    output.mkdir(parents=True, exist_ok=True)
    (output / "verification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print("Archived source identity and native metadata verified")


if __name__ == "__main__":
    main()
