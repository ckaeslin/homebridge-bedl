var Promise = require('bluebird');
var rp = require('request-promise');
var fs = require('fs');
var util = require('util');

var Accessory, Characteristic, Service, UUIDGen;

var LEDData = [];

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Characteristic = homebridge.hap.Characteristic;
    Service = homebridge.hap.Service;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-bedl", "BEDL", BEDLPlatform, true);
};


function BEDLPlatform(log, config, api) {
    this.config = config || {};

    this.api = api;
    this.accessories = {};
    this.log = log;

    this.ledAmount = config.ledAmount;

    this.setup();

    setInterval(sendValueJob, 50);
}

const clone = (a) => JSON.parse(JSON.stringify(a));

function sendValueJob() {
  const LEDDataTmp = clone(LEDData);
  LEDData = [];

  var options = {
      method: 'POST',
      uri: 'http://localhost:3000/commands',
      body: {
          'commands': LEDDataTmp,
      },
      json: true // Automatically stringifies the body to JSON
  };

  rp(options)
      .then(function (parsedBody) {
          // POST succeeded...
      })
      .catch(function (err) {
          // POST failed...
          this.log(err);
      });

}

/*BEDLPlatform.removeAccessory = function() {
  this.log("Remove Accessory");
  this.api.unregisterPlatformAccessories("homebridge-samplePlatform", "SamplePlatform", this.accessories);

  this.accessories = [];
}*/

BEDLPlatform.prototype.addAccessory = function(uuid, name, ledNr) {
    this.log("Found: %s [ledNr %d]", name, ledNr);

    var accessory = new Accessory(name, uuid);

    accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "BEDL");

    accessory
        .addService(Service.Lightbulb);

    this.accessories[accessory.UUID] = new BEDLAccessory(this.log, accessory, ledNr);

    this.api.registerPlatformAccessories("homebridge-bedl", "BEDL", [accessory]);

};

BEDLPlatform.prototype.configureAccessory = function(accessory) {
    this.accessories[accessory.UUID] = accessory;
};


BEDLPlatform.prototype.setup = function() {
  if(fs.existsSync('/var/homebridge/bedl-accessories.json')) {
    var file = fs.readFileSync('/var/homebridge/bedl-accessories.json', 'utf-8');
    this.accessories = file ? JSON.parse(file) : [];
    this.log(this.accessories);
  } else {
    this.accessories = [];
  }


  for(let idx = 1; idx <= this.ledAmount; idx++) {
    var name = 'bedl-led-nr-' + idx;
    var uuid = UUIDGen.generate(name);
    this.log(uuid);
    var accessory = this.accessories[uuid];

    if (accessory === undefined) {
        this.addAccessory(uuid, name, idx);
    }
    else if (accessory instanceof Accessory) {
        this.accessories[accessory.UUID] = new BEDLAccessory(this.log, accessory, idx);
    }
  }
  fs.writeFileSync('/var/homebridge/bedl-accessories.json', JSON.stringify(this.accessories,  null, 2) , 'utf-8');
}


function BEDLAccessory(log, accessory, ledNr) {
	this.log = log;
  this.accessory = accessory;
  this.ledNr = ledNr;
  LEDData = [];

  this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback();
  });

  /**
   * Initialise the HAP Lightbulb service and configure characteristic bindings
   */
  var service = this.accessory.getService(Service.Lightbulb);

  service
    .getCharacteristic(Characteristic.On) // BOOL
    .on('set', this.setPowerState.bind(this))
    .on('get', this.getPowerState.bind(this));

  service
    .addCharacteristic(new Characteristic.Brightness()) // INT (0-100)
    .on('set', this.setBrightness.bind(this))
    .on('get', this.getBrightness.bind(this));

  service
    .addCharacteristic(new Characteristic.Saturation()) // FLOAT (0-100)
    .on('set', this.setSaturation.bind(this))
    .on('get', this.getSaturation.bind(this));

  service
    .addCharacteristic(new Characteristic.Hue()) // FLOAT (0-360)
    .on('set', this.setHue.bind(this))
    .on('get', this.getHue.bind(this));

}

BEDLAccessory.prototype.getServices = function() {
	var lightbulbService = new Service.Lightbulb(this.accessory.displayName);
  if (logmore) {
      this.log("Setting services for: " + this.accessory.displayName);
  }
  lightbulbService
    .getCharacteristic(Characteristic.On) // BOOL
    .on('set', this.setPowerState.bind(this))
    .on('get', this.getPowerState.bind(this));

  lightbulbService
    .addCharacteristic(new Characteristic.Brightness()) // INT (0-100)
    .on('set', this.setBrightness.bind(this))
    .on('get', this.getBrightness.bind(this));

  lightbulbService
    .addCharacteristic(new Characteristic.Saturation()) // FLOAT (0-100)
    .on('set', this.setSaturation.bind(this))
    .on('get', this.getSaturation.bind(this));

  lightbulbService
    .addCharacteristic(new Characteristic.Hue()) // FLOAT (0-360)
    .on('set', this.setHue.bind(this))
    .on('get', this.getHue.bind(this));

  return [lightbulbService];
}

