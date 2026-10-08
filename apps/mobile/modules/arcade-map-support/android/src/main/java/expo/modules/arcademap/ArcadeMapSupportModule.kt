package expo.modules.arcademap

import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ArcadeMapSupportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ArcadeMapSupport")
    Constants {
      val context = appContext.reactContext!!
      val key = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        .metaData?.getString("com.amap.api.v2.apikey")
      mapOf(
        "amapSupported" to (Build.SUPPORTED_ABIS.firstOrNull() in listOf("arm64-v8a", "armeabi-v7a")),
        "amapConfigured" to !key.isNullOrBlank()
      )
    }
  }
}
