var Promise = require('bluebird');
var rp = require('request-promise');
var fs = require('fs');
var util = require('util');

var Accessory, Characteristic, Service, UUIDGen;

var LEDData = {
  rgb1: '000000000',
  rgb2: '000000000',
  rgb3: '000000000',
  w1: '000',
  w2: '000',
  w3: '000',
};
var LEDDataOld = {
  rgb1: '000000000',
  rgb2: '000000000',
  rgb3: '000000000',
  w1: '000',
  w2: '000',
  w3: '000',
};

const dynamic = false;
var logger;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Characteristic = homebridge.hap.Characteristic;
    Service = homebridge.hap.Service;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-bedl", "BEDL", BEDLPlatform, dynamic);
};


function BEDLPlatform(log, config, api) {
    this.config = config || {};

    this.api = api;
    this.accessoryList = [];
    this.log = log;
    logger = log;

    this.ledAmount = config.ledAmount;

    setInterval(sendValueJob, 50);
}

const clone = (a) => JSON.parse(JSON.stringify(a));

function sendValueJob() {

  const LEDDataTmp = clone(LEDData);

  const hasChanged= Object.keys(LEDDataTmp).some((element, index, array) => {
    return LEDDataTmp[element] !== LEDDataOld[element];
  });

  if(hasChanged) {
    const commands = [];

    for(let idx = 1; idx <= 3; idx++) {
      const com = {};
      com.ledNr = idx;
      com.value = 'S' + LEDDataTmp['rgb' + idx] + LEDDataTmp['w' + idx];
      commands.push(com);
    }

    var options = {
        method: 'POST',
        uri: 'http://localhost:3000/commands',
        body: {
            'commands': commands,
        },
        json: true // Automatically stringifies the body to JSON
    };
    LEDDataOld = clone(LEDDataTmp);

    rp(options)
        .then(function (parsedBody) {
            // POST succeeded...
        })
        .catch(function (err) {
            // POST failed...
            logger(err);
        });
  }

}


BEDLPlatform.prototype.accessories = function(callback) {
  var accessoryList = [];

  for(let idx = 1; idx <= this.ledAmount; idx++) {
    var name = 'bedl-led-nr-' + idx;
    var uuid = UUIDGen.generate(name);
    var accessory = new Accessory(name, uuid);
    accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "BEDL");

    accessory
        .addService(Service.Lightbulb, 'BEDL LED ' + idx);

    accessoryList.push(new BEDLAccessory(this.log, accessory, idx));

    var nameW = 'bedl-w-led-nr-' + idx;
    var uuidW = UUIDGen.generate(nameW);
    var accessoryW = new Accessory(nameW, uuidW);
    accessoryW
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "BEDL");

    accessoryW
        .addService(Service.Lightbulb, 'BEDL W-LED ' + idx);

    accessoryList.push(new BEDLWhiteAccessory(this.log, accessoryW, idx));
  }
  var nameTemp = 'raspberry-temperature-sensor';
  var uuidTemp = UUIDGen.generate(nameTemp);
  var accessoryTemp = new Accessory(nameTemp, uuidTemp);
  accessoryTemp
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Raspberry");

  accessoryTemp
      .addService(Service.TemperatureSensor, 'Raspi Temp Sensor');

  accessoryList.push(new TemperatureSensorAccessory(this.log, accessoryTemp));

  var nameHum = 'raspberry-humidity-sensor';
  var uuidHum = UUIDGen.generate(nameHum);
  var accessoryHum = new Accessory(nameHum, uuidHum);
  accessoryHum
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Raspberry");

  accessoryHum
      .addService(Service.HumiditySensor, 'Raspi Humidity Sensor');

  accessoryList.push(new HumiditySensorAccessory(this.log, accessoryHum));

  return callback(accessoryList);
}


function TemperatureSensorAccessory(log, accessory) {
  this.log = log;
  this.accessory = accessory;
  this.temperature = 0;
  this.name = 'Raspberry Temp Sensor',

  this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback(null);
  });

  this.service = this.accessory.getService(Service.TemperatureSensor);

  this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getTemperature.bind(this))
      .setProps({
        minValue: -20,
        maxvalue: 50
      });
}

TemperatureSensorAccessory.prototype.getServices = function() {
  return [this.service];
}

TemperatureSensorAccessory.prototype.getTemperature = function(callback) {
  var self = this;
  var options = {
        method: 'GET',
        uri: 'http://localhost:3000/environment/latest',
        json: true // Automatically stringifies the body to JSON
    };

    rp(options)
        .then(function (parsedBody) {
            self.log(parsedBody);
            callback(null, Math.round(parsedBody.temperature*10.0)/10.0);
        })
        .catch(function (err) {
            // POST failed...
            logger(err);
            callback(err);
        });
}


function HumiditySensorAccessory(log, accessory) {
  this.log = log;
  this.accessory = accessory;
  this.humidity = 0;
  this.name = 'Raspberry Humidity Sensor',

  this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback(null);
  });

  this.service = this.accessory.getService(Service.HumiditySensor);

  this.service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', this.getHumidity.bind(this));
}

