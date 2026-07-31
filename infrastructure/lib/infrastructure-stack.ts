import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. DynamoDB
    const vehicleStateTable = new dynamodb.Table(this, 'VehicleState', {
      tableName: 'VehicleStateCDK',
      partitionKey: { name: 'vehicleId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. SQS queue
    const dispatchQueue = new sqs.Queue(this, 'DispatchQueue', {
      queueName: 'DispatchQueueCDK',
      visibilityTimeout: cdk.Duration.seconds(30),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 3. Kinesis stream
    const telemetryStream = new kinesis.Stream(this, 'FleetTelemetryStream', {
      streamName: 'FleetTelemetryStreamCDK',
      streamMode: kinesis.StreamMode.ON_DEMAND,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Lambda functions
    const locationUpdateService = new NodejsFunction(this, 'LocationUpdateService', {
      functionName: 'LocationUpdateServiceCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/LocationUpdateService/index.mjs',
      environment: {
        TABLE_NAME: vehicleStateTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });
    vehicleStateTable.grantWriteData(locationUpdateService);

    const kinesisForwarder = new NodejsFunction(this, 'KinesisForwarder', {
      functionName: 'KinesisForwarderCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/KinesisForwarder/index.mjs',
      environment: {
        STREAM_NAME: telemetryStream.streamName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });
    telemetryStream.grantWrite(kinesisForwarder);

    const analyticsConsumer = new NodejsFunction(this, 'AnalyticsConsumerInflux', {
      functionName: 'AnalyticsConsumerInfluxCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/AnalyticsConsumerInflux/index.mjs',
      environment: {
        INFLUX_URL: process.env.INFLUX_URL || '',
        INFLUX_TOKEN: process.env.INFLUX_TOKEN || '',
        INFLUX_ORG: process.env.INFLUX_ORG || '',
        INFLUX_BUCKET: process.env.INFLUX_BUCKET || '',
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
      },
    });
    analyticsConsumer.addEventSource(new cdk.aws_lambda_event_sources.KinesisEventSource(telemetryStream, {
      startingPosition: cdk.aws_lambda.StartingPosition.LATEST,
      batchSize: 10,
    }));

    const dispatchService = new NodejsFunction(this, 'DispatchService', {
      functionName: 'DispatchServiceCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/DispatchService/index.mjs',
      environment: {
        TABLE_NAME: vehicleStateTable.tableName,
        DISPATCH_QUEUE_URL: dispatchQueue.queueUrl,
      },
      timeout: cdk.Duration.seconds(10),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });
    vehicleStateTable.grantReadData(dispatchService);
    dispatchQueue.grantSendMessages(dispatchService);
    dispatchService.addEventSource(new cdk.aws_lambda_event_sources.SqsEventSource(dispatchQueue, {
      batchSize: 1,
    }));

    const geofenceService = new NodejsFunction(this, 'GeofenceService', {
      functionName: 'GeofenceServiceCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/GeofenceService/index.mjs',
      timeout: cdk.Duration.seconds(5),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    const anomalyDetectionService = new NodejsFunction(this, 'AnomalyDetectionService', {
      functionName: 'AnomalyDetectionServiceCDK',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/AnomalyDetectionService/index.mjs',
      timeout: cdk.Duration.seconds(5),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    new cdk.CfnOutput(this, 'DispatchQueueUrl', {
      value: dispatchQueue.queueUrl,
    });
    new cdk.CfnOutput(this, 'VehicleStateTableName', {
      value: vehicleStateTable.tableName,
    });
    new cdk.CfnOutput(this, 'TelemetryStreamName', {
      value: telemetryStream.streamName,
    });
  }
}