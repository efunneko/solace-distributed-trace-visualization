// tracing.js - module that contains all code to retreive and parse the trace data

import {Messaging} from "./messaging";

let protobuf = require("protobufjs");


export class Tracing {
  constructor(app) {
    this.app = app;
  }


  start() {

    // Get the list of brokers from the config
    let brokers = this.app.getConfig().brokers;

    // Create a messaging object per broker
    brokers.forEach(broker => {
      broker.messaging = new Messaging({
        host: broker.host,
        vpn: "default",
        username: "default",
        password: "default",
        clean: true
      });

      // Connect to the messaging server
      broker.messaging.connect();

      // Subscribe to the tracing topic
      broker.messaging.subscribe(0, "_telemetry/#", (topic, msg) => {
        this.rxMessage(broker.name, topic, msg);
      });
    });

    // Load the protobuf schema
    protobuf.load("src/proto/receive.proto", (err, root) => {
      if (err) {
        console.log("Error loading protobuf schema:", err);
        return;
      }

      this.protoBuf = root.lookupType("SpanData");
    })


  }

  // This is the callback that is called when a message is received
  rxMessage(fromBroker, topic, msg) {
    // console.log("rxMessage", fromBroker, topic, msg)
    this.parseSpan(msg);
  }

  parseSpan(msg) {
    // The message is a protobuf encoded trace
    let span = this.protoBuf.decode(msg);

    // Extract the trace ID and span ID and convert them to hex strings
    let traceId = this.convertToHex(span.traceId);
    let spanId = this.convertToHex(span.spanId);

    // Also grab the parent span ID if it is there
    let parentSpanId;    
    if (span.parentSpanId) {
      parentSpanId = this.convertToHex(span.parentSpanId);
    }

    // Add the trace to the trace store
    this.app.addTraceSpan({traceId, spanId, parentSpanId, span});

    console.log("trace", traceId, spanId, parentSpanId);
  }

  // Take an array of numbers and convert it to a hex string
  convertToHex(arr) {
    let str = ""
    for (let i = 0; i < arr.length; i++) {
      str += arr[i].toString(16).padStart(2, "0");
    }
    return str;
  }

}