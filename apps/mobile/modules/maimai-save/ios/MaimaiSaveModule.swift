import ExpoModulesCore
import Foundation
import MaimaiSave

public class MaimaiSaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MaimaiSave")
    AsyncFunction("readSaveAsync") { (code: String) -> String in
      guard maimai_abi_version() == 1,
        let data = try? JSONSerialization.data(withJSONObject: ["op": "save", "code": code]),
        let request = String(data: data, encoding: .utf8) else {
        return "{\"error\":{\"code\":\"INTERNAL\"}}"
      }
      return request.withCString { input in
        guard let output = maimai_call(input) else {
          return "{\"error\":{\"code\":\"INTERNAL\"}}"
        }
        defer { maimai_string_free(output) }
        return String(cString: output)
      }
    }.runOnQueue(DispatchQueue(label: "expo.modules.maimaisave", qos: .userInitiated))
  }
}
