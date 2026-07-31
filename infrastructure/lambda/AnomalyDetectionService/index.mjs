
const THRESHOLDS = {
  LOW_BATTERY: 20,
  CRITICAL_BATTERY: 10,
  OFFLINE_THRESHOLD: 300,
  HIGH_SPEED: 120,
  IDLE_SPEED: 0,
};

const recentAnomalies = new Map();

export const handler = async (event) => {
  console.log("📥 AnomalyDetectionService received event:", JSON.stringify(event, null, 2));
  
  let telemetryData = null;
  
  if (event.Records && Array.isArray(event.Records)) {
      try {
          telemetryData = JSON.parse(event.Records[0].body);
      } catch (e) {
          console.error("❌ Failed to parse SQS message:", e);
          return { statusCode: 400, body: "Invalid message format" };
      }
  } else {
      telemetryData = event;
  }
  
  const {
      vehicleId,
      timestamp,
      batteryLevel,
      speed,
      status,
      location
  } = telemetryData;
  
  if (!vehicleId) {
      console.error("❌ Missing vehicleId");
      return { statusCode: 400, body: "Missing vehicleId" };
  }
  
  const anomalies = [];
  const currentTime = Date.now();
  const dataTime = timestamp || currentTime;
  const timeDiff = (currentTime - dataTime) / 1000; // 秒
  
  if (batteryLevel !== undefined && batteryLevel < THRESHOLDS.CRITICAL_BATTERY) {
      anomalies.push({
          type: "CRITICAL_BATTERY",
          severity: "critical",
          message: `Vehicle ${vehicleId} has critical battery level: ${batteryLevel}%`,
          value: batteryLevel,
          threshold: THRESHOLDS.CRITICAL_BATTERY
      });
  } else if (batteryLevel !== undefined && batteryLevel < THRESHOLDS.LOW_BATTERY) {
      anomalies.push({
          type: "LOW_BATTERY",
          severity: "warning",
          message: `Vehicle ${vehicleId} has low battery: ${batteryLevel}%`,
          value: batteryLevel,
          threshold: THRESHOLDS.LOW_BATTERY
      });
  }
  
  if (status === "offline" || timeDiff > THRESHOLDS.OFFLINE_THRESHOLD) {
      anomalies.push({
          type: "VEHICLE_OFFLINE",
          severity: "critical",
          message: `Vehicle ${vehicleId} is offline (${status || 'no heartbeat'})`,
          value: timeDiff,
          threshold: THRESHOLDS.OFFLINE_THRESHOLD
      });
  }
  
  if (speed !== undefined && speed > THRESHOLDS.HIGH_SPEED) {
      anomalies.push({
          type: "HIGH_SPEED",
          severity: "warning",
          message: `Vehicle ${vehicleId} exceeded speed limit: ${speed} km/h`,
          value: speed,
          threshold: THRESHOLDS.HIGH_SPEED
      });
  }

  const anomalyKey = `${vehicleId}`;
  if (anomalies.length > 0) {
      const lastReport = recentAnomalies.get(anomalyKey);
      if (lastReport && (currentTime - lastReport) < 300000) {
          const existingTypes = new Set(lastReport.types || []);
          const newTypes = anomalies.map(a => a.type);
          const hasNewType = newTypes.some(t => !existingTypes.has(t));
          if (!hasNewType) {
              console.log(`⏭️ Skipping duplicate anomalies for ${vehicleId}`);
              return {
                  statusCode: 200,
                  body: JSON.stringify({
                      vehicleId,
                      anomalies: [],
                      message: "No new anomalies (duplicate suppressed)"
                  })
              };
          }
      }
      recentAnomalies.set(anomalyKey, {
          timestamp: currentTime,
          types: anomalies.map(a => a.type)
      });
      if (recentAnomalies.size > 1000) {
          const keys = recentAnomalies.keys();
          for (let i = 0; i < 100; i++) {
              recentAnomalies.delete(keys.next().value);
          }
      }
  }
  
  const response = {
      vehicleId: vehicleId,
      timestamp: currentTime,
      dataTimestamp: dataTime,
      anomalies: anomalies,
      anomalyCount: anomalies.length,
      hasAnomalies: anomalies.length > 0
  };
  
  if (anomalies.length > 0) {
      console.log(`🚨 Detected ${anomalies.length} anomalies for ${vehicleId}:`, anomalies.map(a => a.type).join(', '));
  } else {
      console.log(`✅ No anomalies detected for ${vehicleId}`);
  }
  
  return {
      statusCode: 200,
      body: JSON.stringify(response)
  };
};