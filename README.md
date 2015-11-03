# amule-js : Javascript amule client

## Description

amule-js is a javascript API to connect to amule/amuled.

amule-connect.js contains methods to build binary requests and read binary responses for [amule](https://en.wikipedia.org/wiki/AMule). It's not specific to any javascript engine. It uses [DataViews](http://www.javascripture.com/DataView) to create and read [ArrayBuffers](http://www.javascripture.com/ArrayBuffer).

amule-chrome.js contains methods to create a [TCP](https://developer.chrome.com/apps/sockets_tcp) client for Chrome/Chromium and wrap the requests/responses defined in amule-connect.js.

Therefore amule-connect.js has no dependency on amule-chrome.js. And amule-chrome.js depends heavily on amule-connect.js.   

## Usage

### Script usage

The Chrome TCP API is not available for a regular webpage, it needs to be wrapped in a [Chrome App](https://developer.chrome.com/apps/about_apps).

Include scripts in this order

```html
<script src="md5.js"></script>
<script src="amule-connect.js"></script>
<script src="amule-chrome.js"></script>
```

### Connection

Connect to amule via AmuleChrome(url, port, password, callback) 
```js
var amuleChrome = new AmuleChrome("127.0.0.1", 4712, "MyPassWord", function(code) {
	if (code == 4) {
		// You are connected to amule. Start a search!
	}
});
```
### Search

```js
amuleChrome.search("test key words", function(info) {
	//search done
});
```

## License

Released under the [MIT license](http://www.opensource.org/licenses/MIT).