/**
 * Getters/setters for publicly exposed characteristics for the bulb
 **/
BEDLAccessory.prototype.setPowerState = function(powerState, callback) {
	this.powerState = powerState;
	if (powerState) {
    this.setBrightness(100, callback);
  } else {
    this.setBrightness(0, callback);
  }
}

BEDLAccessory.prototype.setBrightness = function(value, callback) {
	this.brightness = value;
	const com = {};
  com.ledNr = this.ledNr;
  com.value = '%' + this.dec2hex(this.brightness*10);

  LEDData.push(com);

	callback(null);
}

BEDLAccessory.prototype.setSaturation = function(value, callback) {
	this.saturation = value;
	this.writeToBulb(function(){
		callback(null);
	});
}

BEDLAccessory.prototype.setHue = function(value, callback) {
	this.hue = value;
	this.writeToBulb(function(){
		callback(null);
	});
}

BEDLAccessory.prototype.getPowerState = function(callback) {
	callback(this.powerState);
}

BEDLAccessory.prototype.getBrightness = function(callback) {
	callback(this.brightness);
}

BEDLAccessory.prototype.getSaturation = function(callback) {
	callback( this.saturation);
}

BEDLAccessory.prototype.getHue = function(callback) {
	callback(this.hue);
}

BEDLAccessory.prototype.writeToBulb = function(callback) {
	var rgb = this.hsv2rgb1000(this.hue, this.saturation, 100);
	this.log.info("Set | "
		+ rgb.r + " " + rgb.g + " " + rgb.b
		+ " (" + this.powerState ? "On" : "Off" + ")");

  const com = {};
  com.ledNr = 1;
  com.value = 'S' + this.dec2hex(rgb.r) +
                    this.dec2hex(rgb.g) +
                    this.dec2hex(rgb.b) +
                    '3E8';
  LEDData.push(com);
	callback(null);
}


BEDLAccessory.prototype.dec2hex = function(i) {
  var result = "000";
        if      (i >= 0    && i <= 15)    { result = "00" + i.toString(16).toUpperCase(); }
        else if (i >= 16   && i <= 255)   { result = "0"  + i.toString(16).toUpperCase(); }
        else if (i >= 256  && i <= 4095)  { result =       i.toString(16).toUpperCase(); }
  return result;
}

// From http://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
BEDLAccessory.prototype.rgb10002hsv = function(r, g, b) {
  var rr, gg, bb,
      r = r / 1000,
      g = g / 1000,
      b = b / 1000,
      h, s,
      v = Math.max(r, g, b),
      diff = v - Math.min(r, g, b),
      diffc = function(c){
          return (v - c) / 6 / diff + 1 / 2;
      };

  if (diff == 0) {
      h = s = 0;
  } else {
      s = diff / v;
      rr = diffc(r);
      gg = diffc(g);
      bb = diffc(b);

      if (r === v) {
          h = bb - gg;
      }else if (g === v) {
          h = (1 / 3) + rr - bb;
      }else if (b === v) {
          h = (2 / 3) + gg - rr;
      }
      if (h < 0) {
          h += 1;
      }else if (h > 1) {
          h -= 1;
      }
  }
  return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      v: Math.round(v * 100)
  };
}

// From https://gist.github.com/eyecatchup/9536706
BEDLAccessory.prototype.hsv2rgb1000 = function(h, s, v) {
    var r, g, b;
    var i;
    var f, p, q, t;

    // Make sure our arguments stay in-range
    h = Math.max(0, Math.min(360, h));
    s = Math.max(0, Math.min(100, s));
    v = Math.max(0, Math.min(100, v));

    // We accept saturation and value arguments from 0 to 100 because that's
    // how Photoshop represents those values. Internally, however, the
    // saturation and value are calculated from a range of 0 to 1. We make
    // That conversion here.
    s /= 100;
    v /= 100;

    if(s == 0) {
        // Achromatic (grey)
        r = g = b = v;
        return {
            r: Math.round(r * 1000),
            g: Math.round(g * 1000),
            b: Math.round(b * 1000)
        };
    }

    h /= 60; // sector 0 to 5
    i = Math.floor(h);
    f = h - i; // factorial part of h
    p = v * (1 - s);
    q = v * (1 - s * f);
    t = v * (1 - s * (1 - f));

    switch(i) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q;
    }

    return {
        r: Math.round(r * 1000),
        g: Math.round(g * 1000),
        b: Math.round(b * 1000)
    };
}
