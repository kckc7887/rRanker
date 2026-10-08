# https://lbs.amap.com/api/android-sdk/guide/create-project/dev-attention
-keep class com.amap.api.maps.** { *; }
-keep class com.autonavi.** { *; }
-keep class com.amap.api.trace.** { *; }
-keep class com.amap.api.location.** { *; }
-keep class com.amap.api.fence.** { *; }
-keep class com.loc.** { *; }
-keep class com.amap.api.services.** { *; }
-dontwarn com.amap.ams.gnss.GnssSoftLocator
-dontwarn net.jafama.FastMath
