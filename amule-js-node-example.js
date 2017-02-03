const net = require('net');
const aMule = require('./amule-js.js');
const md5 = require('./node_modules/blueimp-md5/js/md5.js');

/**
 * 
 * Run 
 * > npm install
 * > node amule-js-node-example.js
 * 
 */

amuleCli = aMule.aMule;
amuleCli.initNetModule(net);

amuleCli.connect('127.0.0.1', 4712, 'password', md5).then(m => {
  console.log(m);
  amuleCli.getSharedFiles().then(res => {
    res.children.forEach(e => console.log(e.value));
    process.exit();
  });
});


