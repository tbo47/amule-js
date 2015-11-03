/*
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 *
 * code to send a TCP request to amuled with the Chrome API
 */
var currentCallBackFunction;
var socketId;
var AmuleChrome = function(url, port, password, callback) {
	this.ac = new AMC("127.0.0.1", 4712, "tttttt");
	var ac = this.ac;// for visibility purposes
	var me = this;// for visibility purposes
	chrome.sockets.tcp.create({}, function(createInfo) {
		socketId = createInfo.socketId;
		chrome.sockets.tcp.connect(createInfo.socketId, ac.url, ac.port, function(resultCode) {
			me.connect1(function(info) {
				me.connect2(info, function(info) {
					me.connect3(info, callback);
				});
			});
		});
	});
	chrome.sockets.tcp.onReceive.addListener(function(receiveInfo) {
		currentCallBackFunction(receiveInfo);
	});
};

AmuleChrome.prototype.connect1 = function(callback) {
	console.log("ChromeIO.connect1() sending the first tcp packet to amuled");
	currentCallBackFunction = callback;
	chrome.sockets.tcp.send(socketId, this.ac.getAuthRequest1(), function(sendInfo) {
	});
}

AmuleChrome.prototype.connect2 = function(receiveInfo, callback) {
	console.log("ChromeIO.connect2() receiving a solt ID (aka sessions ID) and sending auth request");
	currentCallBackFunction = callback;
	this.ac.readSalt(receiveInfo.data);
	chrome.sockets.tcp.send(socketId, this.ac.getAuthRequest2(), function(sendInfo) {
	});
}

AmuleChrome.prototype.connect3 = function(receiveInfo, callback) {
	console.log("ChromeIO.connect3() read result of auth request.");
	callback(this.ac.readSalt(receiveInfo.data));
}

AmuleChrome.prototype.search = function(q, callback) {
	console.log("ChromeIO.search() starts search");
	currentCallBackFunction = callback;
	chrome.sockets.tcp.send(socketId, this.ac.getSearchStartRequest(q), function(sendInfo) {
	});
}
