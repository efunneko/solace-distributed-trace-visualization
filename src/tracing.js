// tracing.js - module that contains all code to retreive and parse the trace data

import {Messaging} from "./messaging";

let protobuf = require("protobufjs");


export class Tracing {
  constructor(app) {
    this.app = app;

    this.start();
  }


  start() {
    this.messaging = new Messaging({
      host: "ws://vmr-133-42:8000",
      vpn: "default",
      username: "default",
      password: "default",
      clean: true
    });

    // Connect to the messaging server
    this.messaging.connect();

    // Subscribe to the tracing topic
    this.messaging.subscribe(0, "_telemetry/#", this.rxMessage.bind(this));

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
  rxMessage(topic, msg) {
    console.log("rxMessage", topic, msg)
    this.parseTrace(msg);
  }

  parseTrace(msg) {
    // The message is a protobuf encoded trace
    let trace = this.protoBuf.decode(msg);
    console.log("trace", trace)
  }

}