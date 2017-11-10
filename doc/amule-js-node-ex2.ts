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
  const query = 'clo2 ' + aMule.getMonth();
  aMule.search(query, 2).then(result => {
    const funcs = result.children.map(e => () => aMule.download(e))
    console.log('%d results found for query: %s', funcs.length, query);
    aMule.promiseSerial(funcs).then(list => {
      list.map(e => console.log(e['partfile_name']))
      process.exit(0);
    })
  });
});

