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

 /**
  * get the date. Example: "2017-11"
  */
function getMonth(): string {
  const dateObj = new Date(),
    month = dateObj.getUTCMonth() + 1,
    monthStr: string = ('00' + month).slice(-2),
    year: number = dateObj.getUTCFullYear();
  return year + '-' + monthStr;
}

/**
 * 
 * @param funcs array of function with promises to execute
 */
function promiseSerial<T>(funcs: Array<() => Promise<T>>) {
  return funcs.reduce((promise, func) =>
    promise.then(result => func().then(x => result.concat(x))),
    Promise.resolve<T[]>([]));
}

let aMule = new aMuleModule.AMuleCli('192.168.0.112', 4712, 'tttttt', md5);
aMule.setStringDecoder(new StringDecoder('utf8'));

aMule.connect().then(m => {
  const query = 'clo2 ' + getMonth();
  aMule.search(query, 2).then(result => {
    const funcs = result.children.map(e => () => aMule.download(e))
    console.log(funcs.length + ' results found for query: ' + query);
    promiseSerial(funcs).then(list => {
      list.map(e => console.log(e['partfile_name']))
      process.exit(0);
    })
  });
});

