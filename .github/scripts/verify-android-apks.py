import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

from android_signing import verify_android_signing

signing_mode = os.environ.get("SIGNING_MODE")
expected_certificate_sha256 = os.environ.get("EXPECTED_CERTIFICATE_SHA256") or None

config = json.loads(Path("app.json").read_text(encoding="utf-8"))["expo"]
version = config["version"]
build = config["android"]["versionCode"]
if not isinstance(version, str) or not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.+_-]*", version):
    raise ValueError("Invalid expo.version for an APK filename")
if type(build) is not int or not 1 <= build <= 2100000000:
    raise ValueError("Invalid expo.android.versionCode")

expected = {"armeabi-v7a", "arm64-v8a", "x86", "x86_64"}
release = Path("android/app/build/outputs/apk/release")
metadata = json.loads((release / "output-metadata.json").read_text(encoding="utf-8"))
elements = metadata["elements"]
if len(elements) != len(expected):
    raise ValueError("Expected exactly four APK outputs")

sdk = Path(os.environ["ANDROID_HOME"])
tool_dirs = [p for p in (sdk / "build-tools").iterdir() if re.fullmatch(r"\d+\.\d+\.\d+", p.name)]
build_tools = max(tool_dirs, key=lambda p: tuple(map(int, p.name.split("."))))
print(f"Android APK verification Build Tools: {build_tools.name}")
verified = {}
for element in elements:
    filters = element["filters"]
    if len(filters) != 1 or filters[0]["filterType"] != "ABI":
        raise ValueError("Expected one ABI filter per APK")
    abi = filters[0]["value"]
    if abi not in expected or abi in verified:
        raise ValueError(f"Unexpected or duplicate ABI: {abi}")
    if element["versionName"] != version or element["versionCode"] != build:
        raise ValueError(f"Version mismatch for {abi}")
    apk = release / element["outputFile"]
    if apk.parent != release or not apk.is_file() or apk.suffix != ".apk":
        raise ValueError(f"Invalid APK output: {apk}")
    with zipfile.ZipFile(apk) as archive:
        native_abis = {name.split("/")[1] for name in archive.namelist() if name.startswith("lib/") and name.endswith(".so")}
    if native_abis != {abi}:
        raise ValueError(f"Native libraries do not match {abi}: {native_abis}")
    badging = subprocess.check_output([shutil.which("aapt", path=str(build_tools)) or str(build_tools / "aapt"), "dump", "badging", str(apk)], text=True, encoding="utf-8")
    package_line = next(line for line in badging.splitlines() if line.startswith("package:"))
    attributes = dict(re.findall(r"(\w+)='([^']*)'", package_line))
    if (attributes.get("name"), attributes.get("versionName"), attributes.get("versionCode")) != (config["android"]["package"], version, str(build)):
        raise ValueError(f"APK manifest mismatch for {abi}")
    verify_output = subprocess.check_output(
        [shutil.which("apksigner", path=str(build_tools)) or str(build_tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)], text=True, encoding="utf-8")
    signing = verify_android_signing(verify_output, signing_mode, expected_certificate_sha256)
    verified[abi] = (apk, signing)

if {apk for apk, _signing in verified.values()} != set(release.glob("*.apk")):
    raise ValueError("APK files do not match output metadata")
fingerprints = {signing["certificateSha256"] for _apk, signing in verified.values()}
if len(fingerprints) != 1:
    raise ValueError(f"APK signing certificates differ: {fingerprints}")
fingerprint = fingerprints.pop()
output = Path("build/android-apks")
output.mkdir(parents=True, exist_ok=True)
names = []
signing_evidence = next(iter(verified.values()))[1]
evidence = {"sourceSha": os.environ["BUILD_SOURCE_COMMIT"], "optimizationMode": os.environ.get("ANDROID_OPTIMIZATION_MODE", "A"),
            "signingMode": signing_evidence["signingMode"], "signingDescription": signing_evidence["description"],
            "expectedCertificateSha256": signing_evidence["expectedCertificateSha256"], "apks": []}
if not re.fullmatch(r"[a-f0-9]{40}", evidence["sourceSha"]):
    raise ValueError("Missing immutable source identity")
if subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, encoding="utf-8").strip() != evidence["sourceSha"]:
    raise ValueError("Build source identity does not match checkout")
properties = Path("android/gradle.properties").read_text(encoding="utf-8")
app_gradle = Path("android/app/build.gradle").read_text(encoding="utf-8")
rules = Path("android/app/proguard-rules.pro").read_text(encoding="utf-8")
evidence["optimization"] = {
    "minify": bool(re.search(r"^android.enableMinifyInReleaseBuilds=true$", properties, re.M)),
    "shrink": bool(re.search(r"^android.enableShrinkResourcesInReleaseBuilds=true$", properties, re.M)),
    "optimize": 'getDefaultProguardFile("proguard-android-optimize.txt")' in app_gradle,
}
expected_modes = {"A": (True, True, True), "B": (False, False, False), "C": (True, False, False), "D": (True, False, True)}
if tuple(evidence["optimization"].values()) != expected_modes.get(evidence["optimizationMode"]):
    raise ValueError("Generated native optimization settings do not match build mode")
evidence["recordAnnotationRule"] = "-keep @interface expo.modules.kotlin.records.** { *; }" in rules
if not evidence["recordAnnotationRule"]:
    raise ValueError("Expo Record runtime annotation rule missing from generated native project")
for source, name in [("android/gradle.properties", "gradle-properties.txt"), ("android/app/build.gradle", "app-gradle.txt"), ("android/app/proguard-rules.pro", "proguard-rules.txt")]:
    shutil.copy2(source, output / name)
mapping = Path("android/app/build/outputs/mapping/release/mapping.txt")
if evidence["optimization"]["minify"]:
    if not mapping.is_file():
        raise ValueError("R8 build mapping is missing")
    shutil.copy2(mapping, output / "mapping.txt")
for abi, (apk, _signing) in sorted(verified.items()):
    name = f"rRanker-{version}({build})-{abi}.apk"
    shutil.copy2(apk, output / name)
    names.append(name)
    evidence["apks"].append({"file": name, "abi": abi, "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(), "certificateSha256": fingerprint})
    print(name)
(output / "verification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
    stream.write(f"artifact_name=rRanker-{version}({build})-android\n")
with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
    stream.write("## Android APKs\n\n" + "\n".join(f"- `{name}`" for name in names))
    stream.write(f"\n\nSigning: {signing_evidence['description']}\n")
