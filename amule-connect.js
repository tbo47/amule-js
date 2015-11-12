"use strict";
/*
 * https://github.com/tla-dev/amule-js/
 * 
 * Licensed under the MIT license: http://www.opensource.org/licenses/MIT
 * 
 * AMC : AMuleConnect object. Contain a set of methods to binary communicate with an amuled server.
 */
var AMC = function(url, port, password) {
	this.url = url;// url of the amuled server
	this.port = port;// port of the amuled server
	this.md5 = md5(password);// password to connect to the server
	this.arrayBuffers = [];// used to build a request to the server
	this.solt = "";// solt number (sessions id) given by the server
	this.responseOpcode;// op code given in the server response
	this.recurcifInBuildTagArrayBuffer = 0;
};
/**
 * from amule ECCodes.h code
 */
var ECCodes = {
	EC_CURRENT_PROTOCOL_VERSION : 0x0204,
	EC_OP_AUTH_REQ : 0x02
};
var ECOpCodes = {
	EC_OP_STRINGS : 0x06,
	EC_TAGTYPE_UINT16 : 0x03,
	EC_TAGTYPE_UINT8 : 2, // defined in ECTagTypes.h
	EC_TAGTYPE_HASH16 : 0x09,
	EC_OP_AUTH_FAIL : 0x03,
	EC_OP_AUTH_OK : 0x04,
	EC_OP_SEARCH_START : 0x26,
	EC_OP_SEARCH_STOP : 0x27,
	EC_OP_SEARCH_RESULTS : 0x28,
	EC_OP_SEARCH_PROGRESS : 0x29,
	EC_OP_DOWNLOAD_SEARCH_RESULT : 0x2A
};
var ECTagNames = {
	EC_TAG_CLIENT_NAME : 0x0100,
	EC_TAG_CLIENT_VERSION : 0x0101,
	EC_TAG_PROTOCOL_VERSION : 0x0002,
	EC_TAG_PASSWD_HASH : 0x0001
};
var ProtocolVersion = {
	EC_CURRENT_PROTOCOL_VERSION : 0x0204
};
var EC_SEARCH_TYPE = {
	EC_SEARCH_LOCA : 0x00,
	EC_SEARCH_GLOBAL : 0x01,
	EC_SEARCH_KAD : 0x02,
	EC_SEARCH_WEB : 0x03
};
var EC_TAG_SEARCHFILE = {
	EC_TAG_SEARCH_TYPE : 0x0701,
	EC_TAG_SEARCH_NAME : 0x0702,
	EC_TAG_SEARCH_MIN_SIZE : 0x0703,
	EC_TAG_SEARCH_MAX_SIZE : 0x0704,
	EC_TAG_SEARCH_FILE_TYPE : 0x0705,
	EC_TAG_SEARCH_EXTENSION : 0x0706,
	EC_TAG_SEARCH_AVAILABILITY : 0x0707,
	EC_TAG_SEARCH_STATUS : 0x0708,
	EC_TAG_SEARCH_PARENT : 0x0709
};

/**
 * Used internally to build a request
 * 
 * @param ecTag
 * @param ecOp
 * @param value
 */

