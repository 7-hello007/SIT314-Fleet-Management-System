import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "VehicleState";

export const handler = async (event) => {
    console.log("INFO: Received event:", JSON.stringify(event, null, 2));

    try {
        const records = Array.isArray(event) ? event : [event];
        const results = [];

        for (const record of records) {
            const {
                vehicleId,
                timestamp,
                location,
                speed,
                heading,
                batteryLevel,
                status,
                passengerCount,
                region
            } = record;

            if (!vehicleId || !timestamp) {
                console.warn("WARNING: Skipping record: missing vehicleId or timestamp", record);
                continue;
            }

            const item = {
                vehicleId: vehicleId,
                timestamp: typeof timestamp === 'number' ? timestamp : parseInt(timestamp),
                location: location || { lat: 0, lng: 0 },
                speed: speed || 0,
                heading: heading || 0,
                batteryLevel: batteryLevel || 0,
                status: status || 'unknown',
                passengerCount: passengerCount || 0,
                region: region || 'normal',
                ttl: Math.floor(Date.now() / 1000) + 2592000
            };

            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: item
            });

            await docClient.send(command);
            console.log(`GOOD: Saved vehicle ${vehicleId} state at ${new Date(timestamp).toISOString()}`);
            results.push({ vehicleId, status: 'success' });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Processed ${results.length} records`,
                results: results
            })
        };

    } catch (error) {
        console.error("FAIL: Error processing event:", error);
        throw error;
    }
};