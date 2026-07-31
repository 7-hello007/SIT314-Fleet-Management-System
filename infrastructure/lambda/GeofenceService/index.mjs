
const HIGH_DEMAND_ZONES = [
  { name: "CBD", lat: -37.8136, lng: 144.9631, radius: 2.0 },
  { name: "Southbank", lat: -37.8228, lng: 144.9642, radius: 1.5 },
  { name: "Docklands", lat: -37.8188, lng: 144.9460, radius: 1.5 },
  { name: "Carlton", lat: -37.8005, lng: 144.9668, radius: 1.5 },
  { name: "Fitzroy", lat: -37.7984, lng: 144.9784, radius: 1.5 }
];

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function checkGeofence(lat, lng) {
  const results = [];
  for (const zone of HIGH_DEMAND_ZONES) {
      const dist = calculateDistance(lat, lng, zone.lat, zone.lng);
      if (dist <= zone.radius) {
          results.push({
              zoneName: zone.name,
              distance: parseFloat(dist.toFixed(2)),
              isHighDemand: true
          });
      }
  }
  return results;
}

export const handler = async (event) => {
  console.log("📥 GeofenceService received event:", JSON.stringify(event, null, 2));
  
  let inputData = null;
  
  if (event.Records && Array.isArray(event.Records)) {
      try {
          inputData = JSON.parse(event.Records[0].body);
      } catch (e) {
          console.error("❌ Failed to parse SQS message:", e);
          return { statusCode: 400, body: "Invalid message format" };
      }
  } else {
      inputData = event;
  }
  
  const { vehicleId, lat, lng, passengerId } = inputData;
  
  if (lat === undefined || lng === undefined) {
      console.error("❌ Missing lat or lng");
      return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing location coordinates" })
      };
  }
  
  console.log(`📍 Checking geofence for (${lat}, ${lng})`);
  
  const geofenceResults = checkGeofence(lat, lng);
  const isInHighDemandZone = geofenceResults.length > 0;
  
  const response = {
      vehicleId: vehicleId || "unknown",
      passengerId: passengerId || null,
      location: { lat, lng },
      isInHighDemandZone: isInHighDemandZone,
      zones: geofenceResults,
      timestamp: Date.now()
  };
  
  console.log(`✅ Geofence check complete: ${isInHighDemandZone ? 'IN' : 'NOT IN'} high-demand zone`);
  
  return {
      statusCode: 200,
      body: JSON.stringify(response)
  };
};