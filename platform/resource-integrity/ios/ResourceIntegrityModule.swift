import CryptoKit
import ExpoModulesCore
import Foundation

public class ResourceIntegrityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ResourceIntegrity")

    AsyncFunction("sha256FileAsync") { (uri: String) throws -> String in
      guard let url = URL(string: uri), url.isFileURL,
        try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else {
        throw Exception(name: "InvalidFile", description: "Expected a regular local file")
      }
      let handle = try FileHandle(forReadingFrom: url)
      defer { try? handle.close() }
      var digest = SHA256()
      while true {
        let hasData = try autoreleasepool {
          guard let data = try handle.read(upToCount: 64 * 1024), !data.isEmpty else { return false }
          digest.update(data: data)
          return true
        }
        if !hasData { break }
      }
      return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }.runOnQueue(DispatchQueue(label: "expo.modules.resourceintegrity", qos: .utility))
  }
}
