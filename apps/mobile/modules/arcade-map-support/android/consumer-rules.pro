# https://lbs.amap.com/api/lightweight-android-sdk/gettingstarted/dev-attention
-keep class com.amap.api.maps.** { *; }
-keep class com.autonavi.** { *; }
-keep class com.amap.api.services.** { *; }
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}
