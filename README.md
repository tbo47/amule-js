# amule-js

It exposes a couple of javascript [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) to interact with amule.

It works for [chrome-apps](https://developer.chrome.com/apps/about_apps), [nw.js](https://nwjs.io/), [node.js](https://nodejs.org/) or [electron](http://electron.atom.io/).

amule-js-node-example.js is an simple example written in nodejs.

## API

```javascript
aMule.connect('127.0.0.1', 4712, 'password', md5).then(m => console.log('You are connected to amule'));
```

```javascript
aMule.getSharedFiles().then(list => console.log(list));
```

```javascript
aMule.search('search key words');
```

```javascript
aMule.fetchSearch().then(list => console.log(list));
```

```javascript
aMule.getDownloads().then(list => console.log(list));
```

```javascript
aMule.download(searchResultElement);
```

```javascript
aMule.cancelDownload(element);
```