var gpio = require('pi-gpio');
var SerialPort = require('serialport');
var Promise = require('bluebird');

const serialPort = new SerialPort('/dev/ttyAMA0', {
  baudrate: 9600,
  stopbits: 1,
  parity: 'none',
  autoOpen: true,
});

var Service, Characteristic;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory("homebridge-bedl", "BEDL", BEDLAccessory);
}

const openSerialPort = (tryNr = 0) => new Promise((resolve, reject) => {
  serialPort.open((error) => {
    if (error) {
      if (tryNr < 4) return resolve(serialPort.close(() => openSerialPort(tryNr + 1)));
      return reject(error);
    }
    return resolve();
  });
});

const open13 = (tryNr = 0) => new Promise((resolve, reject) => {
  gpio.open(13, 'output', (err13) => {
    if (err13) {
      if (tryNr < 4) return resolve(gpio.close(13, () => open13(tryNr + 1)));
      return reject(err13);
    }
    return resolve();
  });
});

const open11 = (tryNr = 0) => new Promise((resolve, reject) => {
  gpio.open(11, 'output', (err11) => {
    if (err11) {
      if (tryNr < 4) return resolve(gpio.close(11, () => open11(tryNr + 1)));
      return reject(err11);
    }
    return resolve();
  });
});

const openAll = () => new Promise((resolve, reject) => {
  open11()
    .then(open13)
    .then(resetLEDSelection)
    .then(openSerialPort)
    .then(() => {
      console.log('OPEN, ready for LED control.');
      return resolve();
    })
    .catch((err) => {
      console.log('ERROR: Failed to open ports for LED!');
      reject(err);
    });
});

const clearScene = () => { clearInterval(sceneId); };
const clone = (a) => JSON.parse(JSON.stringify(a));

function LEDSetValueJob() {
  const LEDDataTmp = clone(LEDData);
  LEDData = [];
  // eslint-disable-next-line new-cap
  LEDSetValue(LEDDataTmp);
}

const iterator = (f) => {
  console.log('iter');
  return f();
};

const LEDSetValue = (commands) => {
  if (commands.length > 0) {
    Promise.resolve(commands.map((com) => applyLEDCommand(com.value, com.ledNr)))
    .mapSeries(iterator)
    .then(resetLEDSelection)
    .catch((err) => {
      console.log('ERROR:');
      console.log(err);
    });
  }
};

const writeGPIO = (pin) => (value) => new Promise((resolve, reject) => {
  gpio.write(pin, value, (err) => {
    if (err) return reject(err);
    return resolve();
  });
});

const selectPort = (a, b) => writeGPIO(11)(a).then(writeGPIO(13)(b));

const resetLEDSelection = () => selectPort(0, 0);


const applyLEDCommand = (value, ledNr) => () => {
  if ((value.indexOf('%') === 0 && value.length === 4) ||
        (value.indexOf('S') === 0 && value.length === 13)) {
    if (ledNr === 1) {
      return selectPort(0, 1)
              .then(writeSerial(value))
              .then(drain);
    } else if (ledNr === 2) {
      return selectPort(1, 0)
              .then(writeSerial(value))
              .then(drain);
    } else if (ledNr === 3) {
      return selectPort(1, 1)
              .then(writeSerial(value))
              .then(drain);
    }
    return Promise.reject('wrong LED Nr');
  }
  return Promise.reject('wrong command');
};

const writeSerial = (value) => new Promise((resolve, reject) => {
  setTimeout(() => serialPort.write(value, (errWrite, results) => {
    if (errWrite) return reject(errWrite);
    return resolve(results);
  }), 5);
});

const drain = () => new Promise((resolve, reject) => {
  setTimeout(() => serialPort.drain((errDrain) => {
    if (errDrain) return reject(errDrain);
    setTimeout(() => resolve(), 5);
  }), 5);
});



function BEDLAccessory(log, config) {
	this.log = log;
	this.name = config["name"]
	this.address = config["address"]

  openAll()
    .then(() => {
      setInterval(LEDSetValueJob, 50);
    })
    .catch((err) => {
      console.log(err);
    });

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
	this.writeToBulb(function(){
		callback(null);
	});
}

BEDLAccessory.prototype.setBrightness = function(value, callback) {
	this.brightness = value;
	this.writeToBulb(function(){
		callback(null);
	});
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


/**
 * Functions for interacting directly with the lightbulb's RGB property
 **/
BEDLAccessory.prototype.readFromBulb = function(callback) {
	this.nobleCharacteristic.read(function(error, buffer) {
		if (error) {
			this.log.warn("Read from bluetooth characteristic failed | " + error);
			callback(error);
			return;
		}
		var r = buffer.readUInt8(1);
		var g = buffer.readUInt8(2);
		var b = buffer.readUInt8(3);

		this.log.info("Get | " + r + " " + g + " " + b);
		var hsv = this.rgb2hsv(r, g, b);
		this.hue = hsv.h;
		this.saturation = hsv.s;
		this.brightness = hsv.v;
		callback(null);
	}.bind(this))
}

BEDLAccessory.prototype.writeToBulb = function(callback) {
	var rgb = this.hsv2rgb1000(this.hue, this.saturation, this.brightness);
	this.log.info("Set | "
		+ rgb.r + " " + rgb.g + " " + rgb.b
		+ " (" + this.powerState ? "On" : "Off" + ")");

  const com = {};
  com.ledNr = 1;
  com.value = 'S' + BEDLAccessory.prototype.dec2hex(rgb.r) +
                    BEDLAccessory.prototype.dec2hex(rgb.g) +
                    BEDLAccessory.prototype.dec2hex(rgb.b) + '000';
  LEDData.push(com);
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
