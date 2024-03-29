import aMuleModule = require('../amule-ts');
const md5 = require('../node_modules/blueimp-md5/js/md5.js');
const StringDecoder = require('string_decoder').StringDecoder;
/**
 * 
 * This node script connects to amule and print the shared files list to the console
 * 
 * 
 * Run 
 * > npm install
 * > npm start
 * 
 */

let aMule = new aMuleModule.AMuleCli('127.0.0.1', 4712, 'password', md5);

aMule.setStringDecoder(new StringDecoder('utf8'));

aMule.connect().then(m => {

  console.log(m);
  
  aMule.getSharedFiles().then(res => {
    res.map(e => console.log(e['partfile_name']));
  });

});

