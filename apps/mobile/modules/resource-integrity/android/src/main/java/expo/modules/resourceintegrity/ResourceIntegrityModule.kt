package expo.modules.resourceintegrity

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.net.URI
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ResourceIntegrityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ResourceIntegrity")

    AsyncFunction("sha256FileAsync") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val file = File(URI(uri))
        require(file.isFile) { "Expected a regular local file" }
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { stream ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
          }
        }
        digest.digest().joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }
      }
    }
  }
}
