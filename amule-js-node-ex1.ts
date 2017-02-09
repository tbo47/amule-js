import aMuleModule = require('./amule-ts');
const md5 = require('./node_modules/blueimp-md5/js/md5.js');

/**
 * 
 * Run 
 * > npm install
 * > npm start
 * 
 */

let aMule = new aMuleModule.AMuleCli('192.168.0.104', 4712, 'tttttt', md5);

aMule.connect().then(m => {

  console.log(m);
  
  aMule.getStats().then(res => {
    console.log(res);
  });

  aMule.getSharedFiles().then(res => {
    res.children.forEach(e => console.log(e.value));
    console.log('----------------------------------------------');
  });

  aMule.getDownloads().then(res => {
    res.children.forEach(e => console.log(e.value));
  });

});

