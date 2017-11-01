import aMuleModule = require('../amule-ts');
const md5 = require('../node_modules/blueimp-md5/js/md5.js');
const StringDecoder = require('string_decoder').StringDecoder;

/**
 * 
 * This node script searches for a keywork including the current date (ex: "linux 2017-06")
 * and download the results list.
 * 
 * 
 * Run 
 * > npm install
 * > npm run example2
 * 
 */

let aMule = new aMuleModule.AMuleCli('192.168.0.112', 4712, 'tttttt', md5);
aMule.setStringDecoder(new StringDecoder('utf8'));

aMule.connect().then(m => {

  let dateObj: Date = new Date();
  let month: number = dateObj.getUTCMonth() + 1;
  let monthStr: string = ('00' + month).slice(-2);
  let year: number = dateObj.getUTCFullYear();

  const q: string = 'clo2 ' + year + '-' + monthStr;

  aMule.search(q).then(result => {
    
    console.log(result.children.length + ' results found for query: ' + q);

    result.children.map(e => {
      console.log(e['partfile_name']);
      aMule.download(e);
    });

    process.exit(0);

  });
});

