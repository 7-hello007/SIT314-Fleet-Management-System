const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

const AWS_IOT_ENDPOINT = 'a3bl1zyqzuysr-ats.iot.ap-southeast-2.amazonaws.com'; // your endpoint
const THING_NAME = 'SIT314Simulator01';
const CLIENT_ID = THING_NAME;

// your AWS IoT credentials directory path
const CERT_DIR = path.join(__dirname, 'cert');
const CERT = path.join(CERT_DIR, '81aaa803a684fc4818345f6ec18bfd5ca5c24835afd7cb004b7ac6d4b8fd2014-certificate.pem.crt');
const KEY = path.join(CERT_DIR, '81aaa803a684fc4818345f6ec18bfd5ca5c24835afd7cb004b7ac6d4b8fd2014-private.pem.key');
const CA = path.join(CERT_DIR, 'AmazonRootCA1.pem');

const TOPIC = 'fleet/telemetry';
const VEHICLE_COUNT = 500; // start with 500 vehicles

// generate random location
function randomLocation() {
    return {
        lat: -37.8136 + (Math.random() - 0.5) * 0.5,
        lng: 144.9631 + (Math.random() - 0.5) * 0.5
    };
}

// generate telemetry data for a vehicle
function generateTelemetry(vehicleId) {
    return JSON.stringify({
        vehicleId: vehicleId,
        timestamp: Date.now(),
        location: randomLocation(),
        speed: Math.floor(Math.random() * 80),
        heading: Math.floor(Math.random() * 360),
        batteryLevel: Math.floor(Math.random() * 100),
        status: Math.random() > 0.9 ? 'offline' : 'online',
        passengerCount: Math.floor(Math.random() * 4),
        region: Math.random() > 0.7 ? 'high_demand' : 'normal'
    });
}

// create a MQTT client for a vehicle
function createVehicleClient(vehicleId) {
    const clientId = `vehicle_${String(vehicleId).padStart(3, '0')}`;
    const options = {
        host: AWS_IOT_ENDPOINT,
        protocol: 'mqtts',
        port: 8883,
        clientId: clientId,
        cert: fs.readFileSync(CERT),
        key: fs.readFileSync(KEY),
        ca: fs.readFileSync(CA),
        rejectUnauthorized: true,
        keepalive: 60
    };

    const client = mqtt.connect(options);
    let messageCount = 0;

    client.on('connect', () => {
        console.log(`GOOD: ${clientId} connected`);
        // publish telemetry data every 5 seconds
        setInterval(() => {
            const payload = generateTelemetry(clientId);
            client.publish(TOPIC, payload, { qos: 1 }, (error) => {
                if (error) {
                    console.error(`FAIL: ${clientId} publish error:`, error);
                } else {
                    messageCount++;
                    if (messageCount % 10 === 0) {
                        console.log(`INFO: ${clientId} published ${messageCount} messages`);
                    }
                }
            });
        }, 5000);
    });

    client.on('error', (error) => {
        console.error(`FAIL: ${clientId} connection error:`, error);
    });

    return client;
}

// start the simulation
console.log(`Starting ${VEHICLE_COUNT} vehicles...`);

for (let i = 1; i <= VEHICLE_COUNT; i++) {
    // delay each vehicle initialization by 50ms to avoid overwhelming the MQTT broker
    setTimeout(() => {
        createVehicleClient(i);
    }, i * 50);
}

console.log(`GOOD: All ${VEHICLE_COUNT} vehicles initializing...`);
console.log(`INFO: Publishing to topic: ${TOPIC}`);