AMC.prototype._buildTagArrayBuffer = function(ecTag, ecOp, value, children) {
	this.recurcifInBuildTagArrayBuffer++;
	var tagLength = 0;
	var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
	dv.setUint16(0, ecTag, false);// name
	this.arrayBuffers.push(dv.buffer);
	tagLength += Uint16Array.BYTES_PER_ELEMENT;

	var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
	dv.setUint8(0, ecOp, false);// type
	this.arrayBuffers.push(dv.buffer);
	tagLength += Uint8Array.BYTES_PER_ELEMENT;

	var lengthDataView = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
	this.arrayBuffers.push(lengthDataView.buffer);
	// data length is going to be set after the children are created
	tagLength += Uint32Array.BYTES_PER_ELEMENT;

	let
	childrenTagsLength = 0;
	if ((ecTag & 0x01) != 0 && children == null) {// if tag has no child
		var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
		dv.setUint16(0, 0, false);
		this.arrayBuffers.push(dv.buffer);
		if (this.recurcifInBuildTagArrayBuffer < 2) {
			tagLength += Uint16Array.BYTES_PER_ELEMENT;
		}

	} else if (children != null) {// if tag has a child
		var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
		this.arrayBuffers.push(dv.buffer);
		tagLength += Uint16Array.BYTES_PER_ELEMENT;
		for (var m = 0; m < children.length; m++) {
			console.log("child " + children[m].ecTag + " " + children[m].ecOp + " " + children[m].value);
			childrenTagsLength += this._buildTagArrayBuffer(children[m].ecTag, children[m].ecOp, children[m].value, null);
			console.log("childrenTagsLength : " + childrenTagsLength);
		}
		dv.setUint16(0, children.length, false);
	}

	// set length after children are created
	if (ecOp == ECOpCodes.EC_TAGTYPE_UINT16) {// length
		lengthDataView.setUint32(0, 2 + childrenTagsLength, false);
	} else if (ecOp == ECOpCodes.EC_TAGTYPE_UINT8) {
		lengthDataView.setUint32(0, 1 + childrenTagsLength, false);
	} else if (ecOp == ECOpCodes.EC_TAGTYPE_HASH16) {
		lengthDataView.setUint32(0, value.length / 2 + childrenTagsLength, false);
	} else {
		lengthDataView.setUint32(0, eval(value.length + childrenTagsLength), false);
	}

	// set content
	if (ecOp == ECOpCodes.EC_OP_STRINGS) {
		for (var i = 0; i < value.length; i++) {
			var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
			dv.setUint8(0, value[i].charCodeAt(0));
			this.arrayBuffers.push(dv.buffer);
			tagLength += Uint8Array.BYTES_PER_ELEMENT;
		}
	} else if (ecOp == ECOpCodes.EC_TAGTYPE_UINT8) {
		var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
		dv.setUint8(0, value, false);
		this.arrayBuffers.push(dv.buffer);
		tagLength += Uint8Array.BYTES_PER_ELEMENT;
	} else if (ecOp == ECOpCodes.EC_TAGTYPE_HASH16) { // 16 bytes
		for (var i = 0; i < value.length; i = i + 2) {
			var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
			var hashValue = parseInt("0x" + value[i] + value[i + 1]);
			dv.setUint8(0, hashValue);
			// console.log("hash " + i / 2 + " : " + hashValue);
			this.arrayBuffers.push(dv.buffer);
			tagLength += Uint8Array.BYTES_PER_ELEMENT;
		}
	} else if (ecOp == ECOpCodes.EC_TAGTYPE_UINT16) {
		var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
		dv.setUint16(0, value, false);
		this.arrayBuffers.push(dv.buffer);
		tagLength += Uint16Array.BYTES_PER_ELEMENT;
	}
	this.recurcifInBuildTagArrayBuffer--;
	return tagLength;
}
/**
 * Build request headers
 */
AMC.prototype._setHeadersToRequest = function(opCode) {
	var dv = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
	dv.setUint32(0, 32, false);// set flags, normal == 32 (34 pour amule-gui)
	this.arrayBuffers.push(dv.buffer);
	// packet body length, will be set at the end
	this.arrayBuffers.push(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
	var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
	dv.setUint8(0, opCode, false);// op code
	this.arrayBuffers.push(dv.buffer);
	// tag count, will be set at the end
	this.arrayBuffers.push(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
}
/**
 * Build a ArrayBuffer from the array of DataView, set body length in bytes and tag count.
 * 
 * @returns {ArrayBuffer}
 */
AMC.prototype._finalizeRequest = function(tagCount) {
	// calculating the buffer length in bytes
	var bufferLength = 0;
	for (var i = 0; i < this.arrayBuffers.length; i++) {
		bufferLength = bufferLength + this.arrayBuffers[i].byteLength;
	}
	// creating ArrayBuffer with all the DataViews above
	var buffer = new ArrayBuffer(bufferLength);
	var offset = 0;
	for (var i = 0; i < this.arrayBuffers.length; i++) {
		for (var j = 0; j < this.arrayBuffers[i].byteLength; j++) {
			var fromArrayView = new Uint8Array(this.arrayBuffers[i], j, 1);
			var toArrayView = new Uint8Array(buffer, j + offset, 1);
			toArrayView.set(fromArrayView);
		}
		offset = offset + this.arrayBuffers[i].byteLength;
	}
	this.arrayBuffers = [];
	// set body length
	var bodyLengthDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT, Uint32Array.BYTES_PER_ELEMENT);
	bodyLengthDataView.setUint32(0, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2, false);
	// set tag count
	var tagNumberDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT * 2 + Uint8Array.BYTES_PER_ELEMENT, Uint16Array.BYTES_PER_ELEMENT);
	tagNumberDataView.setUint16(0, tagCount, false);
	return buffer;
}

/**
 * The first request trigger a 8 bytes number to be associate with the session (the salt number).
 * 
 * @returns {ArrayBuffer}
 */
AMC.prototype.getAuthRequest1 = function() {
	this._setHeadersToRequest(ECCodes.EC_OP_AUTH_REQ);
	var tagCount = 0;
	this._buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_NAME, ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
	tagCount++;
	this._buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_VERSION, ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
	tagCount++;
	this._buildTagArrayBuffer(4, ECOpCodes.EC_TAGTYPE_UINT16, ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
	tagCount++;
	return this._finalizeRequest(tagCount);
}

/**
 * When the solt number (aka session id) is given by the server, we can auth
 * 
 * @returns {ArrayBuffer}
 */
AMC.prototype.getAuthRequest2 = function() {
	this._setHeadersToRequest(80);
	var tagCount = 0;
	this._buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, md5(this.md5 + md5(this.solt)), null);
	tagCount++;
	return this._finalizeRequest(tagCount);
}

