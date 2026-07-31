import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || "ap-southeast-2" });

const DISPATCH_QUEUE_URL = "https://sqs.ap-southeast-2.amazonaws.com/840032437982/DispatchQueue";

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const handler = async (event) => {
    console.log("📥 DispatchService received event:", JSON.stringify(event, null, 2));

    let requestData = null;

    if (event.Records && Array.isArray(event.Records)) {
        try {
            requestData = JSON.parse(event.Records[0].body);
        } catch (e) {
            console.error("❌ Failed to parse SQS message:", e);
            return { statusCode: 400, body: "Invalid SQS message" };
        }
    } else {
        requestData = event;
    }

    const { pickupLat, pickupLng, passengerId } = requestData;

    if (pickupLat === undefined || pickupLng === undefined) {
        console.error("❌ Missing pickup location");
        return { statusCode: 400, body: "Missing pickupLat/pickupLng" };
    }

    console.log(`📍 Looking for nearest vehicle to (${pickupLat}, ${pickupLng})`);

    try {
        const scanCommand = new ScanCommand({
            TableName: "VehicleState",
            FilterExpression: "#status = :online",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":online": "online"
            },
            Limit: 200
        });

        const result = await docClient.send(scanCommand);
        const vehicles = result.Items || [];

        if (vehicles.length === 0) {
            console.log("⚠️ No online vehicles found");
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "No online vehicles available" })
            };
        }

        let nearest = null;
        let minDist = Infinity;

        for (const v of vehicles) {
            const loc = v.location;
            if (!loc || loc.lat === undefined || loc.lng === undefined) continue;

            const dist = calculateDistance(pickupLat, pickupLng, loc.lat, loc.lng);
            if (dist < minDist) {
                minDist = dist;
                nearest = {
                    vehicleId: v.vehicleId,
                    location: loc,
                    distance: dist,
                    batteryLevel: v.batteryLevel,
                    speed: v.speed,
                    status: v.status
                };
            }
        }

        if (!nearest) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "No valid vehicle found" })
            };
        }

        console.log(`✅ Assigned ${nearest.vehicleId} at ${minDist.toFixed(2)} km`);

        const response = {
            success: true,
            passengerId: passengerId || "unknown",
            pickupLocation: { pickupLat, pickupLng },
            assignedVehicle: nearest,
            distanceKm: parseFloat(minDist.toFixed(2))
        };

        if (passengerId) {
            const sqsMessage = {
                passengerId,
                vehicleId: nearest.vehicleId,
                pickupLat,
                pickupLng,
                assignedAt: Date.now()
            };

            const sendCmd = new SendMessageCommand({
                QueueUrl: DISPATCH_QUEUE_URL,
                MessageBody: JSON.stringify(sqsMessage)
            });
            await sqsClient.send(sendCmd);
            console.log(`📤 Sent assignment to SQS for ${passengerId}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error("❌ DispatchService error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};