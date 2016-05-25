/*
 * https://github.com/tla-dev/amule-js
 */
(function(exports) {
  'use strict';

  var $ = exports.aMule = {};
  $.data = {
      isConnected: false
  };
  var offset = 0;
  var socketId;

  var init = function(password, md5) {
    $.md5 = md5;
    // must be the same as ECPassword in .aMule/amule.conf
    $.data.md5 = $.md5(password);
    $.data.arrayBuffers = [];// used to build requests
    $.data.solt = '';// solt number (sessions id)
    $.data.responseOpcode = '';// op code given in the server
    $.data.recurcifInBuildTagArrayBuffer = 0;
    return $;
  };

  /**
   * from amule ECCodes.h code
   */
  var ECCodes = {
    EC_CURRENT_PROTOCOL_VERSION : 0x0204,
    EC_OP_AUTH_REQ : 0x02,
    EC_OP_GET_SHARED_FILES : 0x10
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
   */
  var _buildTagArrayBuffer = function(ecTag, ecOp, value, children) {
    $.data.recurcifInBuildTagArrayBuffer++;
    var tagLength = 0;
    var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
    dv.setUint16(0, ecTag, false);// name
    $.data.arrayBuffers.push(dv.buffer);
    tagLength += Uint16Array.BYTES_PER_ELEMENT;

    dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
    dv.setUint8(0, ecOp, false);// type
    $.data.arrayBuffers.push(dv.buffer);
    tagLength += Uint8Array.BYTES_PER_ELEMENT;

    var lengthDataView = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    $.data.arrayBuffers.push(lengthDataView.buffer);
    // data length is going to be set after the children are created
    tagLength += Uint32Array.BYTES_PER_ELEMENT;

    var childrenTagsLength = 0;
    if ((ecTag & 0x01) !== 0 && children === null) {
      // if tag has no child
      dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
      dv.setUint16(0, 0, false);
      $.data.arrayBuffers.push(dv.buffer);
      if ($.data.recurcifInBuildTagArrayBuffer < 2) {
        tagLength += Uint16Array.BYTES_PER_ELEMENT;
      }
    }
    else if (children) {// if tag has a child
      dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
      $.data.arrayBuffers.push(dv.buffer);
      tagLength += Uint16Array.BYTES_PER_ELEMENT;
      for (var m = 0; m < children.length; m++) {
        // console.log("child " + children[m].ecTag + " " + children[m].ecOp + " " + children[m].value);
        childrenTagsLength += _buildTagArrayBuffer(children[m].ecTag, children[m].ecOp, children[m].value, null);
        // console.log("childrenTagsLength : " + childrenTagsLength);
      }
      dv.setUint16(0, children.length, false);
    }

    // set length after children are created
    if (ecOp === ECOpCodes.EC_TAGTYPE_UINT16) {// length
      lengthDataView.setUint32(0, 2 + childrenTagsLength, false);
    }
    else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT8) {
      lengthDataView.setUint32(0, 1 + childrenTagsLength, false);
    }
    else if (ecOp === ECOpCodes.EC_TAGTYPE_HASH16) {
      lengthDataView.setUint32(0, value.length / 2 + childrenTagsLength, false);
    }
    else {
      lengthDataView.setUint32(0, parseInt(value.length + childrenTagsLength), false);
    }

    // set content
    if (ecOp === ECOpCodes.EC_OP_STRINGS) {
      for (var i = 0; i < value.length; i++) {
        var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dv.setUint8(0, value[i].charCodeAt(0));
        $.data.arrayBuffers.push(dv.buffer);
        tagLength += Uint8Array.BYTES_PER_ELEMENT;
      }
    }
    else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT8) {
      var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
      dv.setUint8(0, value, false);
      $.data.arrayBuffers.push(dv.buffer);
      tagLength += Uint8Array.BYTES_PER_ELEMENT;
    }
    else if (ecOp === ECOpCodes.EC_TAGTYPE_HASH16) {
      for (var i = 0; i < value.length; i = i + 2) {
        var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        var hashValue = parseInt("0x" + value[i] + value[i + 1]);
        dv.setUint8(0, hashValue);
        // console.log("hash " + i / 2 + " : " + hashValue);
        $.data.arrayBuffers.push(dv.buffer);
        tagLength += Uint8Array.BYTES_PER_ELEMENT;
      }
    }
    else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT16) {
      var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
      dv.setUint16(0, value, false);
      $.data.arrayBuffers.push(dv.buffer);
      tagLength += Uint16Array.BYTES_PER_ELEMENT;
    }
    $.data.recurcifInBuildTagArrayBuffer--;
    return tagLength;
  };

  /**
   * Build request headers
   */
  var _setHeadersToRequest = function(opCode) {
    var dv = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    // set flags, normal === 32 (34 pour amule-gui)
    dv.setUint32(0, 32, false);
    $.data.arrayBuffers.push(dv.buffer);
    // packet body length, will be set at the end
    $.data.arrayBuffers.push(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
    dv.setUint8(0, opCode, false);// op code
    $.data.arrayBuffers.push(dv.buffer);
    // tag count, will be set at the end
    $.data.arrayBuffers.push(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
  };

  /**
   * Build a ArrayBuffer from the array of DataView, set body length in bytes
   * and tag count.
   *
   * @returns {ArrayBuffer}
   */
  $._finalizeRequest = function(tagCount) {
    // calculating the buffer length in bytes
    var bufferLength = 0;
    for (var i = 0; i < $.data.arrayBuffers.length; i++) {
      bufferLength = bufferLength + $.data.arrayBuffers[i].byteLength;
    }
    // creating ArrayBuffer with all the DataViews above
    var buffer = new ArrayBuffer(bufferLength);
    var offset = 0;
    for (var i = 0; i < $.data.arrayBuffers.length; i++) {
      for (var j = 0; j < $.data.arrayBuffers[i].byteLength; j++) {
        var fromArrayView = new Uint8Array($.data.arrayBuffers[i], j, 1);
        var toArrayView = new Uint8Array(buffer, j + offset, 1);
        toArrayView.set(fromArrayView);
      }
      offset = offset + $.data.arrayBuffers[i].byteLength;
    }
    $.data.arrayBuffers = [];
    // set body length
    var bodyLengthDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT, Uint32Array.BYTES_PER_ELEMENT);
    bodyLengthDataView.setUint32(0, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2, false);
    // console.log('> body length: '+ (buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2));
    // set tag count
    var tagNumberDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT * 2 + Uint8Array.BYTES_PER_ELEMENT, Uint16Array.BYTES_PER_ELEMENT);
    tagNumberDataView.setUint16(0, tagCount, false);
    return buffer;
  };

  /**
   * The first request trigger a 8 bytes number to be associate with the
   * session (the salt number).
   *
   * @returns {ArrayBuffer}
   */
  var getAuthRequest1 = function() {
    _setHeadersToRequest(2);//EC_OP_AUTH_REQ
    var tagCount = 0;
    _buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_NAME*2, ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
    tagCount++;
    _buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_VERSION*2, ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
    tagCount++;
    _buildTagArrayBuffer(4, ECOpCodes.EC_TAGTYPE_UINT16, ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   * When the solt number (aka session id) is given by the server, we can auth
   *
   * @returns {ArrayBuffer}
   */
  $.getAuthRequest2 = function() {
    _setHeadersToRequest(80);
    var tagCount = 0;
    _buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, $.md5($.data.md5 + $.md5($.data.solt)), null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   *
   */
  $.getSearchStartRequest = function(q) {
    _setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_START);
    var tagCount = 0;
    var children = [];
    var searchTag = {
      "ecTag" : 3588,
      "ecOp" : ECOpCodes.EC_OP_STRINGS,
      "value" : q + "\0"
    };
    children.push(searchTag);
    var fileTypeTag = {
      "ecTag" : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_FILE_TYPE,
      "ecOp" : ECOpCodes.EC_OP_STRINGS,
      "value" : "\0"
    };
    children.push(fileTypeTag);
    var fileTypeTag = {
      "ecTag" : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_EXTENSION,
      "ecOp" : ECOpCodes.EC_OP_STRINGS,
      "value" : "mp4\0"
    };
    children.push(fileTypeTag);

    _buildTagArrayBuffer(EC_TAG_SEARCHFILE.EC_TAG_SEARCH_TYPE, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, children);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   *
   */
  var getSharedFilesRequest = function() {
    _setHeadersToRequest(ECCodes.EC_OP_GET_SHARED_FILES);
    var tagCount = 0;
    // _buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
    // tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   *
   */
   var getSearchResultRequest = function() {
     _setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_RESULTS);
     var tagCount = 0;
     _buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
     tagCount++;
     return $._finalizeRequest(tagCount);
   };

  /**
   *
   */
  var getDownloadsRequest = function() {
    _setHeadersToRequest(13); // EC_OP_GET_DLOAD_QUEUE
    return $._finalizeRequest(0);
  };

  /**
   *
   */
  var clearCompletedRequest = function() {
    _setHeadersToRequest(0x53); // EC_OP_CLEAR_COMPLETED
    return $._finalizeRequest(0);
  };

  /**
   *
   */
  var getStatsRequest = function() {
    _setHeadersToRequest(10); // EC_OP_STAT_REQ
    var tagCount = 0;
    var EC_TAG_DETAIL_LEVEL = 4;
    var EC_DETAIL_INC_UPDATE = 4;
    _buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL, ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_INC_UPDATE, null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   *
   */
  var readSalt = function(buffer) {
    var offset = Uint32Array.BYTES_PER_ELEMENT * 2;

    var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
    $.data.responseOpcode = dataView.getUint8(0);
    // console.log("response opcode : " + $.data.responseOpcode);
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;
    // console.log("response tag count : " + dataView.getUint16(0, false));
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;
    // console.log("response tag # name (ecTag) : " + dataView.getUint16(0, false));
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;
    // console.log("response tag # type (ecOp): " + dataView.getUint8(0, false));
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;
    // console.log("response tag # length : " + dataView.getUint32(0, false));
    offset = offset + Uint32Array.BYTES_PER_ELEMENT;

    if ($.data.responseOpcode === 79) {
      var dv = new DataView(buffer, offset, 8);// 8 bytes
      for (var i = 0; i < 8; i++) {
        var c = dv.getUint8(i).toString(16).toUpperCase();
        if (c.length < 2 && i !== 0) {
          c = '0' + c;
        }
        $.data.solt += c;
      }
      offset = offset + 8;
    }
    return $.data.responseOpcode;
  };

  /**
   *
   */
  var readBuffer = function(buffer, byteNumberToRead, littleEndian = false) {
    var val = null;
    try {
      var dataView = new DataView(buffer, offset, byteNumberToRead);
      if(byteNumberToRead===1) {
        val = dataView.getUint8(0);
      } else if(byteNumberToRead===2) {
        val = dataView.getUint16(0, littleEndian);
      } else if(byteNumberToRead===4) {
        val = dataView.getUint32(0, littleEndian);
      }
      offset += byteNumberToRead;
    }
    catch(err) {
      console.log(err);
    }
    return val;
  };

  /**
   *
   */
  var readBufferChildren = function(buffer, res, totalSizeOfRequest) {
    res.children = [];
    for (var j = 0; j < res.tagCountInResponse; j++) {
      var child = {};
      child.nameEcTag = readBuffer(buffer, 2);
      child.typeEcOp = readBuffer(buffer, 1);
      // length without ectag, ecOp, length and tag count
      child.length = readBuffer(buffer, 4);
      // console.log('(child.length + offset): ' + (child.length + offset) + ' bytes, totalSizeOfRequest' + totalSizeOfRequest);
      if(child.length + offset > totalSizeOfRequest) {
        console.log('ERROR: should not happen');
        return res;
      }
      res.children.push(child);
      // if name (ecTag) is odd there is a child count
      if(child.nameEcTag % 2) {
        child.nameEcTag = (child.nameEcTag - 1)/2;
        child.tagCountInResponse = readBuffer(buffer, 2);
        child.children = [];
        child.childrenLength = 0;
        for (var i = 0; i < child.tagCountInResponse; i++) {
          var child2 = {};
          child2.nameEcTag = readBuffer(buffer, 2)/2; // TODO if odd?
          child2.typeEcOp = readBuffer(buffer, 1);
          child2.length = readBuffer(buffer, 4);
          child.childrenLength += ( 7 + child2.length );
          if (child2.typeEcOp === 2) { // binary
            child2.value = readBuffer(buffer, child2.length);
          }
          else if (child2.typeEcOp === 4) { // integer
            child2.value = '';
            for (var m = 0; m < child2.length; m++) {
              child2.value += "" + readBuffer(buffer, 1);
            }
          }
          else if (child2.typeEcOp === 6) { // text
            child2.value = '';
            for (var m = 0; m < child2.length; m++) {
              child2.value += "" + String.fromCharCode(readBuffer(buffer, 1));
            }
          }
          else {
            // console.log('WARNING: not read : child2.typeEcOp = ' + child2.typeEcOp);
            // TODO 
            // wrong but we do it to read the buffer
            child2.value = '';
            for (var m = 0; m < child2.length; m++) {
              child2.value += "" + readBuffer(buffer, 1);
            }
          }
          child.children.push(child2);
        }
        child.value = readBuffer(buffer, child.length - child.childrenLength);
      } else {
        child.nameEcTag = child.nameEcTag / 2;
        // TODO
      }
    }
    return res;
  };

  /**
   *
   */
  var readResultsList = function(buffer) {
    return new Promise(function(resolve, reject) {
      var res = {};
      offset = 0;
      res.header = readBuffer(buffer, 4);
      // length (total minus header and response Length)
      var responseLength = readBuffer(buffer, 4);
      // response length (total minus header, response length, opcode, tag count)
      // res.responseLength = responseLength - 3;
      res.totalSizeOfRequest = responseLength + 6;// the 6 is deduce
      res.opCode = readBuffer(buffer, 1);
      res.tagCountInResponse = readBuffer(buffer, 2);
      if(res.opCode === 1) {
        res.opCodeLabel = 'EC_OP_NOOP';
      } else if (res.opCode === 5) {
        res.opCodeLabel = 'EC_OP_FAILED';
      } else if (res.opCode === 31) {
        res.opCodeLabel = 'EC_OP_DLOAD_QUEUE';
      } else if (res.opCode === 40) {
        res.opCodeLabel = 'EC_OP_SEARCH_RESULTS';
      }
      console.log(res);

      readBufferChildren(buffer, res, res.totalSizeOfRequest);
      res.children.forEach(function(e) {
        e.children.forEach(function(m) {
          if(m.nameEcTag === 769) { // EC_TAG_PARTFILE_NAME
            e.value = m.value;
          }
          if(m.nameEcTag === 798) { // EC_TAG_PARTFILE_HASH
            e.hash = m.value;
          }
          if(m.nameEcTag === 771) { // EC_TAG_PARTFILE_SIZE_FULL
            e.size = m.value;
          }
          if(m.nameEcTag === 782) { // EC_TAG_PARTFILE_ED2K_LINK
            e.edkLink = m.value;
          }
        });
      });
      console.log(res);
      resolve(res);
    });
  };

  /**
   * init TCP connection with amule
   *
   * @returns {Promise}
   */
  var initConnToServer = function(ip, port) {
    return new Promise(function(resolve, reject) {
      chrome.sockets.tcp.create({}, function(createInfo) {
        socketId = createInfo.socketId;
        chrome.sockets.tcp.connect(createInfo.socketId, ip, port, function(resultCode) {
          resolve();
        });
      });
    });
  };

  /**
   * sent TCP request to amule
   *
   * @param data
   * @returns {Promise}
   */
  var sendToServer_simple = function (data) {
    return new Promise(function(resolve, reject) {
      chrome.sockets.tcp.send(socketId, data, function(sendInfo) {});
      chrome.sockets.tcp.onReceive.addListener(function(receiveInfo) {
        resolve(receiveInfo.data);
      });
    });
  };

  /**
   *
   */
  var sendToServer = function (data) {
    return new Promise(function(resolve, reject) {
      var buf = [];
      chrome.sockets.tcp.send(socketId, data, function(sendInfo) {});
      chrome.sockets.tcp.onReceive.addListener(function(info) {
        buf.push(info.data);
      });
      setTimeout(function() {
        var bl = 0;
        buf.forEach(function(b){
          bl += b.byteLength;
        });
        var buffer = new ArrayBuffer(bl);
        var o = 0;
        buf.forEach(function(b){
          for (var j = 0; j < b.byteLength; j++) {
            var fromArrayView = new Uint8Array(b, j, 1);
            var toArrayView = new Uint8Array(buffer, j + o, 1);
            toArrayView.set(fromArrayView);
          }
          o = o +b.byteLength;
        });
        resolve(buffer);
      }, 3000);
    });
  };

  /**
   *
   */
  var connect = function(ip, port, password, md5) {
    return new Promise(function(resolve, reject) {
      initConnToServer(ip, port).then(function() {
        init(password, md5);
        return sendToServer_simple(getAuthRequest1());
      })
      .then(function(data) {
        readSalt(data);
        return sendToServer_simple($.getAuthRequest2());
      })
      .then(function(data) {
        if (readSalt(data) === 4) {
          resolve('You are successfuly connected to amule');
        }
        else {
          reject('You are NOT connected to amule');
        }
      })
      .catch(function (err) {
        console.log("error: ", err);
        reject('You are NOT connected to amule: ' + err);
      });
    });
  };

  /**
   * send a search request
   */
  var search = function(q) {
    return sendToServer($.getSearchStartRequest(q));
  };

  var fetchSearch = function() {
    return sendToServer(getSearchResultRequest()).then(function (data) {
     return readResultsList(data);
    });
  };

  var getDownloads = function() {
    return sendToServer(getDownloadsRequest()).then(function (data) {
      return readResultsList(data);
    });
  };

  var getSharedFiles = function() {
    return sendToServer(getSharedFilesRequest()).then(function (data) {
      return readResultsList(data);
    });
  };

  var clearCompleted = function() {
    return sendToServer_simple(clearCompletedRequest()).then(function (data) {
      return readResultsList(data);
    });
  };

  var getStats = function() {
    return sendToServer_simple(getStatsRequest()).then(function (data) {
      return readResultsList(data);
    });
  };

  $.connect = connect;
  $.search = search;
  $.fetchSearch = fetchSearch;
  $.getDownloads = getDownloads;
  $.getSharedFiles = getSharedFiles;
  $.clearCompleted = clearCompleted;
  $.getStats = getStats;

}(typeof exports === 'object' && exports || this));