AMC.prototype.getSearchStartRequest = function(q) {
	this._setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_START);
	var tagCount = 0;
	var children = [];
	var searchTag = {
		"ecTag" : 3588,
		"ecOp" : ECOpCodes.EC_OP_STRINGS,
		"value" : q + "\0"
	}
	children.push(searchTag);
	var fileTypeTag = {
		"ecTag" : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_FILE_TYPE,
		"ecOp" : ECOpCodes.EC_OP_STRINGS,
		"value" : "\0"
	}
	children.push(fileTypeTag);
	var fileTypeTag = {
		"ecTag" : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_EXTENSION,
		"ecOp" : ECOpCodes.EC_OP_STRINGS,
		"value" : "mp4\0"
	}
	children.push(fileTypeTag);

	this._buildTagArrayBuffer(EC_TAG_SEARCHFILE.EC_TAG_SEARCH_TYPE, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, children);
	tagCount++;
	return this._finalizeRequest(tagCount);
}
AMC.prototype.getSearchResultRequest = function() {
	this._setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_RESULTS);
	var tagCount = 0;
	this._buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
	tagCount++;
	return this._finalizeRequest(tagCount);
}
/**
 * 
 */
AMC.prototype.debugRequest = function(buffer) {
	var offset = 0;
	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	console.log("request flags : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	console.log("request body length : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	console.log("request opcode : " + dataView.getUint8(0, false));
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	console.log("request tag count : " + dataView.getUint16(0, false));
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	console.log("DEBUG ec tag client name : " + dataView.getUint16(0, false));
	dataView.setUint16(0, 256, false)
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	console.log("DEBUG opcode string (doit etre 6) : " + dataView.getUint8(0, false));
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	console.log("DEBUG tag client length : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	// byte by byte
	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	console.log("DEBUG utf-8 char : " + dataView.getUint8(0));
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;
}

AMC.prototype.readSalt = function(buffer) {
	var offset = Uint32Array.BYTES_PER_ELEMENT * 2;

	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	this.responseOpcode = dataView.getUint8(0);
	console.log("response opcode : " + this.responseOpcode);
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;

	// var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	// console.log("response tag count : " + dataView.getUint16(0, false));
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	// var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	// console.log("response tag # name (ecTag) : " + dataView.getUint16(0, false));
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	// var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	// console.log("response tag # type (ecOp): " + dataView.getUint8(0, false));
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;

	// var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	// console.log("response tag # length : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	if (this.responseOpcode == 79) {
		var dv = new DataView(buffer, offset, 8);// 8 bytes
		for (var i = 0; i < 8; i++) {
			var c = dv.getUint8(i).toString(16).toUpperCase();
			if (c.length < 2 && i != 0) {
				c = '0' + c;
			}
			this.solt += c;
		}
		offset = offset + 8;
	}
	return this.responseOpcode;
}
AMC.prototype.debugResponseChild = function(buffer, offset) {
	console.log("");
	var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	console.log("response tag # name (ecTag) : " + dataView.getUint16(0, false));
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	var type = dataView.getUint8(0, false);
	console.log("response tag # type (ecOp): " + dataView.getUint8(0, false));
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	var length = dataView.getUint32(0, false);
	console.log("response tag # length : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	if (type == 3) {
		var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
		console.log("response tag # value 2 bytes: " + dataView.getUint16(0, false));
		offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	} else if (type == 2) {
		var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
		console.log("response tag # value 1 byte: " + dataView.getUint8(0, false));
		offset = offset + Uint8Array.BYTES_PER_ELEMENT;
	} else if (type == 6) {
		// string
		var text;
		for (var i = 0; i < length; i++) {
			var dataView = new DataView(buffer, offset + i, Uint8Array.BYTES_PER_ELEMENT);
			text += "" + dataView.getUint8(0).toString(16);
			offset += Uint8Array.BYTES_PER_ELEMENT;
		}
		console.log("response tag # value text : " + text);
	}

	return offset;
}
AMC.prototype.readResultsList = function(buffer) {

	var offset = 0;
	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	// console.log("response header : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
	console.log("response length : " + dataView.getUint32(0, false));
	offset = offset + Uint32Array.BYTES_PER_ELEMENT;

	var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
	this.responseOpcode = dataView.getUint8(0);
	offset = offset + Uint8Array.BYTES_PER_ELEMENT;
	if (this.responseOpcode != 40) {
		return null;
	}
	console.log("response opcode: " + this.responseOpcode);

	var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
	var tagCountInResponse = dataView.getUint16(0, false);
	console.log("response tag count : " + tagCountInResponse);
	offset = offset + Uint16Array.BYTES_PER_ELEMENT;

	for (var j = 0; j < tagCountInResponse; j++) {
		offset = this.debugResponseChild(buffer, offset);
	}

	// TODO return something

}
