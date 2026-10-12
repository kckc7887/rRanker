package expo.modules.arcademap

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.amap.api.maps.AMap
import com.amap.api.maps.AMapWrapper
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.IAMapJsCallback
import com.amap.api.maps.IAMapWebView
import com.amap.api.maps.MapsInitializer
import com.amap.api.maps.model.BitmapDescriptor
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.CameraPosition
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import com.amap.apis.utils.core.api.AMapUtilCoreApi
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

internal fun arcadeMapKey(context: Context): String? =
  context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    .metaData?.getString("com.amap.api.v2.apikey")

internal fun arcadeMapPreferences(context: Context) =
  context.getSharedPreferences("arcade_map_privacy", Context.MODE_PRIVATE)

internal fun arcadeMapAgreed(context: Context) = arcadeMapPreferences(context).getBoolean("agreed", false)

internal fun prepareArcadeMap(context: Context) {
  check(arcadeMapAgreed(context)) { "启用地图后可使用高德服务" }
  val key = arcadeMapKey(context)
  check(!key.isNullOrBlank()) { "当前无法使用地图" }
  AMapUtilCoreApi.setCollectInfoEnable(true)
  MapsInitializer.initialize(context)
  MapsInitializer.setApiKey(key)
  MapsInitializer.setProtocol(MapsInitializer.HTTPS)
}

class ArcadeMapCoordinate : Record {
  @Field var latitude: Double = 35.0
  @Field var longitude: Double = 105.0
  fun point() = LatLng(latitude, longitude)
}

class ArcadeCamera : Record {
  @Field var target: ArcadeMapCoordinate = ArcadeMapCoordinate()
  @Field var zoom: Double = 4.0
}

class ArcadeMarker : Record {
  @Field var id: Int = 0
  @Field var name: String = ""
  @Field var position: ArcadeMapCoordinate = ArcadeMapCoordinate()
}

