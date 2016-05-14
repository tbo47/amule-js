/*
 * amule-js
 * https://github.com/tla-dev/amule-js
 *
 * Copyright (c) 2016 tla-dev
 * Licensed under the MIT license.
 */

(function(exports) {
  'use strict';

  var $ = exports.aMule = {};
  $.data = {};
  var offset = 0;
  
  function l(m) {
    console.log(m);
  }

  $.init = function(password, md5) {
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
   */
  $._buildTagArrayBuffer = function(ecTag, ecOp, value, children) {
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
        l("child " + children[m].ecTag + " " + children[m].ecOp + " " + children[m].value);
        childrenTagsLength += $._buildTagArrayBuffer(children[m].ecTag, children[m].ecOp, children[m].value, null);
        l("childrenTagsLength : " + childrenTagsLength);
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
      lengthDataView.setUint32(0, eval(value.length + childrenTagsLength), false);
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
        // l("hash " + i / 2 + " : " + hashValue);
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
  $._setHeadersToRequest = function(opCode) {
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
    l('> body length: '+ (buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2));
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
  $.getAuthRequest1 = function() {
    $._setHeadersToRequest(ECCodes.EC_OP_AUTH_REQ);
    var tagCount = 0;
    $._buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_NAME, ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
    tagCount++;
    $._buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_VERSION, ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
    tagCount++;
    $._buildTagArrayBuffer(4, ECOpCodes.EC_TAGTYPE_UINT16, ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   * When the solt number (aka session id) is given by the server, we can auth
   * 
   * @returns {ArrayBuffer}
   */
  $.getAuthRequest2 = function() {
    $._setHeadersToRequest(80);
    var tagCount = 0;
    $._buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, $.md5($.data.md5 + $.md5($.data.solt)), null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };

  /**
   * 
   */
  $.getSearchStartRequest = function(q) {
    $._setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_START);
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

    $._buildTagArrayBuffer(EC_TAG_SEARCHFILE.EC_TAG_SEARCH_TYPE, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, children);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };
  
  /**
   * 
   */
  $.getSearchResultRequest = function() {
    $._setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_RESULTS);
    var tagCount = 0;
    $._buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
    tagCount++;
    return $._finalizeRequest(tagCount);
  };
  
  /**
   * 
   */
  $.debugRequest = function(buffer) {
    var offset = 0;
    var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
    l("request flags : " + dataView.getUint32(0, false));
    offset = offset + Uint32Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
    l("request body length : " + dataView.getUint32(0, false));
    offset = offset + Uint32Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
    l("request opcode : " + dataView.getUint8(0, false));
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
    l("request tag count : " + dataView.getUint16(0, false));
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint16Array.BYTES_PER_ELEMENT);
    l("DEBUG ec tag client name : " + dataView.getUint16(0, false));
    dataView.setUint16(0, 256, false)
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
    l("DEBUG opcode string (doit etre 6) : " + dataView.getUint8(0, false));
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;

    var dataView = new DataView(buffer, offset, Uint32Array.BYTES_PER_ELEMENT);
    l("DEBUG tag client length : " + dataView.getUint32(0, false));
    offset = offset + Uint32Array.BYTES_PER_ELEMENT;

    // byte by byte
    var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
    l("DEBUG utf-8 char : " + dataView.getUint8(0));
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;
  };

  /**
   * 
   */
  $.readSalt = function(buffer) {
    var offset = Uint32Array.BYTES_PER_ELEMENT * 2;

    var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
    $.data.responseOpcode = dataView.getUint8(0);
    l("response opcode : " + $.data.responseOpcode);
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;

    // var dataView = new DataView(buffer, offset,
    // Uint16Array.BYTES_PER_ELEMENT);
    // l("response tag count : " + dataView.getUint16(0, false));
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;

    // var dataView = new DataView(buffer, offset,
    // Uint16Array.BYTES_PER_ELEMENT);
    // l("response tag # name (ecTag) : " + dataView.getUint16(0,
    // false));
    offset = offset + Uint16Array.BYTES_PER_ELEMENT;

    // var dataView = new DataView(buffer, offset,
    // Uint8Array.BYTES_PER_ELEMENT);
    // l("response tag # type (ecOp): " + dataView.getUint8(0,
    // false));
    offset = offset + Uint8Array.BYTES_PER_ELEMENT;

    // var dataView = new DataView(buffer, offset,
    // Uint32Array.BYTES_PER_ELEMENT);
    // l("response tag # length : " + dataView.getUint32(0,
    // false));
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

  function readBuffer(buffer, byteNumberToRead, littleEndian = false) {
    var dataView = new DataView(buffer, offset, byteNumberToRead);
    var val = null;
    if(byteNumberToRead===1) {
      val = dataView.getUint8(0);
    } else if(byteNumberToRead===2) {
      val = dataView.getUint16(0, littleEndian);
    } else if(byteNumberToRead===4) {
      val = dataView.getUint32(0, littleEndian);
    }
    offset += byteNumberToRead;
    return val;
  }

  /**
   * 
   */
  $.readBufferChildren = function(buffer, resChild) {
    resChild.children=[];
    for (var j = 0; j < resChild.tagCountInResponse; j++) {
      var child = {};
      child.nameEcTag = readBuffer(buffer, 2);
      child.typeEcOp = readBuffer(buffer, 1);
      // length without ectag, ecOp, length and tag count
      child.length = readBuffer(buffer, 4);
      resChild.children.push(child);
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
              child2.value = '';
              for (var m = 0; m < child2.length; m++) {
                child2.value += "" + String.fromCharCode(readBuffer(buffer, 1));
              }
            }
          }
          else {
            console.log('WARNING: not read : child2.typeEcOp = ' + child2.typeEcOp);
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
      }
    }
    return resChild;
  };
  
  /**
   * 
   */
  $.readResultsList = function(buffer) {
    var res = {};
    offset = 0;
    res.header = readBuffer(buffer, 4);
    // length (total minus header and response Length)
    res.responseLength = readBuffer(buffer, 4);
    //l("response length (total minus header, response length, opcode, tag count ): " + ( res.responseLength - 3) );
    var opCode = readBuffer(buffer, 1);
    var jsonChild = 'opCode' + opCode;
    res[jsonChild] = {};
    res[jsonChild].opCode = opCode;
    res[jsonChild].tagCountInResponse = readBuffer(buffer, 2);
    $.readBufferChildren(buffer, res[jsonChild]);
    l(res);
    return res;
  };

}(typeof exports === 'object' && exports || this));
