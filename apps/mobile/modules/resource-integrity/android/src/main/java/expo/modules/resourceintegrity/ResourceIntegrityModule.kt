package expo.modules.resourceintegrity

import android.net.Uri
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

    AsyncFunction("copyFileToContentUriAsync") Coroutine { fromUri: String, toUri: String ->
      withContext(Dispatchers.IO) {
        val source = File(URI(fromUri))
        require(source.isFile) { "Expected a regular local file" }
        val destination = Uri.parse(toUri)
        require(destination.scheme == "content") { "Expected a content URI" }
        val resolver = appContext.reactContext?.contentResolver
          ?: throw IllegalStateException("React context is unavailable")
        FileInputStream(source).use { input ->
          val output = resolver.openOutputStream(destination, "w")
            ?: throw IllegalStateException("Unable to open destination stream")
          output.use { input.copyTo(it, 64 * 1024) }
        }
        Unit
      }
    }
  }
}
