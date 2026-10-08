import ExpoModulesCore
import MapKit

public class ArcadeMapSupportModule: Module {
  private var requests: [String: (MKLocalSearch, Promise)] = [:]

  public func definition() -> ModuleDefinition {
    Name("ArcadeMapSupport")

    AsyncFunction("searchPlaces") { (id: String, keyword: String, promise: Promise) in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = keyword
      request.resultTypes = [.address, .pointOfInterest]
      let search = MKLocalSearch(request: request)
      self.requests[id] = (search, promise)
      search.start { [weak self] response, error in
        DispatchQueue.main.async {
          guard let pending = self?.requests.removeValue(forKey: id) else { return }
          if let error = error {
            if let mapError = error as? MKError, mapError.code == .placemarkNotFound {
              pending.1.resolve([])
            } else {
              pending.1.reject("PLACE_SEARCH", "地点搜索失败，请重试")
            }
            return
          }
          let places: [[String: Any]] = (response?.mapItems ?? []).prefix(10).enumerated().map { index, item in
            let placemark = item.placemark
            return [
              "id": String(index),
              "name": item.name ?? placemark.title ?? keyword,
              "address": placemark.title ?? "",
              "city": placemark.locality ?? "",
              "coordinate": ["latitude": placemark.coordinate.latitude, "longitude": placemark.coordinate.longitude]
            ]
          }
          pending.1.resolve(places)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("cancelPlaceSearch") { (id: String) in
      if let pending = self.requests.removeValue(forKey: id) {
        pending.0.cancel()
        pending.1.reject("PLACE_CANCELLED", "地点搜索已取消")
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        for pending in self.requests.values {
          pending.0.cancel()
          pending.1.reject("PLACE_CANCELLED", "地点搜索已取消")
        }
        self.requests.removeAll()
      }
    }
  }
}
