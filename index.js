var Promise = require('bluebird');
var rp = require('request-promise');

var Service, Characteristic;

var LEDData = [];
var logger;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory("homebridge-bedl", "BEDL", BEDLAccessory);
}

function BEDLAccessory(log, config) {
	this.log = log;
  logger = this.log;
	this.name = config["name"];
  this.ledNr = config["number"] || 1;

  LEDData = [];

  /**
   * Initialise the HAP Lightbulb service and configure characteristic bindings
   */
  this.lightService = new Service.Lightbulb(this.name);

  this.lightService
    .getCharacteristic(Characteristic.On) // BOOL
    .on('set', this.setPowerState.bind(this))
    .on('get', this.getPowerState.bind(this));

  this.lightService
    .addCharacteristic(new Characteristic.Brightness()) // INT (0-100)
    .on('set', this.setBrightness.bind(this))
    .on('get', this.getBrightness.bind(this));

  this.lightService
    .addCharacteristic(new Characteristic.Saturation()) // FLOAT (0-100)
    .on('set', this.setSaturation.bind(this))
    .on('get', this.getSaturation.bind(this));

  this.lightService
    .addCharacteristic(new Characteristic.Hue()) // FLOAT (0-360)
    .on('set', this.setHue.bind(this))
    .on('get', this.getHue.bind(this));

}

BEDLAccessory.prototype.getServices = function() {
	return [this.lightService];
}

BEDLAccessory.prototype.identify = function(callback) {
	this.log("[" + this.name + "] Identify requested!");
	// TODO: This could send a sequence of colour flashes to the bulb
	callback(null);
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

  var options = {
      method: 'POST',
      uri: 'http://localhost:3000/commands',
      body: {
          'commands': [
            com
          ],
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
                    '000';

  var options = {
      method: 'POST',
      uri: 'http://localhost:3000/commands',
      body: {
          'commands': [
            com
          ],
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

	callback();
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
