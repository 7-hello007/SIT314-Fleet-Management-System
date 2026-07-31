import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";

const client = new KinesisClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
const STREAM_NAME = "FleetTelemetryStream";

export const handler = async (event) => {
    console.log("INFO: Received event from IoT Rule:", JSON.stringify(event, null, 2));

    let records = [];

    if (Array.isArray(event)) {
        records = event;
    } else if (event.Records) {
        records = event.Records.map(r => JSON.parse(Buffer.from(r.kinesis.data, 'base64').toString()));
    } else {
        records = [event];
    }

    console.log(`INFO: Processing ${records.length} record(s)`);

    const results = [];

    for (const record of records) {
        try {
            const payload = {
                vehicleId: record.vehicleId || record.vehicleId || "unknown",
                timestamp: record.timestamp || Date.now(),
                location: record.location || { lat: 0, lng: 0 },
                speed: record.speed || 0,
                heading: record.heading || 0,
                batteryLevel: record.batteryLevel || 0,
                status: record.status || "online",
                passengerCount: record.passengerCount || 0,
                region: record.region || "normal"
            };

            const dataBuffer = Buffer.from(JSON.stringify(payload));

            const command = new PutRecordCommand({
                StreamName: STREAM_NAME,
                Data: dataBuffer,
                PartitionKey: payload.vehicleId
            });

            const response = await client.send(command);
            console.log(`GOOD: Forwarded ${payload.vehicleId} to Kinesis, SequenceNumber: ${response.SequenceNumber}`);
            results.push({ vehicleId: payload.vehicleId, status: "success" });
        } catch (error) {
            console.error(`FAIL: Failed to forward record:`, error);
            results.push({ error: error.message });
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: `Processed ${records.length} records`,
            results: results
        })
    };
};