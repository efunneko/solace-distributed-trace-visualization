import {jst}                   from "jayesstee";
import {Body}                  from "./body";
import {Tracing}               from "./tracing";
import {World}                 from "./world";
import {Coordinates}           from "./coordinates";

const DEBUG_MODE = true;


// TODO: Move this to a separate file
const config = {
  brokers: [
    {
      // name: 'canada-broker-1',
      name: 'vmr-133-42',
      host: 'ws://vmr-133-42:8000',
      region: 'ca-central-1',
      connectedBrokers: [
  //      'europe-broker-1',
        'vmr-134-46',
      ]
    },
    {
      //name: 'us-broker-1',
      name: 'vmr-134-46',
      host: 'ws://vmr-134-46:8000',
      region: 'us-west-1',
      connectedBrokers: [
    //    'europe-broker-1',
        'vmr-133-42',
      ]
    },
/*    {
      name: 'europe-broker-1',
      host: 'ws://vmr-133-44:8000',
      region: 'eu-west-1',
      connectedBrokers: [
        'canada-broker-1',
        'us-broker-1',
        'asiapac-broker-1',
      ]
    },
    {
      name: 'asiapac-broker-1',
      host: 'ws://vmr-133-45:8000',
      region: 'ap-northeast-1',
      connectedBrokers: [
        'asiapac-broker-2',
        'asiapac-broker-3',
        'europe-broker-1',
      ]
    },
    {
      name: 'asiapac-broker-2',
      host: 'ws://vmr-133-46:8000',
      region: 'ap-southeast-1',
      connectedBrokers: [
        'asiapac-broker-1',
        'asiapac-broker-3',
      ]
    },
    {
      name: 'asiapac-broker-3',
      host: 'ws://vmr-133-47:8000',
      region: 'ap-southeast-2',
      connectedBrokers: [
        'asiapac-broker-2',
        'asiapac-broker-1',
      ]
    }
*/
  ]
}


export class App extends jst.Component {
  constructor(specs) {
    super();
    
    this.title              = "Jayesstee Starter";
    this.alerts             = [];
          
    this.width              = window.innerWidth;
    this.height             = window.innerHeight;

    this.debug              = DEBUG_MODE;
 
    this.body               = new Body(this, this.width, this.height, this.fontScale);

    // Listen for window resize events
    window.onresize = e => this.resize();

    this.start();

  }

  getConfig() {
    return config;
  }

  render() {
    return jst.$div(
      {id: "app"},
      this.body,
    );
  }

  resize() {
    // Need a small timeout for iOS or the dimensions are wrong
    setTimeout(() => {
      this.width        = window.innerWidth;
      this.height       = window.innerHeight;
      this.body.resize(this.width, this.height);
      this.refresh();
    }, 100);
  }

  start() {
    // Create the tracing object
    this.tracing = new Tracing(this);

    // Start the tracing object
    this.tracing.start();

    // Create the world
    this.world = new World(this);

  }

  addTraceSpan(spanInfo) {
    this.world.addTraceSpan(spanInfo);
  }



}

