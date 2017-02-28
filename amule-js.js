var AMuleCliResponse = (function () {
    function AMuleCliResponse() {
        this.totalSizeOfRequest = 0;
        this.opCode = null;
        this.children = [];
    }
    return AMuleCliResponse;
}());
var InternalResponse = (function () {
    function InternalResponse() {
        this.children = [];
        this.sizeToRemoveForParent = 0;
    }
    return InternalResponse;
}());
var AMuleCli = (function () {
    function AMuleCli(ip, port, password, md5Function) {
        this.isConnected = false;
        this.offset = 0; // use internally to read bit stream from server
        this.arrayBuffers = []; // used to build requests
        this.recurcifInBuildTagArrayBuffer = 0;
        this.responseOpcode = 0; // op code given in the server
        this.solt = ''; // solt number (sessions id)
        /**
         * from amule ECCodes.h code
         */
        this.ECCodes = {
            EC_CURRENT_PROTOCOL_VERSION: 0x0204,
            EC_OP_AUTH_REQ: 0x02,
            EC_OP_GET_SHARED_FILES: 0x10
        };
        this.ECOpCodes = {
            EC_OP_STRINGS: 0x06,
            EC_TAGTYPE_UINT16: 0x03,
            EC_TAGTYPE_CUMSTOM: 1,
            EC_TAGTYPE_UINT8: 2,
            EC_TAGTYPE_HASH16: 0x09,
            EC_OP_AUTH_FAIL: 0x03,
            EC_OP_AUTH_OK: 0x04,
            EC_OP_SEARCH_START: 0x26,
            EC_OP_SEARCH_STOP: 0x27,
            EC_OP_SEARCH_RESULTS: 0x28,
            EC_OP_SEARCH_PROGRESS: 0x29,
            EC_OP_DOWNLOAD_SEARCH_RESULT: 0x2A
        };
        this.ECTagNames = {
            EC_TAG_CLIENT_NAME: 0x0100,
            EC_TAG_CLIENT_VERSION: 0x0101,
            EC_TAG_PROTOCOL_VERSION: 0x0002,
            EC_TAG_PASSWD_HASH: 0x0001
        };
        this.ProtocolVersion = {
            EC_CURRENT_PROTOCOL_VERSION: 0x0204
        };
        this.EC_SEARCH_TYPE = {
            EC_SEARCH_LOCA: 0x00,
            EC_SEARCH_GLOBAL: 0x01,
            EC_SEARCH_KAD: 0x02,
            EC_SEARCH_WEB: 0x03
        };
        this.EC_TAG_SEARCHFILE = {
            EC_TAG_SEARCH_TYPE: 0x0701,
            EC_TAG_SEARCH_NAME: 0x0702,
            EC_TAG_SEARCH_MIN_SIZE: 0x0703,
            EC_TAG_SEARCH_MAX_SIZE: 0x0704,
            EC_TAG_SEARCH_FILE_TYPE: 0x0705,
            EC_TAG_SEARCH_EXTENSION: 0x0706,
            EC_TAG_SEARCH_AVAILABILITY: 0x0707,
            EC_TAG_SEARCH_STATUS: 0x0708,
            EC_TAG_SEARCH_PARENT: 0x0709
        };
        this.client = null; // node socket
        this.isRunningPromise = false;
        this.ip = ip;
        this.port = port;
        this.md5Function = md5Function;
        // must be the same as ECPassword in .aMule/amule.conf
        this.md5Password = this.md5(password);
    }
    AMuleCli.prototype.md5 = function (str) {
        return this.md5Function(str);
    };
    AMuleCli.prototype.setTextDecoder = function (textDecoder) {
        this.textDecoder = textDecoder;
    };
    AMuleCli.prototype.setStringDecoder = function (stringDecoder) {
        this.stringDecoder = stringDecoder;
    };
    /**
     * Used internally to build a request
     */
    AMuleCli.prototype._buildTagArrayBuffer = function (ecTag, ecOp, value, children) {
        this.recurcifInBuildTagArrayBuffer++;
        var tagLength = 0;
        var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
        dv.setUint16(0, ecTag, false); // name
        this.arrayBuffers.push(dv.buffer);
        tagLength += Uint16Array.BYTES_PER_ELEMENT;
        dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dv.setUint8(0, ecOp); // type
        this.arrayBuffers.push(dv.buffer);
        tagLength += Uint8Array.BYTES_PER_ELEMENT;
        var lengthDataView = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        this.arrayBuffers.push(lengthDataView.buffer);
        // data length is going to be set after the children are created
        tagLength += Uint32Array.BYTES_PER_ELEMENT;
        var childrenTagsLength = 0;
        if ((ecTag & 0x01) !== 0 && children === null) {
            // if tag has no child
            dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            dv.setUint16(0, 0, false);
            this.arrayBuffers.push(dv.buffer);
            if (this.recurcifInBuildTagArrayBuffer < 2) {
                tagLength += Uint16Array.BYTES_PER_ELEMENT;
            }
        }
        else if (children) {
            dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            this.arrayBuffers.push(dv.buffer);
            tagLength += Uint16Array.BYTES_PER_ELEMENT;
            for (var m = 0; m < children.length; m++) {
                // console.log("child " + children[m].ecTag + " " + children[m].ecOp + " " + children[m].value);
                childrenTagsLength += this._buildTagArrayBuffer(children[m].ecTag, children[m].ecOp, children[m].value, null);
            }
            dv.setUint16(0, children.length, false);
        }
        // set length after children are created
        if (ecOp === this.ECOpCodes.EC_TAGTYPE_UINT16) {
            lengthDataView.setUint32(0, 2 + childrenTagsLength, false);
        }
        else if (ecOp === this.ECOpCodes.EC_TAGTYPE_UINT8) {
            lengthDataView.setUint32(0, 1 + childrenTagsLength, false);
        }
        else if (ecOp === this.ECOpCodes.EC_TAGTYPE_HASH16) {
            lengthDataView.setUint32(0, value.length / 2 + childrenTagsLength, false);
        }
        else {
            lengthDataView.setUint32(0, parseInt(value.length + childrenTagsLength), false);
        }
        // set content
        if (ecOp === this.ECOpCodes.EC_OP_STRINGS) {
            for (var i = 0; i < value.length; i++) {
                var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
                dv.setUint8(0, value[i].charCodeAt(0));
                this.arrayBuffers.push(dv.buffer);
                tagLength += Uint8Array.BYTES_PER_ELEMENT;
            }
        }
        else if (ecOp === this.ECOpCodes.EC_TAGTYPE_UINT8) {
            var dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
            dv.setUint8(0, value);
            this.arrayBuffers.push(dv.buffer);
            tagLength += Uint8Array.BYTES_PER_ELEMENT;
        }
        else if (ecOp === this.ECOpCodes.EC_TAGTYPE_HASH16) {
            for (var i_1 = 0; i_1 < value.length; i_1 = i_1 + 2) {
                var dv_1 = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
                var hashValue = parseInt(value[i_1] + value[i_1 + 1], 16);
                dv_1.setUint8(0, hashValue);
                // console.log("hash " + i / 2 + " : " + hashValue);
                this.arrayBuffers.push(dv_1.buffer);
                tagLength += Uint8Array.BYTES_PER_ELEMENT;
            }
        }
        else if (ecOp === this.ECOpCodes.EC_TAGTYPE_UINT16) {
            var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            dv.setUint16(0, value, false);
            this.arrayBuffers.push(dv.buffer);
            tagLength += Uint16Array.BYTES_PER_ELEMENT;
        }
        this.recurcifInBuildTagArrayBuffer--;
        return tagLength;
    };
    ;
    /**
     * Build request headers
     */
    AMuleCli.prototype._setHeadersToRequest = function (opCode) {
        var dv = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        // set flags, normal === 32 (34 pour amule-gui)
        dv.setUint32(0, 32, false);
        this.arrayBuffers.push(dv.buffer);
        // packet body length, will be set at the end
        this.arrayBuffers.push(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dv.setUint8(0, opCode); // op code
        this.arrayBuffers.push(dv.buffer);
        // tag count, will be set at the end
        this.arrayBuffers.push(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
    };
    ;
    /**
     * Build a ArrayBuffer from the array of DataView, set body length in bytes
     * and tag count.
     *
     * @returns {ArrayBuffer}
     */
    AMuleCli.prototype._finalizeRequest = function (tagCount) {
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
        // console.log('> body length: '+ (buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2));
        // set tag count
        var tagNumberDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT * 2 + Uint8Array.BYTES_PER_ELEMENT, Uint16Array.BYTES_PER_ELEMENT);
        tagNumberDataView.setUint16(0, tagCount, false);
        return buffer;
    };
    ;
    /**
     * The first request trigger a 8 bytes number to be associate with the
     * session (the salt number).
     *
     * @returns {ArrayBuffer}
     */
    AMuleCli.prototype.getAuthRequest1 = function () {
        this._setHeadersToRequest(2); //EC_OP_AUTH_REQ
        var tagCount = 0;
        this._buildTagArrayBuffer(this.ECTagNames.EC_TAG_CLIENT_NAME * 2, this.ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
        tagCount++;
        this._buildTagArrayBuffer(this.ECTagNames.EC_TAG_CLIENT_VERSION * 2, this.ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
        tagCount++;
        this._buildTagArrayBuffer(4, this.ECOpCodes.EC_TAGTYPE_UINT16, this.ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    /**
     * When the solt number (aka session id) is given by the server, we can auth
     *
     * @returns {ArrayBuffer}
     */
    AMuleCli.prototype._getAuthRequest2 = function () {
        this._setHeadersToRequest(80);
        var tagCount = 0;
        var passwd = this.md5(this.md5Password + this.md5(this.solt));
        this._buildTagArrayBuffer(2, this.ECOpCodes.EC_TAGTYPE_HASH16, passwd, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    /**
     *  < EC_OP_SEARCH_START opCode:38 size:38 (compressed: 30)
     *      EC_TAG_SEARCH_TYPE tagName:1793 dataType:2 dataLen:1 = EC_SEARCH_LOCAL
     *        EC_TAG_SEARCH_NAME tagName:1794 dataType:6 dataLen:10 = keywords 2017
     *        EC_TAG_SEARCH_FILE_TYPE tagName:1797 dataType:6 dataLen:1 =
     *  > EC_OP_STRINGS opCode:6 size:59 (compressed: 54)
     *      EC_TAG_STRING tagName:0 dataType:6 dataLen:49 = Search in progress. Refetch results in a moment!
     *
     * or
     *
     *  < EC_OP_SEARCH_START opCode:38 size:38 (compressed: 30)
     *      EC_TAG_SEARCH_TYPE tagName:1793 dataType:2 dataLen:1 = EC_SEARCH_KAD
     *        EC_TAG_SEARCH_NAME tagName:1794 dataType:6 dataLen:10 = keywords 2017
     *        EC_TAG_SEARCH_FILE_TYPE tagName:1797 dataType:6 dataLen:1 =
     *
     * > EC_OP_FAILED opCode:5 size:61
     *    EC_TAG_STRING tagName:0 dataType:6 dataLen:51 = eD2k search can't be done if eD2k is not connected
     */
    AMuleCli.prototype._getSearchStartRequest = function (q, searchType) {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_START); //38
        var tagCount = 0;
        var children = [{
                ecTag: 1794 * 2,
                ecOp: this.ECOpCodes.EC_OP_STRINGS,
                value: q + "\0"
            }, {
                ecTag: this.EC_TAG_SEARCHFILE.EC_TAG_SEARCH_FILE_TYPE,
                ecOp: this.ECOpCodes.EC_OP_STRINGS,
                value: "\0"
            }, {
                ecTag: this.EC_TAG_SEARCHFILE.EC_TAG_SEARCH_EXTENSION,
                ecOp: this.ECOpCodes.EC_OP_STRINGS,
                value: "mp4\0"
            }];
        //this.EC_SEARCH_TYPE.EC_SEARCH_KAD EC_SEARCH_LOCA
        this._buildTagArrayBuffer(this.EC_TAG_SEARCHFILE.EC_TAG_SEARCH_TYPE, this.ECOpCodes.EC_TAGTYPE_UINT8, searchType, children);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    /**
     * < EC_OP_SEARCH_PROGRESS opCode:41 size:3 (compressed: 2)
     * > EC_OP_SEARCH_PROGRESS opCode:41 size:11 (compressed: 8)
     *     EC_TAG_SEARCH_STATUS tagName:1800 dataType:2 dataLen:1 = 0
     */
    AMuleCli.prototype._isSearchFinished = function () {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_PROGRESS); //41
        return this._finalizeRequest(0);
    };
    ;
    /**
     *
     */
    AMuleCli.prototype.getSharedFilesRequest = function () {
        this._setHeadersToRequest(this.ECCodes.EC_OP_GET_SHARED_FILES);
        return this._finalizeRequest(0);
    };
    ;
    /**
     *
     */
    AMuleCli.prototype.getSearchResultRequest = function () {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_RESULTS);
        var tagCount = 0;
        this._buildTagArrayBuffer(8, this.ECOpCodes.EC_TAGTYPE_UINT8, this.EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    AMuleCli.prototype.getDownloadsRequest = function () {
        this._setHeadersToRequest(13); // EC_OP_GET_DLOAD_QUEUE
        return this._finalizeRequest(0);
    };
    ;
    /**
     *  < EC_OP_DOWNLOAD_SEARCH_RESULT opCode:42 size:36 (compressed: 28)
     *      EC_TAG_PARTFILE tagName:768 dataType:9 dataLen:16 = 26E4413971DF1EC89AC3B91A4A02402F
     *        EC_TAG_PARTFILE_CAT tagName:783 dataType:2 dataLen:1 = 0
     *  > EC_OP_STRINGS opCode:6 size:3 (compressed: 2)
     */
    AMuleCli.prototype.downloadRequest = function (e) {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_DOWNLOAD_SEARCH_RESULT); //42
        var tagCount = 0;
        var children = [{
                ecTag: 783 * 2,
                ecOp: this.ECOpCodes.EC_TAGTYPE_UINT8,
                value: 0
            }];
        // if has children => +1
        this._buildTagArrayBuffer(768 * 2 + 1, this.ECOpCodes.EC_TAGTYPE_HASH16, e.hash, children);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    /**
     *
     */
    AMuleCli.prototype.clearCompletedRequest = function () {
        this._setHeadersToRequest(0x53); // EC_OP_CLEAR_COMPLETED
        return this._finalizeRequest(0);
    };
    ;
    /**
     * EC_OP_STAT_REQ == 10 for a short summary
     * EC_OP_GET_UPDATE == 82  for the list of dl and ul files
     *
     * < EC_OP_STAT_REQ opCode:10 size:11 (compressed: 6)
     *     EC_TAG_DETAIL_LEVEL tagName:4 dataType:2 dataLen:1 = EC_DETAIL_INC_UPDATE
     * > EC_OP_STATS opCode:12 size:316 (compressed: 215)
     *     EC_TAG_STATS_UP_OVERHEAD tagName:516 dataType:2 dataLen:1 = 197
     *     EC_TAG_STATS_DOWN_OVERHEAD tagName:517 dataType:2 dataLen:1 = 164
     *     EC_TAG_STATS_BANNED_COUNT tagName:519 dataType:2 dataLen:1 = 0
     *     ...
     */
    AMuleCli.prototype.getStatsRequest = function (EC_OP) {
        if (EC_OP === void 0) { EC_OP = 10; }
        this._setHeadersToRequest(EC_OP); // EC_OP_STAT_REQ == 10
        var tagCount = 0;
        var EC_TAG_DETAIL_LEVEL = 4;
        var EC_DETAIL_INC_UPDATE = 4;
        this._buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL * 2, this.ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_INC_UPDATE, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };
    ;
    /**
     * < EC_OP_PARTFILE_DELETE opCode:29 size:26 (compressed: 22)
     *     EC_TAG_PARTFILE tagName:768 dataType:9 dataLen:16 = EA63C3774DF2EB871EFA3AC58543B66F
     */
    AMuleCli.prototype.getCancelDownloadRequest = function (e) {
        this._setHeadersToRequest(29); // EC_OP_PARTFILE_DELETE
        this._buildTagArrayBuffer(768 * 2, this.ECOpCodes.EC_TAGTYPE_HASH16, e.hash, null);
        return this._finalizeRequest(1);
    };
    ;
    AMuleCli.prototype.readSalt = function (buffer) {
        var offset = Uint32Array.BYTES_PER_ELEMENT * 2;
        var dataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
        this.responseOpcode = dataView.getUint8(0);
        // console.log("response opcode : " + this.responseOpcode);
        offset = offset + Uint8Array.BYTES_PER_ELEMENT;
        // console.log("response tag count : " + dataView.getUint16(0, false));
        offset = offset + Uint16Array.BYTES_PER_ELEMENT;
        // console.log("response tag # name (ecTag) : " + dataView.getUint16(0, false));
        offset = offset + Uint16Array.BYTES_PER_ELEMENT;
        // console.log("response tag # type (ecOp): " + dataView.getUint8(0, false));
        offset = offset + Uint8Array.BYTES_PER_ELEMENT;
        // console.log("response tag # length : " + dataView.getUint32(0, false));
        offset = offset + Uint32Array.BYTES_PER_ELEMENT;
        if (this.responseOpcode === 79) {
            var dv = new DataView(buffer, offset, 8); // 8 bytes
            for (var i = 0; i < 8; i++) {
                var c = dv.getUint8(i).toString(16).toUpperCase();
                if (c.length < 2 && i !== 0) {
                    c = '0' + c;
                }
                this.solt += c;
            }
            offset = offset + 8;
        }
        return this.responseOpcode;
    };
    ;
    AMuleCli.prototype.readBuffer = function (buffer, byteNumberToRead, littleEndian) {
        if (littleEndian === void 0) { littleEndian = false; }
        var val = null;
        var dataView = new DataView(buffer, this.offset, byteNumberToRead);
        if (byteNumberToRead === 1) {
            val = dataView.getUint8(0);
        }
        else if (byteNumberToRead === 2) {
            val = dataView.getUint16(0, littleEndian);
        }
        else if (byteNumberToRead === 4) {
            val = dataView.getUint32(0, littleEndian);
        }
        this.offset += byteNumberToRead;
        return val;
    };
    ;
    AMuleCli.prototype.readBufferChildren = function (buffer, res, recursivity) {
        if (recursivity === void 0) { recursivity = 1; }
        res.children = [];
        for (var j = 0; j < res.tagCountInResponse; j++) {
            var child = {
                nameEcTag: this.readBuffer(buffer, 2),
                typeEcOp: this.readBuffer(buffer, 1),
                length: this.readBuffer(buffer, 4),
                tagCountInResponse: 0,
                children: [],
                value: ''
            };
            res.length -= (7 + child.length); // remove header length + length
            if (child.nameEcTag % 2) {
                child.nameEcTag = (child.nameEcTag - 1) / 2;
                child.tagCountInResponse = this.readBuffer(buffer, 2);
                res.length -= 2;
            }
            else {
                child.nameEcTag = child.nameEcTag / 2;
            }
            this.readBufferChildren(buffer, child, recursivity + 1);
            res.children.push(child);
        }
        if (recursivity > 1) {
            res.value = this.readValueOfANode(res, buffer);
        }
    };
    ;
    AMuleCli.prototype.uintToString = function (uintArray) {
        var encodedString = String.fromCharCode.apply(null, uintArray), decodedString = decodeURIComponent(encodedString);
        return decodedString;
    };
    /**
     * Read the value of a node according to its type (typeEcOp) and size in the buffer
     * @returns value
     */
    AMuleCli.prototype.readValueOfANode = function (child2, buffer) {
        if (!child2.length) {
            return '';
        }
        if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_UINT8) {
            child2.value = this.readBuffer(buffer, child2.length);
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_UINT16) {
            child2.value = this.readBuffer(buffer, child2.length);
        }
        else if (child2.typeEcOp === 4) {
            for (var m_1 = 0; m_1 < child2.length; m_1++) {
                child2.value += "" + this.readBuffer(buffer, 1);
            }
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_OP_STRINGS) {
            if (!this.textDecoder && typeof this.stringDecoder === 'undefined') {
                console.log("you won't be able to read special utf-8 char");
            }
            var uint8array = [];
            for (var m_2 = 0; m_2 < child2.length; m_2++) {
                var intValue = this.readBuffer(buffer, 1);
                if (intValue > 0x80) {
                    uint8array.push(intValue);
                }
                else if (uint8array.length > 0) {
                    if (this.textDecoder) {
                        child2.value += this.textDecoder.decode(new Uint8Array(uint8array));
                    }
                    else if (this.stringDecoder) {
                        child2.value += this.stringDecoder.write(Buffer.from(uint8array));
                    }
                    uint8array = [];
                    child2.value += '' + String.fromCharCode(intValue); // work for all javascript engine
                }
                else {
                    child2.value += '' + String.fromCharCode(intValue);
                }
            }
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_HASH16) {
            for (var m = 0; m < child2.length; m = m + 2) {
                var c = this.readBuffer(buffer, 2).toString(16);
                c = ('0000' + c).slice(-4);
                child2.value += c;
            }
            if (child2.value.length != 32) {
                console.log('HASH is false: ' + child2.value + ' -- ' + +child2.value.length);
            }
        }
        else {
            // console.log('WARNING: not read : child2.typeEcOp = ' + child2.typeEcOp);
            // TODO 
            // wrong but we do it to read the buffer
            for (var m = 0; m < child2.length; m++) {
                child2.value += "" + this.readBuffer(buffer, 1);
            }
        }
        return child2.value;
    };
    AMuleCli.prototype._readHeader = function (buffer) {
        this.offset = 0;
        var response = new AMuleCliResponse();
        response.header = this.readBuffer(buffer, 4);
        // length (total minus header and response Length)
        var responseLength = this.readBuffer(buffer, 4);
        response.totalSizeOfRequest = responseLength + 8;
        // children response length (total minus header, response length, opcode, tag count)
        response.length = responseLength - 3;
        response.opCode = this.readBuffer(buffer, 1);
        response.tagCountInResponse = this.readBuffer(buffer, 2);
        return response;
    };
    AMuleCli.prototype.readResultsList = function (buffer) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var response = _this._readHeader(buffer);
            response.opCodeLabel = null;
            if (response.opCode === 1) {
                response.opCodeLabel = 'EC_OP_NOOP';
            }
            else if (response.opCode === 5) {
                response.opCodeLabel = 'EC_OP_FAILED';
            }
            else if (response.opCode === 31) {
                response.opCodeLabel = 'EC_OP_DLOAD_QUEUE';
            }
            else if (response.opCode === 40) {
                response.opCodeLabel = 'EC_OP_SEARCH_RESULTS';
            }
            _this.readBufferChildren(buffer, response);
            response.children.forEach(function (e) {
                if (e.children) {
                    e.children.forEach(function (m) {
                        if (m.nameEcTag === 769) {
                            e.value = m.value;
                        }
                        if (m.nameEcTag === 798) {
                            e.hash = m.value;
                        }
                        if (m.nameEcTag === 771) {
                            e.size = parseInt(m.value);
                        }
                        if (m.nameEcTag === 782) {
                            e.edkLink = m.value;
                        }
                    });
                }
            });
            resolve(response);
        });
    };
    ;
    AMuleCli.prototype.toBuffer = function (ab) {
        return new Buffer(new Uint8Array(ab));
    };
    AMuleCli.prototype.toArrayBuffer = function (buf) {
        return new Uint8Array(buf).buffer;
    };
    /**
     * Create a TCP socket with the server.
     */
    AMuleCli.prototype.initConnToServer = function (ip, port) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (typeof chrome !== 'undefined') {
                console.log("using chrome API");
                chrome.sockets.tcp.create({}, function (r) {
                    _this.socketId = r.socketId;
                    chrome.sockets.tcp.connect(r.socketId, ip, port, function (code) { return resolve(code); });
                });
            }
            else {
                _this.client = new net.Socket(); // return a Node socket
                _this.client.connect(port, ip);
                _this.client.on('connect', function () { return resolve(); });
            }
        });
    };
    ;
    AMuleCli.prototype.sendToServer_simple = function (data) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (typeof chrome !== 'undefined') {
                chrome.sockets.tcp.send(_this.socketId, data, function (r) { });
                chrome.sockets.tcp.onReceive.addListener(function (receiveInfo) { return resolve(receiveInfo.data); });
            }
            else {
                _this.client.write(_this.toBuffer(data));
                _this.client.on('data', function (data) { return resolve(_this.toArrayBuffer(data)); });
            }
        });
    };
    ;
    AMuleCli.prototype.sendToServer = function (data) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var buf = [], totalSizeOfRequest, frequency = 100, timeout = 200, count = 0;
            if (typeof chrome !== 'undefined') {
                chrome.sockets.tcp.send(_this.socketId, data, function (r) { });
                chrome.sockets.tcp.onReceive.addListener(function (r) { return buf.push(r.data); });
            }
            else {
                _this.client.write(_this.toBuffer(data));
                _this.client.on('data', function (data) { return buf.push(_this.toArrayBuffer(data)); });
            }
            var intervalId = setInterval(function () {
                if (buf[0]) {
                    totalSizeOfRequest = _this._readHeader(buf[0]).totalSizeOfRequest;
                    var bl_1 = 0;
                    buf.forEach(function (b) {
                        bl_1 += b.byteLength;
                    });
                    if (bl_1 >= totalSizeOfRequest) {
                        var buffer_1 = new ArrayBuffer(bl_1);
                        var o_1 = 0;
                        buf.forEach(function (b) {
                            for (var j = 0; j < b.byteLength; j++) {
                                var fromArrayView = new Uint8Array(b, j, 1);
                                var toArrayView = new Uint8Array(buffer_1, j + o_1, 1);
                                toArrayView.set(fromArrayView);
                            }
                            o_1 = o_1 + b.byteLength;
                        });
                        clearInterval(intervalId);
                        resolve(buffer_1);
                    }
                }
                if (count++ > timeout) {
                    console.error('time out expired for this TCP request');
                    clearInterval(intervalId);
                }
            }, frequency);
        });
    };
    ;
    AMuleCli.prototype.connect = function () {
        var _this = this;
        return this.initConnToServer(this.ip, this.port).then(function () {
            return _this.sendToServer_simple(_this.getAuthRequest1());
        }).then(function (data) {
            _this.readSalt(data);
            return _this.sendToServer_simple(_this._getAuthRequest2());
        }).then(function (data) {
            if (_this.readSalt(data) === 4) {
                return ('You are successfuly connected to amule');
            }
            else {
                throw ('You are NOT connected to amule');
            }
        })["catch"](function (err) {
            throw ('\n\nYou are NOT connected to amule: ' + err);
        });
    };
    ;
    /**
     * Make the promises flow synchronized
     */
    AMuleCli.prototype.sendToServerWhenAvalaible = function (r) {
        var _this = this;
        if (!this.isRunningPromise) {
            this.isRunningPromise = true;
            return this.sendToServer(r).then(function (data) {
                _this.isRunningPromise = false;
                return _this.readResultsList(data);
            });
        }
        else {
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    resolve(_this.sendToServerWhenAvalaible(r));
                }, 400);
            });
        }
    };
    AMuleCli.prototype.filterResultList = function (list, q, strict) {
        if (strict && list.children) {
            list.children = list.children.filter(function (e) {
                var isPresent = true;
                q.split(' ').map(function (r) {
                    if (e.value.toLowerCase().indexOf(r) === -1) {
                        isPresent = false;
                    }
                });
                return isPresent;
            });
        }
        return list;
    };
    /**
     * Search on the server
     *
     */
    AMuleCli.prototype.search = function (q, searchType, strict) {
        var _this = this;
        if (searchType === void 0) { searchType = this.EC_SEARCH_TYPE.EC_SEARCH_KAD; }
        if (strict === void 0) { strict = true; }
        q = q.trim();
        return this.sendToServerWhenAvalaible(this._getSearchStartRequest(q, searchType)).then(function (res) {
            if (searchType === _this.EC_SEARCH_TYPE.EC_SEARCH_KAD) {
                return new Promise(function (resolve, reject) {
                    var timeout = 120, frequency = 1500, count = 0, isSearchFinished = false;
                    var intervalId = setInterval(function () {
                        if (isSearchFinished) {
                            clearInterval(intervalId);
                            _this.fetchSearch().then(function (list) {
                                resolve(_this.filterResultList(list, q, strict));
                            });
                        }
                        _this.sendToServerWhenAvalaible(_this._isSearchFinished()).then(function (res) {
                            if (res.children[0].value !== 0) {
                                isSearchFinished = true;
                            }
                        });
                        if (count++ > timeout) {
                            console.error('time out expired to fetch result');
                            clearInterval(intervalId);
                        }
                    }, frequency);
                });
            }
            else if (searchType === _this.EC_SEARCH_TYPE.EC_SEARCH_LOCA) {
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        _this.fetchSearch().then(function (list) {
                            resolve(_this.filterResultList(list, q, strict));
                        });
                    }, 1500);
                });
            }
        });
    };
    AMuleCli.prototype.fetchSearch = function () {
        return this.sendToServerWhenAvalaible(this.getSearchResultRequest());
    };
    AMuleCli.prototype.getDownloads = function () {
        return this.sendToServerWhenAvalaible(this.getDownloadsRequest());
    };
    AMuleCli.prototype.download = function (e) {
        return this.sendToServerWhenAvalaible(this.downloadRequest(e));
    };
    AMuleCli.prototype.getSharedFiles = function () {
        return this.sendToServerWhenAvalaible(this.getSharedFilesRequest());
    };
    AMuleCli.prototype.getDetailUpdate = function () {
        return this.sendToServerWhenAvalaible(this.getStatsRequest(82));
    };
    AMuleCli.prototype.clearCompleted = function () {
        return this.sendToServerWhenAvalaible(this.clearCompletedRequest());
    };
    AMuleCli.prototype.getStats = function () {
        return this.sendToServerWhenAvalaible(this.getStatsRequest(10));
    };
    AMuleCli.prototype.cancelDownload = function (e) {
        return this.sendToServerWhenAvalaible(this.getCancelDownloadRequest(e));
    };
    return AMuleCli;
}());
