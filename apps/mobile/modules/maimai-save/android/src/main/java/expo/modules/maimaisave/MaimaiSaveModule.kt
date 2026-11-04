package expo.modules.maimaisave

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MaimaiSaveModule : Module() {
  private external fun nativeRead(request: ByteArray): ByteArray?
  private val bridge by lazy {
    System.loadLibrary("maimai_tech")
    System.loadLibrary("maimai_save_bridge")
  }

  override fun definition() = ModuleDefinition {
    Name("MaimaiSave")
    AsyncFunction("readSaveAsync") Coroutine { code: String ->
      withContext(Dispatchers.IO) {
        try {
          bridge
          val request = JSONObject().put("op", "save").put("code", code).toString()
          nativeRead(request.toByteArray(Charsets.UTF_8))?.toString(Charsets.UTF_8)
            ?: "{\"error\":{\"code\":\"INTERNAL\"}}"
        } catch (_: Exception) {
          "{\"error\":{\"code\":\"INTERNAL\"}}"
        } catch (_: LinkageError) {
          "{\"error\":{\"code\":\"INTERNAL\"}}"
        }
      }
    }
  }
}
