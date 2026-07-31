import { InfluxDB, Point } from '@influxdata/influxdb-client';

const INFLUX_URL = "https://ff05wk78l2-jelnhntvgbhvfd.timestream-influxdb.ap-southeast-2.on.aws:8181";
const INFLUX_TOKEN = "apiv3_eaThWiIEf2Lj42B1nFOyWZR2gjRSlBZ8FXPhY7aQE_FnFdcsyRnbMUVisKGmO7-qfIOa_6J7e4_E1g3N9kYyOg";
const INFLUX_ORG = "_admin";
const INFLUX_BUCKET = "FleetTelemetryDB";

function decodePayload(data) {
    return JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
}

function buildInfluxPoint(telemetry) {
    const point = new Point('vehicle_telemetry')
        .tag('vehicleId', telemetry.vehicleId || 'unknown')
        .tag('status', telemetry.status || 'unknown')
        .tag('region', telemetry.region || 'normal')
        .floatField('speed', telemetry.speed || 0)
        .floatField('heading', telemetry.heading || 0)
        .floatField('batteryLevel', telemetry.batteryLevel || 0)
        .intField('passengerCount', telemetry.passengerCount || 0)
        .floatField('lat', telemetry.location?.lat || 0)
        .floatField('lng', telemetry.location?.lng || 0);
    if (telemetry.timestamp) point.timestamp(new Date(telemetry.timestamp));
    return point;
}

export const handler = async (event) => {
    if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
        throw new Error("Missing env vars");
    }
    const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
    const writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms');
    const points = [];
    for (const record of event.Records) {
        try {
            const payload = decodePayload(record.kinesis.data);
            points.push(buildInfluxPoint(payload));
        } catch (e) { console.error(e); }
    }
    if (points.length) {
        writeApi.writePoints(points);
        await writeApi.close();
        console.log(`✅ Written ${points.length} points`);
    }
    return { statusCode: 200 };
};