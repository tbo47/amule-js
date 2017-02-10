# amule-js

Amule-js is a typescript and/or javascript (ES6) library to communicate with [amule](https://en.wikipedia.org/wiki/AMule).

It works with [chrome-apps](https://developer.chrome.com/apps/about_apps), [nw.js](https://nwjs.io/), [node.js](https://nodejs.org/) or [electron](http://electron.atom.io/).

amule-js-node-ex1.js is an simple example written for nodejs.

## API

```javascript
let aMule = new aMuleModule.AMuleCli('127.0.0.1', 4712, 'password', md5);
aMule.setTextDecoder(new TextDecoder());

aMule.connect().then(m => {

  aMule.getSharedFiles().then(res => {
    res.children.forEach(e => console.log(e.value));
  });

});
```