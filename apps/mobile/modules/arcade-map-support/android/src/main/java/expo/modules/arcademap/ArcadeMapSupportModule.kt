package expo.modules.arcademap

import com.amap.api.services.core.ServiceSettings
import com.amap.api.services.geocoder.GeocodeQuery
import com.amap.api.services.geocoder.GeocodeResult
import com.amap.api.services.geocoder.GeocodeSearch
import com.amap.api.services.geocoder.RegeocodeResult
import com.amap.api.services.help.Inputtips
import com.amap.api.services.help.InputtipsQuery
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

class ArcadeMapSupportModule : Module() {
  private val requests = ConcurrentHashMap<String, Promise>()
  private fun prepareSearch() {
    val context = appContext.reactContext!!
    prepareArcadeMap(context)
    ServiceSettings.updatePrivacyShow(context, true, true)
    ServiceSettings.updatePrivacyAgree(context, true)
    ServiceSettings.getInstance().apply {
      setApiKey(arcadeMapKey(context))
      setProtocol(ServiceSettings.HTTPS)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ArcadeMapSupport")
    Constants {
      mapOf("amapConfigured" to !arcadeMapKey(appContext.reactContext!!).isNullOrBlank())
    }

    Function("isPrivacyReady") { arcadeMapAgreed(appContext.reactContext!!) }
    Function("acceptPrivacy") {
      check(arcadeMapPreferences(appContext.reactContext!!).edit().putBoolean("agreed", true).commit()) {
        "地图启用失败，请重试"
      }
    }

    View(ArcadeMapView::class) {
      Events("onReady", "onError", "onCenterChange", "onMarkerPress")
      Prop("initialCamera") { view: ArcadeMapView, camera: ArcadeCamera -> view.initialCamera = camera }
      Prop("shops") { view: ArcadeMapView, shops: List<ArcadeMarker> -> view.shops = shops }
      Prop("selectedShopId") { view: ArcadeMapView, id: Int? -> view.selectedShopId = id }
      OnViewDidUpdateProps { view: ArcadeMapView -> view.updateMap() }
      AsyncFunction("setCamera") { view: ArcadeMapView, target: ArcadeMapCoordinate, zoom: Double? ->
        view.setCamera(target, zoom)
      }
      AsyncFunction("zoomBy") { view: ArcadeMapView, delta: Int -> view.zoomBy(delta) }
      OnViewDestroys { view: ArcadeMapView -> view.destroy() }
    }

    AsyncFunction("searchPlaces") { id: String, keyword: String, promise: Promise ->
      try {
        prepareSearch()
        val query = InputtipsQuery(keyword, "").apply { cityLimit = false }
        val search = Inputtips(appContext.reactContext!!, query)
        requests[id] = promise
        search.setInputtipsListener { tips, code ->
          val pending = requests.remove(id) ?: return@setInputtipsListener
          if (code != 1000) {
            pending.reject("PLACE_SEARCH", "地点搜索失败，请重试", null)
          } else {
            pending.resolve(tips.orEmpty().filter { !it.name.isNullOrBlank() }.take(10).mapIndexed { index, tip ->
              val point = tip.point?.takeUnless { it.latitude == 0.0 && it.longitude == 0.0 }
              mapOf(
                "id" to "${tip.poiID.orEmpty()}:$index",
                "name" to tip.name,
                "address" to listOfNotNull(tip.district, tip.address).filter { it.isNotBlank() }.joinToString(" "),
                "city" to tip.district.orEmpty(),
                "coordinate" to point?.let { mapOf("latitude" to it.latitude, "longitude" to it.longitude) }
              )
            })
          }
        }
        search.requestInputtipsAsyn()
      } catch (error: Exception) {
        requests.remove(id)
        promise.reject("PLACE_SEARCH", "地点搜索失败，请重试", error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resolvePlace") { id: String, name: String, city: String, promise: Promise ->
      try {
        prepareSearch()
        val search = GeocodeSearch(appContext.reactContext!!)
        requests[id] = promise
        search.setOnGeocodeSearchListener(object : GeocodeSearch.OnGeocodeSearchListener {
          override fun onRegeocodeSearched(result: RegeocodeResult?, code: Int) {}
          override fun onGeocodeSearched(result: GeocodeResult?, code: Int) {
            val pending = requests.remove(id) ?: return
            if (code != 1000) {
              pending.reject("PLACE_RESOLVE", "地点定位失败，请重试", null)
            } else {
              val point = result?.geocodeAddressList?.firstOrNull()?.latLonPoint
              pending.resolve(point?.let { mapOf("latitude" to it.latitude, "longitude" to it.longitude) })
            }
          }
        })
        search.getFromLocationNameAsyn(GeocodeQuery(name, city))
      } catch (error: Exception) {
        requests.remove(id)
        promise.reject("PLACE_RESOLVE", "地点定位失败，请重试", error)
      }
    }.runOnQueue(Queues.MAIN)

    /** 高德不提供中止接口，取消后释放 Promise 并忽略回调。 */
    AsyncFunction("cancelPlaceSearch") { id: String ->
      requests.remove(id)?.reject("PLACE_CANCELLED", "地点搜索已取消", null)
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      requests.values.forEach { it.reject("PLACE_CANCELLED", "地点搜索已取消", null) }
      requests.clear()
    }
  }
}
