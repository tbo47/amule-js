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

  const _init = (password, md5) => {
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
  const ECCodes = {
    EC_CURRENT_PROTOCOL_VERSION : 0x0204,
    EC_OP_AUTH_REQ : 0x02,
    EC_OP_GET_SHARED_FILES : 0x10
  };
  const ECOpCodes = {
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
  const ECTagNames = {
    EC_TAG_CLIENT_NAME : 0x0100,
    EC_TAG_CLIENT_VERSION : 0x0101,
    EC_TAG_PROTOCOL_VERSION : 0x0002,
    EC_TAG_PASSWD_HASH : 0x0001
  };
  const ProtocolVersion = {
    EC_CURRENT_PROTOCOL_VERSION : 0x0204
  };
  const EC_SEARCH_TYPE = {
    EC_SEARCH_LOCA : 0x00,
    EC_SEARCH_GLOBAL : 0x01,
    EC_SEARCH_KAD : 0x02,
    EC_SEARCH_WEB : 0x03
  };
  const EC_TAG_SEARCHFILE = {
    EC_TAG_SEARCH_TYPE : 0x0701, //1793/2?
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
  const _buildTagArrayBuffer = (ecTag, ecOp, value, children) => {
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
      for (let i = 0; i < value.length; i = i + 2) {
        const dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        const hashValue = parseInt(value[i] + value[i + 1], 16);
        dv.setUint8(0, hashValue, false);
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
  const _setHeadersToRequest = opCode => {
    let dv = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    // set flags, normal === 32 (34 pour amule-gui)
    dv.setUint32(0, 32, false);
    $.data.arrayBuffers.push(dv.buffer);
    // packet body length, will be set at the end
    $.data.arrayBuffers.push(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
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
  const _finalizeRequest = tagCount => {
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
  const getAuthRequest1 = function() {
    _setHeadersToRequest(2);//EC_OP_AUTH_REQ
    let tagCount = 0;
    _buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_NAME*2, ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
    tagCount++;
    _buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_VERSION*2, ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
    tagCount++;
    _buildTagArrayBuffer(4, ECOpCodes.EC_TAGTYPE_UINT16, ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
    tagCount++;
    return _finalizeRequest(tagCount);
  };

  /**
   * When the solt number (aka session id) is given by the server, we can auth
   *
   * @returns {ArrayBuffer}
   */
  const _getAuthRequest2 = () => {
    _setHeadersToRequest(80);
    let tagCount = 0;
    let passwd = $.md5($.data.md5 + $.md5($.data.solt));
    _buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, passwd, null);
    tagCount++;
    return _finalizeRequest(tagCount);
  };

  /**
   *  < EC_OP_SEARCH_START opCode:38 size:38 (compressed: 30)
   *      EC_TAG_SEARCH_TYPE tagName:1793 dataType:2 dataLen:1 = EC_SEARCH_LOCAL
   *        EC_TAG_SEARCH_NAME tagName:1794 dataType:6 dataLen:10 = keywords 2017
   *        EC_TAG_SEARCH_FILE_TYPE tagName:1797 dataType:6 dataLen:1 =
   *  > EC_OP_STRINGS opCode:6 size:59 (compressed: 54)
   *      EC_TAG_STRING tagName:0 dataType:6 dataLen:49 = Search in progress. Refetch results in a moment!
   */
  const _getSearchStartRequest = q => {
    _setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_START); //38
    let tagCount = 0;
    const children = [{
        ecTag : 1794*2,
        ecOp : ECOpCodes.EC_OP_STRINGS, // 6
        value : q + "\0"
      }, {
        ecTag : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_FILE_TYPE, // 1797*2
        ecOp : ECOpCodes.EC_OP_STRINGS,
        value : "\0"
      }, {
        ecTag : EC_TAG_SEARCHFILE.EC_TAG_SEARCH_EXTENSION,
        ecOp : ECOpCodes.EC_OP_STRINGS,
        value : "mp4\0"
      }];

    _buildTagArrayBuffer(EC_TAG_SEARCHFILE.EC_TAG_SEARCH_TYPE, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, children);
    tagCount++;
    return _finalizeRequest(tagCount);
  };

  /**
   *
   */
  const getSharedFilesRequest = () => {
    _setHeadersToRequest(ECCodes.EC_OP_GET_SHARED_FILES);
    return _finalizeRequest(0);
  };

  /**
   *
   */
   const getSearchResultRequest = () => {
     _setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_RESULTS);
     let tagCount = 0;
     _buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
     tagCount++;
     return _finalizeRequest(tagCount);
   };

  const getDownloadsRequest = () => {
    _setHeadersToRequest(13); // EC_OP_GET_DLOAD_QUEUE
    return _finalizeRequest(0);
  };

  /**
   *  < EC_OP_DOWNLOAD_SEARCH_RESULT opCode:42 size:36 (compressed: 28)
   *      EC_TAG_PARTFILE tagName:768 dataType:9 dataLen:16 = 26E4413971DF1EC89AC3B91A4A02402F
   *        EC_TAG_PARTFILE_CAT tagName:783 dataType:2 dataLen:1 = 0
   *  > EC_OP_STRINGS opCode:6 size:3 (compressed: 2)
   */
  const downloadRequest = (e) => {
    _setHeadersToRequest(ECOpCodes.EC_OP_DOWNLOAD_SEARCH_RESULT);//42
    let tagCount = 0;
    const children = [{
        ecTag : 783*2,
        ecOp : ECOpCodes.EC_TAGTYPE_UINT8, //2
        value : 0
      }];

    // if has children => +1
    _buildTagArrayBuffer(768*2+1, ECOpCodes.EC_TAGTYPE_HASH16, e.hash, children);
    tagCount++;
    return _finalizeRequest(tagCount);
  };

  /**
   *
   */
  const clearCompletedRequest = () => {
    _setHeadersToRequest(0x53); // EC_OP_CLEAR_COMPLETED
    return _finalizeRequest(0);
  };

  /**
   *
   */
  const getStatsRequest = () => {
    _setHeadersToRequest(10); // EC_OP_STAT_REQ
    var tagCount = 0;
    var EC_TAG_DETAIL_LEVEL = 4;
    var EC_DETAIL_INC_UPDATE = 4;
    _buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL, ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_INC_UPDATE, null);
    tagCount++;
    return _finalizeRequest(tagCount);
  };

  function ab2str(ab) {
    var dataView = new DataView(ab);
    var decoder = new TextDecoder('utf-8');
    return decoder.decode(dataView);
  }

  function str2ab(str) {
      var encoder = new TextEncoder('utf-8');
      return encoder.encode(str).buffer;
  }

  /**
   *
   */
  const readSalt = (buffer) => {
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
      const dv = new DataView(buffer, offset, 8);// 8 bytes
      for (let i = 0; i < 8; i++) {
        let c = dv.getUint8(i).toString(16).toUpperCase();
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
  const readBuffer = (buffer, byteNumberToRead, littleEndian = false) => {
    let val = null;
    try {
      const dataView = new DataView(buffer, offset, byteNumberToRead);
      if(byteNumberToRead === 1) {
        val = dataView.getUint8(0);
      } else if(byteNumberToRead === 2) {
        val = dataView.getUint16(0, littleEndian);
      } else if(byteNumberToRead === 4) {
        val = dataView.getUint32(0, littleEndian);
      }
    } catch (err) {
      console.error(err);
    }
    offset += byteNumberToRead;
    return val;
  };

  const readBufferChildren = (buffer, res) => {
    res.children = [];
    for (let j = 0; j < res.tagCountInResponse; j++) {
      const child = {};
      child.nameEcTag = readBuffer(buffer, 2);
      child.typeEcOp = readBuffer(buffer, 1);
      // length without ectag, ecOp, length and tag count
      child.length = readBuffer(buffer, 4);
      // console.log('(child.length + offset): ' + (child.length + offset) + ' bytes, totalSizeOfRequest' + totalSizeOfRequest);
      if(child.length + offset > res.totalSizeOfRequest) {
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
          child2.value = '';
          if (child2.typeEcOp === ECOpCodes.EC_TAGTYPE_UINT8) { // 2
            child2.value = readBuffer(buffer, child2.length);
          }
          else if (child2.typeEcOp === 4) { // integer
            for (var m = 0; m < child2.length; m++) {
              child2.value += "" + readBuffer(buffer, 1);
            }
          }
          else if (child2.typeEcOp === ECOpCodes.EC_OP_STRINGS) { // 6
            for (var m = 0; m < child2.length; m++) {
              child2.value += "" + String.fromCharCode(readBuffer(buffer, 1));
            }
          }
          else if (child2.typeEcOp === ECOpCodes.EC_TAGTYPE_HASH16) { //9
            for (var m = 0; m < child2.length; m = m + 2) {
              let c = readBuffer(buffer, 2).toString(16);
              c = ('0000'+c).slice(-4);
              child2.value += c;
            }
            if(child2.value.length != 32) {
              console.log('HASH is false: ' + child2.value + ' -- '+  + child2.value.length);
            }
          }
          else {
            // console.log('WARNING: not read : child2.typeEcOp = ' + child2.typeEcOp);
            // TODO 
            // wrong but we do it to read the buffer
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

  const readResultsList = buffer => {
    return new Promise((resolve, reject) => {
      let res = {};
      offset = 0;
      res.header = readBuffer(buffer, 4);
      // length (total minus header and response Length)
      let responseLength = readBuffer(buffer, 4);
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

      readBufferChildren(buffer, res);
      res.children.forEach(e => {
        if(e.children) {
          e.children.forEach(m => {
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
        }
      });
      resolve(res);
    });
  };

  const initConnToServer = (ip, port) => {
    return new Promise((resolve, reject) => {
      chrome.sockets.tcp.create({}, createInfo => {
        socketId = createInfo.socketId;
        chrome.sockets.tcp.connect(createInfo.socketId, ip, port, code => resolve(code));
      });
    });
  };

  const sendToServer_simple = data => {
    return new Promise((resolve, reject) => {
      chrome.sockets.tcp.send(socketId, data, sendInfo => {});
      chrome.sockets.tcp.onReceive.addListener(receiveInfo => resolve(receiveInfo.data));
    });
  };

  const sendToServer = data => {
    return new Promise((resolve, reject) => {
      let buf = [];
      chrome.sockets.tcp.send(socketId, data, info => {});
      chrome.sockets.tcp.onReceive.addListener(info => {
        buf.push(info.data);
      });
      setTimeout(() => {
        let bl = 0;
        buf.forEach(b => {
          bl += b.byteLength;
        });
        const buffer = new ArrayBuffer(bl);
        let o = 0;
        buf.forEach(b => {
          for (var j = 0; j < b.byteLength; j++) {
            let fromArrayView = new Uint8Array(b, j, 1);
            let toArrayView = new Uint8Array(buffer, j + o, 1);
            toArrayView.set(fromArrayView);
          }
          o = o + b.byteLength;
        });
        resolve(buffer);
      }, 3000);
    });
  };

  const connect = (ip, port, password, md5) => {
    return initConnToServer(ip, parseInt(port)).then(() => {
      _init(password, md5);
      return sendToServer_simple(getAuthRequest1());
    }).then(data => {
      readSalt(data);
      return sendToServer_simple(_getAuthRequest2());
    }).then(data => {
      if (readSalt(data) === 4) {
        return('You are successfuly connected to amule');
      }
      else {
        throw('You are NOT connected to amule');
      }
    })
    .catch(err => {
      throw('You are NOT connected to amule: ' + err);
    });
  };

  /**
   * send a search request
   */
  const search = q => sendToServer(_getSearchStartRequest(q));

  const fetchSearch = () => sendToServer(getSearchResultRequest())
    .then(data => readResultsList(data));

  const getDownloads = () => {
    return sendToServer(getDownloadsRequest()).then(data => {
      return readResultsList(data);
    });
  };

  const download = e => {
    return sendToServer_simple(downloadRequest(e)).then(data => {
      return readResultsList(data);
    });
  };

  const getSharedFiles = () => {
    return sendToServer(getSharedFilesRequest()).then(data => {
      return readResultsList(data);
    });
  };

  const clearCompleted = () => {
    return sendToServer(clearCompletedRequest()).then(data => {
      return readResultsList(data);
    });
  };

  const getStats = () => {
    return sendToServer(getStatsRequest()).then(data => {
      return readResultsList(data);
    });
  };

  $.connect = connect;
  $.search = search;
  $.fetchSearch = fetchSearch;
  $.getDownloads = getDownloads;
  $.download = download;
  $.getSharedFiles = getSharedFiles;
  $.clearCompleted = clearCompleted;
  $.getStats = getStats;

}(typeof exports === 'object' && exports || this));