HumiditySensorAccessory.prototype.getServices = function() {
  return [this.service];
}

HumiditySensorAccessory.prototype.getHumidity = function(callback) {
  var self = this;
  var options = {
        method: 'GET',
        uri: 'http://localhost:3000/environment/latest',
        json: true // Automatically stringifies the body to JSON
    };

    rp(options)
        .then(function (parsedBody) {
            self.log(parsedBody);
            callback(null, Math.round(parsedBody.humidity*10.0)/10.0);
        })
        .catch(function (err) {
            // POST failed...
            logger(err);
            callback(err);
        });
}


//==================================================
//
//  BEDL WHITE LED

function BEDLWhiteAccessory(log, accessory, ledNr) {
  this.log = log;
  this.accessory = accessory;
  this.powerState = false;
  this.brightness = 0;
  this.name = 'BEDL White LED ' + ledNr;
  this.ledNr = ledNr;

  this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback(null);
  });

  /**
   * Initialise the HAP Lightbulb service and configure characteristic bindings
   */
  this.service = this.accessory.getService(Service.Lightbulb);

  this.service
    .getCharacteristic(Characteristic.On) // BOOL
    .on('set', this.setPowerState.bind(this))
    .on('get', this.getPowerState.bind(this));

  this.service
    .addCharacteristic(new Characteristic.Brightness()) // INT (0-100)
    .on('set', this.setBrightness.bind(this))
    .on('get', this.getBrightness.bind(this));

}


BEDLWhiteAccessory.prototype.getServices = function() {
  return [this.service];
}

/**
 * Getters/setters for publicly exposed characteristics for the bulb
 **/
BEDLWhiteAccessory.prototype.setPowerState = function(powerState, callback) {
	this.powerState = powerState;
	if (powerState) {
    this.setBrightness(100, callback);
  } else {
    this.setBrightness(0, callback);
  }
}

BEDLWhiteAccessory.prototype.setBrightness = function(value, callback) {
	this.brightness = value;

  LEDData['w' + this.ledNr] = dec2hex(this.brightness*10);;

	callback(null);
}

BEDLWhiteAccessory.prototype.getPowerState = function(callback) {
	callback(this.powerState);
}

BEDLWhiteAccessory.prototype.getBrightness = function(callback) {
	callback(this.brightness);
}





//==================================================
//
//  BEDL RGB LED

function BEDLAccessory(log, accessory, ledNr) {
	this.log = log;
  this.accessory = accessory;
  this.powerState = false;
  this.brightness = 0;
  this.saturation = 0;
  this.hue = 0;
  this.name = 'BEDL LED ' + ledNr;
  this.ledNr = ledNr;

  this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback(null);
  });

  /**
   * Initialise the HAP Lightbulb service and configure characteristic bindings
   */
  this.service = this.accessory.getService(Service.Lightbulb);

  this.service
    .getCharacteristic(Characteristic.On) // BOOL
    .on('set', this.setPowerState.bind(this))
    .on('get', this.getPowerState.bind(this));

  this.service
    .addCharacteristic(new Characteristic.Brightness()) // INT (0-100)
    .on('set', this.setBrightness.bind(this))
    .on('get', this.getBrightness.bind(this));

  this.service
    .addCharacteristic(new Characteristic.Saturation()) // FLOAT (0-100)
    .on('set', this.setSaturation.bind(this))
    .on('get', this.getSaturation.bind(this));

  this.service
    .addCharacteristic(new Characteristic.Hue()) // FLOAT (0-360)
    .on('set', this.setHue.bind(this))
    .on('get', this.getHue.bind(this));

}

BEDLAccessory.prototype.getServices = function() {
  return [this.service];
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
  this.writeToBulb(callback);
	/*const com = {};
  com.ledNr = this.ledNr;
  com.value = '%' + dec2hex(this.brightness*10);
  LEDData.push(com);

	callback(null);*/
}

BEDLAccessory.prototype.setSaturation = function(value, callback) {
	this.saturation = value;
	this.writeToBulb(callback);
}

BEDLAccessory.prototype.setHue = function(value, callback) {
	this.hue = value;
	this.writeToBulb(callback);
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
	var rgb = this.hsv2rgb1000(this.hue, this.saturation, this.brightness);
	this.log.info("Set | "
		+ rgb.r + " " + rgb.g + " " + rgb.b
		+ " (" + this.powerState ? "On" : "Off" + ")");

  /*const com = {};
  com.ledNr = this.ledNr;
  com.value = 'S' + dec2hex(rgb.r) +
                    dec2hex(rgb.g) +
                    dec2hex(rgb.b) +
                    '3E8';*/

  LEDData['rgb' + this.ledNr] = dec2hex(rgb.r) + dec2hex(rgb.g) + dec2hex(rgb.b);
	callback(null);
}


const dec2hex = function(i) {
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
