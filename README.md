# amule-js

Javascript API to connect to amule. It exposes a couple of [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) to interact with amule. It uses [chrome.sockets.tcp](https://developer.chrome.com/apps/sockets_tcp).

```javascript
aMule.connect('127.0.0.1', 4712, 'password', md5).then(function(m){
  // you are connected
});
```

```javascript
aMule.getSharedFiles().then(function(listOfFileJSON){
  // parse json file
});
```

```javascript
aMule.search('search key words');
```

```javascript
aMule.fetchSearch().then(function(listOfFileJSON){
  // parse json file
})
```

```javascript
aMule.getDownloads().then(function(listOfFileJSON){
  // parse json file
});
```
