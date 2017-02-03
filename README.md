# amule-js

It exposes a couple of javascript [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) to interact with amule.

It uses [chrome tcp API](https://developer.chrome.com/apps/sockets_tcp) if present. It can be use for [Chrome App](https://developer.chrome.com/apps/about_apps) or [NW.js](https://nwjs.io/).

If [chrome tcp API](https://developer.chrome.com/apps/sockets_tcp) is not available it uses [Node net API](https://nodejs.org/dist/latest/docs/api/net.html). It can be use for [Node](https://nodejs.org/) or [electron](http://electron.atom.io/).

amule-js-node-example.js is an example written in Nodejs.

## API

```javascript
aMule.connect('127.0.0.1', 4712, 'password', md5).then(m => {
  // you are connected
});
```

```javascript
aMule.getSharedFiles().then(listOfFileJSON => {
  // parse json file
});
```

```javascript
aMule.search('search key words');
```

```javascript
aMule.fetchSearch().then(listOfFileJSON => {
  // parse json file
})
```

```javascript
aMule.getDownloads().then(listOfFileJSON => {
  // parse json file
});
```
```javascript
aMule.download(searchResult);
```
