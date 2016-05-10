var md5 = require("blueimp-md5");
var amuleJs = require('../lib/amule-js.js');
var net = require('net');

// var HOST = '10.0.0.71';
var HOST = 'localhost';
var PORT = 4712;

exports['test'] = {
  setUp : function(done) {
    done();
  },
  'test1' : function(test) {
    console.log('');
    amuleJs.aMule.init(HOST, PORT, 'tttttt', md5);
    var client = new net.Socket();

    client.connect(PORT, HOST, function() {
      console.log(client.write(amuleJs.aMule.getAuthRequest1()));
      client.end();
    });

    client.on('data', function(data) {
      console.log('DATA: ' + data);
      client.destroy();
    });

    client.on('close', function() {
      console.log('Connection closed');
      test.done();
    });
    test.equal('awesome', 'awesome', 'should be awesome.');
  }
};
