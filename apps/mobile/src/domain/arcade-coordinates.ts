import gcoord from 'gcoord';

export type ArcadeCoordinate = { latitude: number; longitude: number };

export function toGcj02(point: ArcadeCoordinate): ArcadeCoordinate {
  const [longitude, latitude] = gcoord.transform([point.longitude, point.latitude], gcoord.WGS84, gcoord.GCJ02);
  return { latitude, longitude };
}

export function fromGcj02(point: ArcadeCoordinate): ArcadeCoordinate {
  const [longitude, latitude] = gcoord.transform([point.longitude, point.latitude], gcoord.GCJ02, gcoord.WGS84);
  return { latitude, longitude };
}

export function arcadeDistanceKm(a: ArcadeCoordinate, b: ArcadeCoordinate): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const chord = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, chord)));
}
