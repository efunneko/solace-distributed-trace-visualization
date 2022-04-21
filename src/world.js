// world.js = A threejs earth with texture, bump and specular maps

import * as THREE from 'three';
import { geoInterpolate } from 'd3-geo';
import { Coordinates } from './coordinates';

const GLOBE_RADIUS              = 1;
const GLOBE_ROTATION_SPEED      = 0.0001;
const CURVE_MIN_ALTITUDE        = 0.1;
const CURVE_MAX_ALTITUDE        = 0.3;
const CURVE_SEGMENTS            = 50;
const DEGREE_TO_RADIAN          = Math.PI / 180;
const EVENT_DURATION_MS         = 300;
const BROKER_FADE_TIME_MS       = 1000;



export class World {
  constructor(app) {
    this.app            = app;
    this.config         = app.getConfig();

    // Used to remember all the links between brokers to avoid duplicates
    this.brokerPairs    = {};

    // Keep track of all the event movements currently going on - this is indexed by 'id'
    this.eventMovements = {};

    // Forever increasing event id 
    this.eventId        = 0;

    // Keep track of how recently an event has transited the broker - indexed by their names
    this.lastEventTime  = {};

    // Keep all active traces - these are removed by a timeout
    this.traces         = {};

    // Initialize the world
    this.init();

  }

  init() {

    // Make an object to lookup the configured brokers
    this.configuredBrokers = {};
    this.config.brokers.forEach(broker => {
      this.configuredBrokers[broker.name] = broker;
    });

    this.renderer = new THREE.WebGLRenderer();
	  this.renderer.setSize( window.innerWidth, window.innerHeight );
	  document.body.appendChild( this.renderer.domElement );

	  this.scene	= new THREE.Scene();
	  this.camera	= new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000 );
	  this.camera.position.z = 4.5;

	  let light	= new THREE.AmbientLight( 0x888888 )
	  this.scene.add( light )

	  light	= new THREE.DirectionalLight( 0xcccccc, 1 )
	  light.position.set(5,3,5)
	  this.scene.add( light )

    this.addWorld();

    // Use the config to add all the brokers to the world
    this.addBrokers();

    // Add the broker connections
    this.addBrokerConnections();

    // Load the textures
    this.loadTubeTextures();

