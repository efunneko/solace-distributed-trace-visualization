// messaging.js - wrapper of mqtt.js library

var mqtt = require('mqtt/dist/mqtt.js');

export class Messaging {
  constructor(opts) {
    this.host     = opts.host;
    this.vpn      = opts.vpn || "default";
    this.username = opts.username;
    this.password = opts.password;
    this.clientId = opts.clientId;

    this.subscriptions   = [];
    this.subPrefixes     = [];
    this.subExactMatches = [];
    this.subWildcards    = [];

    this.subRefCounts        = {};
    this.subIdToSubscription = {};
    this.subSeq              = 1;

  }

  connect() {
    let opts = {
      username: this.username,
      password: this.password,
      clientId: this.clientId,
      clean: true
    }

    console.log("Connecting to:", this.host, opts)
    this.client  = mqtt.connect(this.host, opts)
 
    this.client.on('connect', () => {
      console.log("Connected!!", this.subscriptions)
      if (this.subscriptions.length) {
        this.subscriptions.forEach(sub => {
          console.log("subscribing:", sub)
          this.client.subscribe(sub.sub, {qos: sub.qos});
        });
      }
    })
     
    this.client.on('message', (topic, msg) => this.rxMessage(topic, msg));
  }

  disconnect() {
    console.log("Disconnect")
    this.client.end();
  }

  dispose() {
    console.log("Dispose")
    this.disconnect();
  }

  subscribe(qos, subscription, callback) {
    let subId = this.subSeq++;
    this.subscriptions.push({sub: subscription, qos: qos, callback: callback, id: subId})
    if (callback) {
      this.learnSubscription(subscription, callback, subId);
    }
    if (this.client) {      
      this.client.subscribe(subscription, {qos: qos});
    }

    this.subRefCounts[subId] = this.subRefCounts[subId] ? this.subRefCounts[subId]++ : 1;
    this.subIdToSubscription[subId]   = [qos, subscription];

    console.log("added sub", subscription)

    return subId;
  }

  unsubscribe(subId) {
    this.unlearnSubScription(subId);
    this.subRefCounts[subId]--;
    if (!this.subRefCounts[subId]) {
      delete(this.subRefCounts[subId]);
      if (this.subIdToSubscription[subId]) {
        this.client.unsubscribe(this.subIdToSubscription[subId][1]);
        delete(this.subIdToSubscription[subId]);
      }
      else {
        console.log("Tried to unsubscribe from subId:", subId)
      }
    }
  }

  publish(topic, msg, opts) {
    this.client.publish(topic, msg, opts);
  }

  rxMessage(topic, msg) {
    console.log("rxMessage", topic, msg)
    let cbs = this.getMessageCallbacks(topic);

    cbs.forEach(cb => cb(topic, msg));

  }

  getMessageCallbacks(topic) {
    let cbs = [];
    this.subPrefixes.forEach(item => {
      if (topic.startsWith(item.prefix)) {
        cbs.push(item.callback);
      }
    })
    this.subExactMatches.forEach(item => {
      if (topic == item.sub) {
        cbs.push(item.callback);
      }
    })
    if (this.subWildcards.length) {
      let topicParts = topic.split("/");
      this.subWildcards.forEach(item => {
        let subParts = item.subParts;
        let match = true;
        for (let i = 0; i < subParts.length; i++) {
          if (subParts[i] === "#") {
            break;
          }
          if (topicParts[i] !== subParts[i] && subParts[i] !== "+") {
            match = false;
            break;
          }
        }
        if (match) {
          cbs.push(item.callback);
        }
      })
    }
    return cbs;
  }

  learnSubscription(subscription, callback, subId) {
    if (subscription.match(/\+/)) {
      this.subWildcards.push({
        subParts: subscription.split("/"),
        callback: callback,
        id: subId
      })
    }
    else if (subscription.endsWith("/#")) {
      this.subPrefixes.push({
        prefix: subscription.replace(/\/#$/, ""),
        callback: callback,
        id: subId
      })
    }
    else {
      this.subExactMatches.push({
        sub: subscription,
        callback: callback,
        id: subId
      })
    }
  }

  unlearnSubScription(subId) {
    this.subWildcards     = this.subWildcards.filter(s => s.id != subId);
    this.subPrefixes      = this.subPrefixes.filter(s => s.id != subId);
    this.subExactMatches  = this.subPrefixes.filter(s => s.id != subId);
  }

}