@SuppressLint("ViewConstructor", "SetJavaScriptEnabled")
class ArcadeMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext), LifecycleEventListener {
  override val shouldUseAndroidLayout = true
  var initialCamera = ArcadeCamera()
  var shops: List<ArcadeMarker> = emptyList()
  var selectedShopId: Int? = null
  private var webView: WebView? = null
  private var wrapper: AMapWrapper? = null
  private var map: AMap? = null
  private var destroyed = false
  private var failed = false
  private val lifecycleContext = appContext.reactContext as? ReactContext
  private val markers = mutableMapOf<Int, Marker>()
  private var normalIcon: BitmapDescriptor? = null
  private var selectedIcon: BitmapDescriptor? = null
  private val onReady by EventDispatcher()
  private val onError by EventDispatcher()
  private val onCenterChange by EventDispatcher()
  private val onMarkerPress by EventDispatcher()

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateMap()
  }

  fun updateMap() {
    if (destroyed || failed) return
    try {
      if (webView == null && width > 0 && height > 0) createMap()
      updateMarkers()
    } catch (_: Exception) { fail() }
  }

  private fun createMap() {
    prepareArcadeMap(context)
    val web = WebView(context)
    webView = web
    web.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = true
      allowFileAccessFromFileURLs = true
      allowUniversalAccessFromFileURLs = true
      mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
      defaultTextEncodingName = "UTF-8"
    }
    addView(web, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    var sdkClient: WebViewClient? = null
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
        sdkClient?.shouldOverrideUrlLoading(view, request) ?: false
      override fun shouldOverrideUrlLoading(view: WebView, url: String) =
        sdkClient?.shouldOverrideUrlLoading(view, url) ?: false
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        sdkClient?.shouldInterceptRequest(view, request)
      override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
        sdkClient?.shouldInterceptRequest(view, url)
      override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        sdkClient?.onPageStarted(view, url, favicon)
      }
      override fun onPageFinished(view: WebView, url: String) { sdkClient?.onPageFinished(view, url) }
      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        sdkClient?.onReceivedError(view, request, error)
        if (request.isForMainFrame) post { fail() }
      }
      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        post { fail() }
        return true
      }
    }
    val bridge = object : IAMapWebView {
      override fun evaluateJavascript(script: String, callback: ValueCallback<String>?) = web.evaluateJavascript(script, callback)
      override fun loadUrl(url: String) = web.loadUrl(url)
      override fun addAMapJavascriptInterface(callback: IAMapJsCallback, name: String) = web.addJavascriptInterface(callback, name)
      override fun setWebViewClient(client: WebViewClient) { sdkClient = client }
      override fun getWidth() = web.width
      override fun getHeight() = web.height
      override fun addView(view: View, params: ViewGroup.LayoutParams) = web.addView(view, params)
    }
    val controller = AMapWrapper(context, bridge)
    wrapper = controller
    web.setOnTouchListener { _, event -> controller.onTouchEvent(event) }
    lifecycleContext?.addLifecycleEventListener(this)
    controller.onCreate()
    controller.getMapAsyn { readyMap -> post {
      if (destroyed || failed) return@post
      try {
        map = readyMap
        readyMap.uiSettings.apply { setRotateGesturesEnabled(false); setTiltGesturesEnabled(false) }
        readyMap.setMyLocationEnabled(false)
        readyMap.setMinZoomLevel(3f)
        readyMap.setMaxZoomLevel(20f)
        readyMap.setOnCameraChangeListener(object : AMap.OnCameraChangeListener {
          override fun onCameraChange(position: CameraPosition) {}
          override fun onCameraChangeFinish(position: CameraPosition) { post {
            if (!destroyed && !failed) onCenterChange(mapOf("latitude" to position.target.latitude, "longitude" to position.target.longitude))
          } }
        })
        readyMap.setOnMarkerClickListener { marker ->
          val id = markers.entries.firstOrNull { it.value.id == marker.id }?.key
          post { if (!destroyed && !failed && id != null) onMarkerPress(mapOf("id" to id)) }
          true
        }
        normalIcon = pin(Color.rgb(37, 99, 235))
        selectedIcon = pin(Color.rgb(249, 115, 22))
        readyMap.moveCamera(CameraUpdateFactory.newLatLngZoom(initialCamera.target.point(), initialCamera.zoom.toFloat()))
        updateMarkers()
        onReady(emptyMap())
      } catch (_: Exception) { fail() }
    } }
  }

  private fun updateMarkers() {
    val current = map ?: return
    val ids = shops.map { it.id }.toSet()
    markers.keys.filter { it !in ids }.forEach { markers.remove(it)?.remove() }
    shops.forEach { shop ->
      val icon = if (shop.id == selectedShopId) selectedIcon else normalIcon
      val position = shop.position.point()
      val zIndex = if (shop.id == selectedShopId) 2f else 1f
      val marker = markers.getOrPut(shop.id) {
        current.addMarker(MarkerOptions().position(position).title(shop.name).icon(icon).zIndex(zIndex).anchor(0.5f, 1f))
      }
      if (marker.position != position) marker.position = position
      if (marker.title != shop.name) marker.title = shop.name
      if (marker.zIndex != zIndex) { marker.setIcon(icon); marker.zIndex = zIndex }
    }
  }

  fun setCamera(target: ArcadeMapCoordinate, zoom: Double?) {
    val current = checkNotNull(map) { "地图尚未就绪" }
    current.animateCamera(if (zoom == null) CameraUpdateFactory.changeLatLng(target.point())
      else CameraUpdateFactory.newLatLngZoom(target.point(), zoom.toFloat()))
  }

  fun zoomBy(delta: Int) {
    checkNotNull(map) { "地图尚未就绪" }.animateCamera(CameraUpdateFactory.zoomBy(delta.toFloat()))
  }

  private fun pin(color: Int): BitmapDescriptor {
    val density = resources.displayMetrics.density
    val bitmap = Bitmap.createBitmap((28 * density).toInt(), (40 * density).toInt(), Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.scale(density, density)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    val shape = Path().apply {
      moveTo(14f, 38f)
      cubicTo(11f, 32f, 2f, 22f, 2f, 14f)
      arcTo(RectF(2f, 2f, 26f, 26f), 180f, 180f)
      cubicTo(26f, 22f, 17f, 32f, 14f, 38f)
      close()
    }
    canvas.drawPath(shape, paint)
    paint.color = Color.WHITE
    canvas.drawCircle(14f, 14f, 5f, paint)
    return BitmapDescriptorFactory.fromBitmap(bitmap).also { bitmap.recycle() }
  }

  private fun fail() {
    if (destroyed || failed) return
    failed = true
    onError(emptyMap())
  }

  override fun onHostResume() { if (!destroyed) { webView?.onResume(); wrapper?.onResume() } }
  override fun onHostPause() { if (!destroyed) { webView?.onPause(); wrapper?.onPause() } }
  override fun onHostDestroy() = destroy()

  fun destroy() {
    if (destroyed) return
    destroyed = true
    lifecycleContext?.removeLifecycleEventListener(this)
    map = null
    markers.clear()
    wrapper?.onDestroy()
    wrapper = null
    normalIcon?.recycle()
    selectedIcon?.recycle()
    normalIcon = null
    selectedIcon = null
    webView?.apply { stopLoading(); removeAllViews(); destroy() }
    webView = null
    removeAllViews()
  }
}
