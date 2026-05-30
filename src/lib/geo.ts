const KNOWN_COORDINATES = [
  { keys: ["koramangala"], label: "Koramangala, Bengaluru", latitude: 12.9352, longitude: 77.6245 },
  { keys: ["indiranagar"], label: "Indiranagar, Bengaluru", latitude: 12.9784, longitude: 77.6408 },
  { keys: ["bangalore", "bengaluru"], label: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  { keys: ["mumbai", "bandra"], label: "Mumbai", latitude: 19.076, longitude: 72.8777 },
  { keys: ["delhi", "new delhi"], label: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { keys: ["gurgaon", "gurugram"], label: "Gurugram", latitude: 28.4595, longitude: 77.0266 },
  { keys: ["hyderabad"], label: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  { keys: ["pune"], label: "Pune", latitude: 18.5204, longitude: 73.8567 },
  { keys: ["chennai"], label: "Chennai", latitude: 13.0827, longitude: 80.2707 },
];

export function resolveCoordinates(locality: string, city: string, detected?: { latitude?: number; longitude?: number }) {
  const detectedLatitude = detected?.latitude;
  const detectedLongitude = detected?.longitude;
  if (Number.isFinite(detectedLatitude) && Number.isFinite(detectedLongitude)) {
    return {
      label: locality || city || "Detected location",
      latitude: detectedLatitude as number,
      longitude: detectedLongitude as number,
      source: "detected" as const,
    };
  }

  const target = `${locality} ${city}`.toLowerCase();
  const match =
    KNOWN_COORDINATES.find((entry) => entry.keys.some((key) => target.includes(key))) ??
    KNOWN_COORDINATES[2];

  return { ...match, source: "preset" as const };
}