    THREE.DefaultLoadingManager.onLoad = () => {      
      requestAnimationFrame(() => {
        this.annimate();
      })
    }
  }

  loadTubeTextures() {
    let loader = new THREE.TextureLoader();
    this.tubeTextures = {
      "red": loader.load("images/tube-texture-red.png"),
      "green": loader.load("images/tube-texture-green.png"),
      "blue": loader.load("images/tube-texture-blue.png"),
      //"yellow": loader.load("images/tube-texture-yellow.png"),
      "orange": loader.load("images/tube-texture-orange.png"),
    };
  }


  addWorld() {

    this.globe          = new THREE.SphereGeometry(GLOBE_RADIUS, 32, 32)
    this.globeMaterial  = new THREE.MeshPhongMaterial({
      map: new THREE.TextureLoader().load('images/earthmap1k.jpg'),
      bumpMap: new THREE.TextureLoader().load('images/earthbump1k.jpg'),
      specularMap: new THREE.TextureLoader().load('images/earthspec1k.jpg'),
      bumpScale: 0.05,
      shininess: 15.95,
      specular: new THREE.Color('grey')
    })

    this.globeMesh      = new THREE.Mesh(this.globe, this.globeMaterial)

    // Add a gruoup to the globe so we can rotate it
    this.globeGroup     = new THREE.Object3D();
    this.globeGroup.add(this.globeMesh);

    this.scene.add(this.globeGroup);

    // Add the starfield - put this directly in the scene so it doesn't rotate
    const geometry  = new THREE.SphereGeometry(90, 32, 32)

    // create the material, using a texture of startfield
    const material  = new THREE.MeshBasicMaterial()
    material.map   = THREE.ImageUtils.loadTexture('images/galaxy_starfield.png')
    material.side  = THREE.BackSide

    // create the mesh based on geometry and material
    const mesh  = new THREE.Mesh(geometry, material)
    this.scene.add(mesh);


  }

  addBrokers() {

    const brokers = this.config.brokers;

    brokers.forEach((broker) => {
      this.addBroker(broker);
    });

  }

  addBroker(broker) {

    const region   = broker.region;
    const coords   = Coordinates[region];
    const position = this.coordinateToPosition(coords.latitude, coords.longitude, GLOBE_RADIUS);

    // Add a small sphere to represent the broker
    const sphereGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0,
      //specular: 0xffffff,
      shininess: 0,
      transparent: true,
      opacity: 0.8
    });

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(position.x, position.y, position.z);
    this.globeGroup.add(sphere);
    broker.mesh = sphere;
    console.log("broker", broker, position, coords);

  }

  addBrokerConnections() {

    const brokers = this.config.brokers;

    brokers.forEach((broker) => {
      this.addBrokerConnectionsForBroker(broker);
    });

    // Start 10 randome events with random brokers and at a random time
    /*
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.startRandomEvent(
          this.configuredBrokers[Object.keys(this.configuredBrokers)[Math.floor(Math.random() * Object.keys(this.configuredBrokers).length)]]
        )},
        Math.random() * 2000
      );
    }
    */

  }

  addBrokerConnectionsForBroker(broker) {

    const region = broker.region;
    const coords = Coordinates[region];
    const position = this.coordinateToPosition(coords.latitude, coords.longitude, GLOBE_RADIUS);

    const connectedBrokers = broker.connectedBrokers;

    connectedBrokers.forEach((connectedBroker) => {

      // Verify that we have config for the connected broker
      const connectedBrokerConfig = this.configuredBrokers[connectedBroker];
      if (!connectedBrokerConfig) {
        console.warn("No config for broker", connectedBroker);
        return;
      }

      // Check that we haven't already added this connection
      const mates = [broker.name, connectedBroker].sort().join('|');
      if (this.brokerPairs[mates]) {
        return;
      }
      this.brokerPairs[mates] = true;

      const connectedRegion = connectedBrokerConfig.region;
      const connectedCoords = Coordinates[connectedRegion];
      const connectedPosition = this.coordinateToPosition(connectedCoords.latitude, connectedCoords.longitude, GLOBE_RADIUS);

      console.log("connected", coords.latitude, coords.longitude, connectedCoords.latitude, connectedCoords.longitude);
      this.addBrokerConnection([coords.latitude, coords.longitude, connectedCoords.latitude, connectedCoords.longitude]);


    });

  }

  startRandomEvent(broker, previous, color) {

    const region = broker.region;
    const coords = Coordinates[region];

    // Pick random connected broker that is not the previous
    const connectedBrokers = broker.connectedBrokers;
    const connectedBroker = connectedBrokers[Math.floor(Math.random() * connectedBrokers.length)];
    if (previous && connectedBroker === previous.name && connectedBrokers.length > 1) {
      return this.startRandomEvent(broker, previous, color);
    }

    // Get coords for the connected broker
    const connectedBrokerConfig = this.configuredBrokers[connectedBroker];
    const connectedRegion = connectedBrokerConfig.region;
    const connectedCoords = Coordinates[connectedRegion];

    // Save the current destination broker
    this.destinationBroker = connectedBrokerConfig;

    // Add the event movement
    this.addEventMovement(
      [coords.latitude, coords.longitude, connectedCoords.latitude, connectedCoords.longitude],
      EVENT_DURATION_MS,  
      color,
      broker, 
      connectedBrokerConfig
      );

  }

  startEventBetweenBrokers(fromBroker, toBroker, color, trace) {

    const fromRegion = fromBroker.region;
    const fromCoords = Coordinates[fromRegion];

    const toRegion = toBroker.region;
    const toCoords = Coordinates[toRegion];

    this.addEventMovement(
      [fromCoords.latitude, fromCoords.longitude, toCoords.latitude, toCoords.longitude],
      EVENT_DURATION_MS,  
      color,
      fromBroker, 
      toBroker,
      trace
    );

  }


  addCurve(coords, material) {
    const { spline } = this.getSplineFromCoords(coords);
  
    // add curve geometry
    const curveGeometry = new THREE.BufferGeometry();
    const points = new Float32Array(CURVE_SEGMENTS * 3);
    const vertices = spline.getPoints(CURVE_SEGMENTS - 1);
  
    for (let i = 0, j = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      points[j++] = vertex.x;
      points[j++] = vertex.y;
      points[j++] = vertex.z;
    }
  
    // !!!
    // You can use setDrawRange to animate the curve
    curveGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    curveGeometry.setDrawRange(0, CURVE_SEGMENTS);
  
    let mesh = new THREE.Line(curveGeometry, material);

    this.scene.add(mesh);
  }


  addBrokerConnection(coords) {
    const TUBE_RADIUS_SEGMENTS = 8;
    const DEFAULT_TUBE_RADIUS = 0.005;
    const TUBE_CURVE_SEGMENTS = 20;

    const { spline } = this.getSplineFromCoords(coords);
    const geometry = new THREE.TubeBufferGeometry(spline, TUBE_CURVE_SEGMENTS, DEFAULT_TUBE_RADIUS, TUBE_RADIUS_SEGMENTS, false);

    const tubeMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      //emissive: 0xffff00,
      //specular: 0xffffff,
      //shininess: 0,
      transparent: true,
      opacity: 0.5
    });

    let mesh = new THREE.Mesh(geometry, tubeMaterial);
    this.globeMesh.add(mesh);
  }

  addEventMovement(coords, duration, color, fromBroker, toBroker, trace) {
    const TUBE_RADIUS_SEGMENTS = 8;
    const DEFAULT_TUBE_RADIUS = 0.015;
    const TUBE_CURVE_SEGMENTS = 20;

    const eventId = this.eventId++;

    const { spline } = this.getSplineFromCoords(coords);
    const geometry = new THREE.TubeBufferGeometry(spline, TUBE_CURVE_SEGMENTS, DEFAULT_TUBE_RADIUS, TUBE_RADIUS_SEGMENTS, false);

    // Pick a random tubeTexture
    const possibleTubeTextures = Object.keys(this.tubeTextures);
    const tubeTextureName = color || possibleTubeTextures[Math.floor(Math.random() * possibleTubeTextures.length)];
    const texture = this.tubeTextures[tubeTextureName].clone();

    // Start the texture with a 0.5 offset
    texture.offset.x = 0.5;

    // Create the material
    let tubeMaterial = new THREE.MeshPhongMaterial({
      map: texture,
      //emissive: 0xff0000,
      specular: 0xffffff,
      shininess: 20,
      transparent: true,
      //opacity: 0.5
    });

    let mesh = new THREE.Mesh(geometry, tubeMaterial);
    this.globeMesh.add(mesh);

    const now = new Date().getTime();

    this.eventMovements[eventId] = {
      from:      fromBroker,
      to:        toBroker,
      startTime: now,
      duration:  duration,
      mesh:      mesh,
      color:     tubeTextureName,
      trace:     trace
    };

    this.lastEventTime[fromBroker.name] = now;

  }

  // Add a new span between brokers of from client to broker
  addTraceSpan(spanInfo) {
    console.log("New span", spanInfo);

    // Check to see if we already know about his trace
    const traceId = spanInfo.traceId;
    if (!this.traces[traceId]) {
      this.traces[traceId] = {
        traceId: traceId,
        spanById: {},
        spanByParentId: {},
        spans: []
      };

      // Add a timer to age out the trace after 15000ms
      setTimeout(() => {
        delete this.traces[traceId];
      }, 15000);

    }

    // Add the span to the trace
    const trace = this.traces[traceId];
    const span = {
      spanId: spanInfo.spanId,
      parentSpanId: spanInfo.parentSpanId,
      span: spanInfo.span,
      alreadyMoved: false
    };

    trace.spanById[span.spanId] = span;
    trace.spanByParentId[span.parentSpanId] = span;
    trace.spans.push(span);

    // If the parent span id is all zeros, then this is the root span
    console.log("Parent span id", span.parentSpanId);
    if (span.parentSpanId === "0000000000000000" || span.span.clientName.match(/^solclient/)) {
      span.eligibleForMovement = true;
      span.alreadyMoved = true;
    }
    else {
      // For other spans, check to see if this span is eligible for movement
      const parentSpan = trace.spanById[span.parentSpanId];
      if (parentSpan && parentSpan.alreadyMoved) {
        span.eligibleForMovement = true;
      }
    }

    this.checkTraceForMovement(trace);

  }

  // Check to see if we should add some event movement to the visualization
  checkTraceForMovement(trace) {
    console.log("Checking trace for movement", trace);
    if (!trace.inMovement) {
      trace.spans.forEach(span => {
        console.log("Checking span", span);
        if (span.eligibleForMovement && !span.alreadyMoved) {
          console.log("Span is eligible for movement", span);
          let parentSpan = trace.spanById[span.parentSpanId];
          if (parentSpan) {
            // Get the brokers involved
            const fromBroker = this.configuredBrokers[span.span.routerName];
            const toBroker = this.configuredBrokers[parentSpan.span.routerName];

            console.log("From broker", fromBroker);
            console.log("To broker", toBroker);


            if (fromBroker && toBroker) {
              trace.inMovement = true;
              span.alreadyMoved = true;
              console.log("Adding event movement", span.span.userProperties.color);
              let color = "green";
              if (span.span.userProperties && span.span.userProperties.color && span.span.userProperties.color.stringValue) {
                color = span.span.userProperties.color.stringValue;
              }

              this.startEventBetweenBrokers(fromBroker, toBroker, color, trace);
            }
          }
        }
      });
    }
  }

  // Do all the annimations
  annimate() {

    // Figure out how much time has passed since the last frame
    const now = new Date().getTime();
    const delta = now - this.lastFrameTime || 0;
    this.lastFrameTime = now;

    // slightly rotate the globe
    this.globeGroup.rotation.y += GLOBE_ROTATION_SPEED * delta;
    
    // Go through all the movements and update their texture offsets
    Object.keys(this.eventMovements).forEach((key) => {
      const movement = this.eventMovements[key];
      const elapsed = (now - movement.startTime) / movement.duration;
      if (elapsed > 1) {
        delete this.eventMovements[key];
        movement.mesh.removeFromParent();
        movement.mesh.geometry.dispose();

        // Check to see if we should add some more movement
        movement.trace.inMovement = false;
        this.checkTraceForMovement(movement.trace);
        // this.startRandomEvent(movement.to, movement.from, movement.color);
        return;
      }
      else {
        const mesh = movement.mesh;
        mesh.material.map.offset.x = 0.5 - elapsed;
        mesh.material.map.needsUpdate = true;
      }
    
    });

    // Loop through all the brokers and update their colors based on time since last event
    Object.keys(this.configuredBrokers).forEach((key) => {
      const broker = this.configuredBrokers[key];
      const lastEvent = this.lastEventTime[key];
      const magnitude = 1 - ((now - lastEvent) / BROKER_FADE_TIME_MS);
      const colorComponent = magnitude;
      broker.mesh.material.color = new THREE.Color(
        colorComponent,
        colorComponent,
        0
      );
    });


    this.render();

    requestAnimationFrame(() => this.annimate());
  }
  
  getSplineFromCoords(coords) {
    const startLat = coords[0];
    const startLng = coords[1];
    const endLat = coords[2];
    const endLng = coords[3];
  
    // start and end points
    const start = this.coordinateToPosition(startLat, startLng, GLOBE_RADIUS);
    const end = this.coordinateToPosition(endLat, endLng, GLOBE_RADIUS);
    
    // altitude
    const altitude = this.clamp(start.distanceTo(end) * .75, CURVE_MIN_ALTITUDE, CURVE_MAX_ALTITUDE);
    
    // 2 control points
    const interpolate = geoInterpolate([startLng, startLat], [endLng, endLat]);
    const midCoord1 = interpolate(0.25);
    const midCoord2 = interpolate(0.75);
    const mid1 = this.coordinateToPosition(midCoord1[1], midCoord1[0], GLOBE_RADIUS + altitude);
    const mid2 = this.coordinateToPosition(midCoord2[1], midCoord2[0], GLOBE_RADIUS + altitude);
  
    return {
      start,
      end,
      spline: new THREE.CubicBezierCurve3(start, mid1, mid2, end)
    };
  }

  // util function to convert lat/lng to 3D point on globe
  coordinateToPosition(lat, lng, radius) {
    const phi = (90 - lat) * DEGREE_TO_RADIAN;
    const theta = (lng + 180) * DEGREE_TO_RADIAN;

    return new THREE.Vector3(
      - radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  } 

  clamp(num, min, max) {
    return num <= min ? min : (num >= max ? max : num);
  }
  
  
  render() {
    this.renderer.render(this.scene, this.camera);
  } 

}