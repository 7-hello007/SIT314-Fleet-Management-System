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

const mqttOptions = {
    host: AWS_IOT_ENDPOINT,
    protocol: 'mqtts',
    port: 8883,
    clientId: CLIENT_ID,
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
    ca: fs.readFileSync(CA),
    rejectUnauthorized: true,
};

console.log('Connecting to AWS IoT Core...');
const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
    console.log('GOOD: Successfully connected to AWS IoT Core!');

    // send a test message to the topic
    const testMessage = JSON.stringify({
        vehicleId: THING_NAME,
        timestamp: Date.now(),
        location: { lat: -37.8136, lng: 144.9631 },
        speed: 0,
        batteryLevel: 100,
        status: 'online',
    });

    client.publish(TOPIC, testMessage, { qos: 1 }, (error) => {
        if (error) {
            console.error('FAIL: Failed to publish message:', error);
        } else {
            console.log('GOOD: Test message published successfully:', testMessage);
        }
        client.end();
    });
});

client.on('error', (error) => {
    console.error('FAIL: Connection error:', error);
});