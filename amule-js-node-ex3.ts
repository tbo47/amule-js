import aMuleModule = require('./amule-ts');
const md5 = require('./node_modules/blueimp-md5/js/md5.js');
const StringDecoder = require('string_decoder').StringDecoder;

/**
 * This example refresh the shared files list and print as html
 * 
 * 
 * Run 
 * > npm install
 * > npm run example3 > my-shared-files.html
 * 
 */

let aMule = new aMuleModule.AMuleCli('192.168.0.112', 4712, 'tttttt', md5);
aMule.setStringDecoder(new StringDecoder('utf8'));

aMule.connect().then(m => {
  aMule.reloadSharedFiles().then(result => {
    aMule.getSharedFiles().then(res => {
      console.log('<html><body>');
      console.log('<div>' + res.children.length + ' files are shared</div>');
      res.children.forEach(e => console.log('<a href="' + e['partfile_ed2k_link'] + '">' + e['partfile_name'] + '</a><br>'));
      console.log('</body></html>');
      process.exit(0);
    });
  });

});

