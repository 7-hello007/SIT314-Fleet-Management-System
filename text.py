#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SIT314 Week 7 - Scalability Test Metric Collector (Dimension Format Fixed)
"""

import subprocess
import json
import datetime
import sys
import re
from zoneinfo import ZoneInfo

REGION = "ap-southeast-2"

def parse_time_input(time_str):
    match = re.match(r"^(\d{1,2}):(\d{2})$", time_str.strip())
    if not match:
        raise ValueError("Invalid time format, please use HH:MM e.g. 21:00")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError("Hour range: 0-23, Minute range: 0-59")
    now = datetime.datetime.now(ZoneInfo("Australia/Sydney"))
    start_aest = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return start_aest

def run_cloudwatch_query(namespace, metric_name, dimensions, statistic, start_time, end_time):
    cmd = [
        "aws", "cloudwatch", "get-metric-statistics",
        "--namespace", namespace,
        "--metric-name", metric_name,
        "--start-time", start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--end-time", end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--period", "60",
        "--statistics", statistic,
        "--region", REGION,
        "--output", "json"
    ]
    if dimensions:
        # Correct format: Name=key,Value=value
        key, value = next(iter(dimensions.items()))
        dim_str = f"Name={key},Value={value}"
        cmd.extend(["--dimensions", dim_str])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return data.get("Datapoints", [])
    except subprocess.CalledProcessError as e:
        print(f"\nFAIL: Command execution failed: {e}")
        print(f"Error output: {e.stderr}")
        return []
    except json.JSONDecodeError:
        return []

def extract_value(datapoints, statistic):
    if not datapoints:
        return 0.0
    values = [dp[statistic] for dp in datapoints if statistic in dp]
    return max(values) if values else 0.0

def print_table(results):
    print("\n" + "=" * 70)
    print("INFO: Test Metric Results (Maximum value within test window)")
    print("=" * 70)
    categories = {}
    for label, value in results:
        if label.startswith("LocationUpdateService"):
            cat = "Lambda - LocationUpdateService"
        elif label.startswith("KinesisForwarder"):
            cat = "Lambda - KinesisForwarder"
        elif label.startswith("AnalyticsConsumerInflux"):
            cat = "Lambda - AnalyticsConsumerInflux"
        elif label.startswith("Account"):
            cat = "Lambda - Account Level"
        elif label.startswith("DynamoDB"):
            cat = "DynamoDB - VehicleState"
        elif label.startswith("Kinesis"):
            cat = "Kinesis - FleetTelemetryStream"
        else:
            cat = "Others"
        categories.setdefault(cat, []).append((label, value))
    for cat, items in categories.items():
        print(f"\n【{cat}】")
        max_len = max(len(label) for label, _ in items) if items else 0
        for label, value in items:
            if isinstance(value, float) and value % 1 != 0:
                val_str = f"{value:.2f}"
            else:
                val_str = f"{int(value)}"
            if "Duration" in label or "Latency" in label:
                val_str += " ms"
            elif "Bytes" in label:
                val_str += " Bytes"
            elif "Invocations" in label or "Records" in label or "Capacity" in label or "Requests" in label:
                val_str += " times"
            elif "Peak" in label or "Limit" in label:
                val_str += " instances"
            print(f"  {label.ljust(max_len)} : {val_str}")

def main():
    print("=" * 50)
    print("SIT314 Week 7 - Scalability Test Metric Collector")
    print("=" * 50)
    print()
    try:
        time_str = input("Enter test start time (AEST, HH:MM e.g. 21:00): ").strip()
        start_aest = parse_time_input(time_str)
    except ValueError as e:
        print(f"FAIL: {e}")
        sys.exit(1)
    end_aest = start_aest + datetime.timedelta(minutes=10)
    start_utc = start_aest.astimezone(datetime.timezone.utc)
    end_utc = end_aest.astimezone(datetime.timezone.utc)
    print(f"\nGOOD: Start Time (AEST): {start_aest.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"GOOD: End Time (AEST): {end_aest.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Start Time (UTC):  {start_utc.strftime('%Y-%m-%d %H:%M:%SZ')}")
    print(f"End Time (UTC):  {end_utc.strftime('%Y-%m-%d %H:%M:%SZ')}")
    print(f"Test Duration: 10 minutes")
    print("\nQuerying CloudWatch... (may take 30-60 seconds)")
    print("-" * 50)

    queries = [
        ("AWS/Lambda", "Invocations", {"FunctionName": "LocationUpdateService"}, "Sum", "LocationUpdateService Total Invocations"),
        ("AWS/Lambda", "ConcurrentExecutions", {"FunctionName": "LocationUpdateService"}, "Maximum", "LocationUpdateService Concurrency Peak"),
        ("AWS/Lambda", "Errors", {"FunctionName": "LocationUpdateService"}, "Sum", "LocationUpdateService Error Count"),
        ("AWS/Lambda", "Throttles", {"FunctionName": "LocationUpdateService"}, "Sum", "LocationUpdateService Throttle Count"),
        ("AWS/Lambda", "Duration", {"FunctionName": "LocationUpdateService"}, "Average", "LocationUpdateService Average Duration"),
        ("AWS/Lambda", "Duration", {"FunctionName": "LocationUpdateService"}, "Maximum", "LocationUpdateService Max Duration"),
        ("AWS/Lambda", "Invocations", {"FunctionName": "KinesisForwarder"}, "Sum", "KinesisForwarder Total Invocations"),
        ("AWS/Lambda", "ConcurrentExecutions", {"FunctionName": "KinesisForwarder"}, "Maximum", "KinesisForwarder Concurrency Peak"),
        ("AWS/Lambda", "Errors", {"FunctionName": "KinesisForwarder"}, "Sum", "KinesisForwarder Error Count"),
        ("AWS/Lambda", "Throttles", {"FunctionName": "KinesisForwarder"}, "Sum", "KinesisForwarder Throttle Count"),
        ("AWS/Lambda", "Duration", {"FunctionName": "KinesisForwarder"}, "Average", "KinesisForwarder Average Duration"),
        ("AWS/Lambda", "Duration", {"FunctionName": "KinesisForwarder"}, "Maximum", "KinesisForwarder Max Duration"),
        ("AWS/Lambda", "Invocations", {"FunctionName": "AnalyticsConsumerInflux"}, "Sum", "AnalyticsConsumerInflux Total Invocations"),
        ("AWS/Lambda", "ConcurrentExecutions", {"FunctionName": "AnalyticsConsumerInflux"}, "Maximum", "AnalyticsConsumerInflux Concurrency Peak"),
        ("AWS/Lambda", "Errors", {"FunctionName": "AnalyticsConsumerInflux"}, "Sum", "AnalyticsConsumerInflux Error Count"),
        ("AWS/Lambda", "Throttles", {"FunctionName": "AnalyticsConsumerInflux"}, "Sum", "AnalyticsConsumerInflux Throttle Count"),
        ("AWS/Lambda", "Duration", {"FunctionName": "AnalyticsConsumerInflux"}, "Average", "AnalyticsConsumerInflux Average Duration"),
        ("AWS/Lambda", "Duration", {"FunctionName": "AnalyticsConsumerInflux"}, "Maximum", "AnalyticsConsumerInflux Max Duration"),
        ("AWS/Lambda", "AccountConcurrentExecutions", None, "Maximum", "Account Total Concurrency Peak"),
        ("AWS/Lambda", "AccountConcurrencyLimit", None, "Maximum", "Account Concurrency Limit"),
        ("AWS/DynamoDB", "ConsumedWriteCapacityUnits", {"TableName": "VehicleState"}, "Sum", "DynamoDB Consumed Write Capacity Units"),
        ("AWS/DynamoDB", "ConsumedReadCapacityUnits", {"TableName": "VehicleState"}, "Sum", "DynamoDB Consumed Read Capacity Units"),
        ("AWS/DynamoDB", "WriteThrottleEvents", {"TableName": "VehicleState"}, "Sum", "DynamoDB Write Throttle Events"),
        ("AWS/DynamoDB", "ReadThrottleEvents", {"TableName": "VehicleState"}, "Sum", "DynamoDB Read Throttle Events"),
        ("AWS/DynamoDB", "ReturnedItemCount", {"TableName": "VehicleState"}, "Sum", "DynamoDB Returned Item Count"),
        ("AWS/DynamoDB", "SuccessfulRequestCount", {"TableName": "VehicleState"}, "Sum", "DynamoDB Successful Request Count"),
        ("AWS/DynamoDB", "SystemErrors", {"TableName": "VehicleState"}, "Sum", "DynamoDB System Error Count"),
        ("AWS/DynamoDB", "UserErrors", {"TableName": "VehicleState"}, "Sum", "DynamoDB User Error Count"),
        ("AWS/Kinesis", "IncomingRecords", {"StreamName": "FleetTelemetryStream"}, "Sum", "Kinesis Incoming Records Count"),
        ("AWS/Kinesis", "IncomingBytes", {"StreamName": "FleetTelemetryStream"}, "Sum", "Kinesis Incoming Bytes"),
        ("AWS/Kinesis", "GetRecords.Records", {"StreamName": "FleetTelemetryStream"}, "Sum", "Kinesis Get Records Count"),
        ("AWS/Kinesis", "GetRecords.Latency", {"StreamName": "FleetTelemetryStream"}, "Maximum", "Kinesis Get Records Latency"),
        ("AWS/Kinesis", "PutRecord.Latency", {"StreamName": "FleetTelemetryStream"}, "Maximum", "Kinesis Put Record Latency"),
        ("AWS/Kinesis", "ReadProvisionedThroughputExceeded", {"StreamName": "FleetTelemetryStream"}, "Sum", "Kinesis Exceeded Read Throughput"),
        ("AWS/Kinesis", "WriteProvisionedThroughputExceeded", {"StreamName": "FleetTelemetryStream"}, "Sum", "Kinesis Exceeded Write Throughput"),
    ]

    results = []
    total = len(queries)
    for idx, (namespace, metric, dims, stat, label) in enumerate(queries, 1):
        print(f"  [{idx}/{total}] Querying {label}...", end="", flush=True)
        datapoints = run_cloudwatch_query(namespace, metric, dims, stat, start_utc, end_utc)
        value = extract_value(datapoints, stat)
        results.append((label, value))
        print(f" ✓ {value}")

    print_table(results)
    print("\n" + "=" * 70)
    print("Over.")
    print("=" * 70)

if __name__ == "__main__":
    main()
