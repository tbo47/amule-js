/// <reference path="node_modules/@types/chrome/chrome-app.d.ts"/>
import * as net from 'net';

class AMuleCliResponse {
    public header: string;
    public totalSizeOfRequest: number = 0;
    public opCode = null;
    public tagCountInResponse: number;
    public opCodeLabel: string;
    public children: AMuleCliResponse[] = [];
    public nameEcTag;
    public value;
    public size; //size of a downloaded file
    public length;
    public sourceCount: number = 0;
    public sourceCountXfer: number = 0;
    public status: number = 0;
}

export class AMuleCli {
    private isConnected: Boolean = false;
    private offset: number = 0; // use internally to read bit stream from server
    private arrayBuffers = [];// used to build requests
    private recurcifInBuildTagArrayBuffer: number = 0;
    private responseOpcode: number = 0;// op code given in the server

    private ip: string;// server address
    private port: number;// server port
    private md5Password: string; // md5 value of the password
    private solt: string = '';// solt number (sessions id)
    private md5Function;// function to md5()
    private textDecoder;
    private stringDecoder;

    constructor(ip: string, port: number, password: string, md5Function) {
        this.ip = ip;
        this.port = port;
        this.md5Function = md5Function;
        // must be the same as ECPassword in .aMule/amule.conf
        this.md5Password = this.md5(password);
    }

    private md5(str: string) {
        return this.md5Function(str);
    }

    public setTextDecoder(textDecoder) {
        this.textDecoder = textDecoder;
    }

    public setStringDecoder(stringDecoder) {
        this.stringDecoder = stringDecoder;
    }

    /**
     * from amule ECCodes.h code
     */
    private ECCodes = {
        EC_CURRENT_PROTOCOL_VERSION: 0x0204,
        EC_OP_AUTH_REQ: 0x02,
        EC_OP_GET_SHARED_FILES: 0x10
    };
    private ECOpCodes = {
        EC_OP_STRINGS: 0x06,
        EC_TAGTYPE_UINT16: 0x03,
        EC_TAGTYPE_CUMSTOM: 1,
        EC_TAGTYPE_UINT8: 2, // defined in ECTagTypes.h
        EC_TAGTYPE_HASH16: 0x09,
        EC_OP_AUTH_FAIL: 0x03,
        EC_OP_AUTH_OK: 0x04,
        EC_OP_SEARCH_START: 0x26,
        EC_OP_SEARCH_STOP: 0x27,
        EC_OP_SEARCH_RESULTS: 0x28,
        EC_OP_SEARCH_PROGRESS: 0x29,
        EC_OP_DOWNLOAD_SEARCH_RESULT: 0x2A
    };
    private ECTagNames = {
        EC_TAG_CLIENT_NAME: 0x0100,
        EC_TAG_CLIENT_VERSION: 0x0101,
        EC_TAG_PROTOCOL_VERSION: 0x0002,
        EC_TAG_PASSWD_HASH: 0x0001
    };
    private ProtocolVersion = {
        EC_CURRENT_PROTOCOL_VERSION: 0x0204
    };
    private EC_SEARCH_TYPE = {
        EC_SEARCH_LOCA: 0x00,
        EC_SEARCH_GLOBAL: 0x01,
        EC_SEARCH_KAD: 0x02,
        EC_SEARCH_WEB: 0x03
    };
    private EC_TAG_SEARCHFILE = {
        EC_TAG_SEARCH_TYPE: 0x0701, //1793/2?
        EC_TAG_SEARCH_NAME: 0x0702,
        EC_TAG_SEARCH_MIN_SIZE: 0x0703,
        EC_TAG_SEARCH_MAX_SIZE: 0x0704,
        EC_TAG_SEARCH_FILE_TYPE: 0x0705,
        EC_TAG_SEARCH_EXTENSION: 0x0706,
        EC_TAG_SEARCH_AVAILABILITY: 0x0707,
        EC_TAG_SEARCH_STATUS: 0x0708,
        EC_TAG_SEARCH_PARENT: 0x0709
    };

    /**
     * Used internally to build a request
     */
    private _buildTagArrayBuffer(ecTag, ecOp, value, children) {
        this.recurcifInBuildTagArrayBuffer++;
        var tagLength = 0;
        var dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
        dv.setUint16(0, ecTag, false);// name
        this.arrayBuffers.push(dv.buffer);
        tagLength += Uint16Array.BYTES_PER_ELEMENT;

        dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dv.setUint8(0, ecOp);// type
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
        else if (children) {// if tag has a child
            dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            this.arrayBuffers.push(dv.buffer);
            tagLength += Uint16Array.BYTES_PER_ELEMENT;
            for (var m = 0; m < children.length; m++) {
                // console.log("child " + children[m].ecTag + " " + children[m].ecOp + " " + children[m].value);
                childrenTagsLength += this._buildTagArrayBuffer(children[m].ecTag, children[m].ecOp, children[m].value, null);
                // console.log("childrenTagsLength : " + childrenTagsLength);
            }
            dv.setUint16(0, children.length, false);
        }

        // set length after children are created
        if (ecOp === this.ECOpCodes.EC_TAGTYPE_UINT16) {// length
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
            for (let i = 0; i < value.length; i = i + 2) {
                const dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
                const hashValue = parseInt(value[i] + value[i + 1], 16);
                dv.setUint8(0, hashValue);
                this.arrayBuffers.push(dv.buffer);
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

    /**
     * Build request headers
     */
    private _setHeadersToRequest(opCode: number) {
        let dv = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        // set flags, normal === 32 (34 pour amule-gui)
        dv.setUint32(0, 32, false);
        this.arrayBuffers.push(dv.buffer);
        // packet body length, will be set at the end
        this.arrayBuffers.push(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        dv = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dv.setUint8(0, opCode);// op code
        this.arrayBuffers.push(dv.buffer);
        // tag count, will be set at the end
        this.arrayBuffers.push(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
    };

    /**
     * Build a ArrayBuffer from the array of DataView, set body length in bytes
     * and tag count.
     *
     * @returns {ArrayBuffer}
     */
    private _finalizeRequest(tagCount): ArrayBuffer {
        // calculating the buffer length in bytes
        let bufferLength = 0;
        for (let i = 0; i < this.arrayBuffers.length; i++) {
            bufferLength = bufferLength + this.arrayBuffers[i].byteLength;
        }
        // creating ArrayBuffer with all the DataViews above
        const buffer = new ArrayBuffer(bufferLength);
        let offset = 0;
        for (let i = 0; i < this.arrayBuffers.length; i++) {
            for (let j = 0; j < this.arrayBuffers[i].byteLength; j++) {
                const fromArrayView = new Uint8Array(this.arrayBuffers[i], j, 1);
                const toArrayView = new Uint8Array(buffer, j + offset, 1);
                toArrayView.set(fromArrayView);
            }
            offset = offset + this.arrayBuffers[i].byteLength;
        }
        this.arrayBuffers = [];
        // set body length
        const bodyLengthDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT, Uint32Array.BYTES_PER_ELEMENT);
        bodyLengthDataView.setUint32(0, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2, false);
        // console.log('> body length: '+ (buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT * 2));
        // set tag count
        const tagNumberDataView = new DataView(buffer, Uint32Array.BYTES_PER_ELEMENT * 2 + Uint8Array.BYTES_PER_ELEMENT, Uint16Array.BYTES_PER_ELEMENT);
        tagNumberDataView.setUint16(0, tagCount, false);
        return buffer;
    };

    /**
     * The first request trigger a 8 bytes number to be associate with the
     * session (the salt number).
     *
     * @returns {ArrayBuffer}
     */
    private getAuthRequest1() {
        this._setHeadersToRequest(2);//EC_OP_AUTH_REQ
        let tagCount = 0;
        this._buildTagArrayBuffer(this.ECTagNames.EC_TAG_CLIENT_NAME * 2, this.ECOpCodes.EC_OP_STRINGS, "amule-js\0", null);
        tagCount++;
        this._buildTagArrayBuffer(this.ECTagNames.EC_TAG_CLIENT_VERSION * 2, this.ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
        tagCount++;
        this._buildTagArrayBuffer(4, this.ECOpCodes.EC_TAGTYPE_UINT16, this.ProtocolVersion.EC_CURRENT_PROTOCOL_VERSION, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

    /**
     * When the solt number (aka session id) is given by the server, we can auth
     *
     * @returns {ArrayBuffer}
     */
    private _getAuthRequest2() {
        this._setHeadersToRequest(80);
        let tagCount = 0;
        let passwd = this.md5(this.md5Password + this.md5(this.solt));
        this._buildTagArrayBuffer(2, this.ECOpCodes.EC_TAGTYPE_HASH16, passwd, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

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
    private _getSearchStartRequest(q: string, searchType): ArrayBuffer {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_START); //38
        let tagCount = 0;
        const children = [{
            ecTag: 1794 * 2,
            ecOp: this.ECOpCodes.EC_OP_STRINGS, // 6
            value: q + "\0"
        }, {
            ecTag: this.EC_TAG_SEARCHFILE.EC_TAG_SEARCH_FILE_TYPE, // 1797*2
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

    /**
     * < EC_OP_SEARCH_PROGRESS opCode:41 size:3 (compressed: 2)
     * > EC_OP_SEARCH_PROGRESS opCode:41 size:11 (compressed: 8)
     *     EC_TAG_SEARCH_STATUS tagName:1800 dataType:2 dataLen:1 = 0
     */
    private _isSearchFinished(): ArrayBuffer {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_PROGRESS); //41
        return this._finalizeRequest(0);
    };

    /**
     *
     */
    private getSharedFilesRequest() {
        this._setHeadersToRequest(this.ECCodes.EC_OP_GET_SHARED_FILES);
        return this._finalizeRequest(0);
    };

    /**
     *
     */
    private getSearchResultRequest() {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_SEARCH_RESULTS);
        let tagCount = 0;
        this._buildTagArrayBuffer(8, this.ECOpCodes.EC_TAGTYPE_UINT8, this.EC_SEARCH_TYPE.EC_SEARCH_LOCA, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

    private getDownloadsRequest() {
        this._setHeadersToRequest(13); // EC_OP_GET_DLOAD_QUEUE
        return this._finalizeRequest(0);
    };

    /**
     *  < EC_OP_DOWNLOAD_SEARCH_RESULT opCode:42 size:36 (compressed: 28)
     *      EC_TAG_PARTFILE tagName:768 dataType:9 dataLen:16 = 26E4413971DF1EC89AC3B91A4A02402F
     *        EC_TAG_PARTFILE_CAT tagName:783 dataType:2 dataLen:1 = 0
     *  > EC_OP_STRINGS opCode:6 size:3 (compressed: 2)
     */
    private downloadRequest(e) {
        this._setHeadersToRequest(this.ECOpCodes.EC_OP_DOWNLOAD_SEARCH_RESULT);//42
        let tagCount = 0;
        const children = [{
            ecTag: 783 * 2,
            ecOp: this.ECOpCodes.EC_TAGTYPE_UINT8, //2
            value: 0
        }];

        // if has children => +1
        this._buildTagArrayBuffer(768 * 2 + 1, this.ECOpCodes.EC_TAGTYPE_HASH16, e.partfile_hash, children);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

    /**
     *
     */
    private clearCompletedRequest() {
        this._setHeadersToRequest(0x53); // EC_OP_CLEAR_COMPLETED
        return this._finalizeRequest(0);
    };

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
    private getStatsRequest(EC_OP = 10) {
        this._setHeadersToRequest(EC_OP); // EC_OP_STAT_REQ == 10
        let tagCount = 0;
        const EC_TAG_DETAIL_LEVEL = 4;
        const EC_DETAIL_INC_UPDATE = 4;
        this._buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL * 2, this.ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_INC_UPDATE, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

    /**
     *  < EC_OP_GET_PREFERENCES opCode:63 size:20 (compressed: 13)
     *      EC_TAG_DETAIL_LEVEL tagName:4 dataType:2 dataLen:1 = EC_DETAIL_UPDATE
     *      EC_TAG_SELECT_PREFS tagName:4096 dataType:3 dataLen:2 = 15103
     *  > EC_OP_SET_PREFERENCES opCode:64 size:683 (compressed: 540)
     *      EC_TAG_DETAIL_LEVEL tagName:4 dataType:2 dataLen:1 = EC_DETAIL_UPDATE
     *      EC_TAG_PREFS_GENERAL tagName:4608 dataType:1 dataLen:0 = empty
     *        EC_TAG_USER_NICK tagName:4609 dataType:6 dataLen:13 = name
     */
    private getPreferencesRequest() {
        this._setHeadersToRequest(63);
        let tagCount = 0;
        const EC_TAG_DETAIL_LEVEL = 4;
        const EC_DETAIL_UPDATE = 3;
        this._buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL * 2, this.ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_UPDATE, null);
        tagCount++;
        this._buildTagArrayBuffer(4096 * 2, this.ECOpCodes.EC_TAGTYPE_UINT16, 15103, null);
        tagCount++;
        return this._finalizeRequest(tagCount);
    };

    /**
     * < EC_OP_PARTFILE_DELETE opCode:29 size:26 (compressed: 22)
     *     EC_TAG_PARTFILE tagName:768 dataType:9 dataLen:16 = EA63C3774DF2EB871EFA3AC58543B66F
     */
    private getCancelDownloadRequest(e): ArrayBuffer {
        this._setHeadersToRequest(29); // EC_OP_PARTFILE_DELETE
        this._buildTagArrayBuffer(768 * 2, this.ECOpCodes.EC_TAGTYPE_HASH16, e.partfile_hash, null);
        return this._finalizeRequest(1);
    };

    private readSalt(buffer) {
        let offset: number = Uint32Array.BYTES_PER_ELEMENT * 2;
        let dataView: DataView = new DataView(buffer, offset, Uint8Array.BYTES_PER_ELEMENT);
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
            const dv: DataView = new DataView(buffer, offset, 8);// 8 bytes
            for (let i: number = 0; i < 8; i++) {
                let c: string = dv.getUint8(i).toString(16).toUpperCase();
                if (c.length < 2 && i !== 0) {
                    c = '0' + c;
                }
                this.solt += c;
            }
            offset = offset + 8;
        }
        return this.responseOpcode;
    };

    private readBuffer(buffer, byteNumberToRead, littleEndian = false) {
        let val = null;
        const dataView = new DataView(buffer, this.offset, byteNumberToRead);
        if (byteNumberToRead === 1) {
            val = dataView.getUint8(0);
        } else if (byteNumberToRead === 2) {
            val = dataView.getUint16(0, littleEndian);
        } else if (byteNumberToRead === 4) {
            val = dataView.getUint32(0, littleEndian);
        }
        this.offset += byteNumberToRead;
        return val;
    };

    private readBufferChildren(buffer, res, recursivity = 1) {
        res.children = [];

        for (let j = 0; j < res.tagCountInResponse; j++) {
            const child = {
                nameEcTag: this.readBuffer(buffer, 2),
                typeEcOp: this.readBuffer(buffer, 1),
                length: this.readBuffer(buffer, 4), // length without ectag, ecOp, length and tag count BUT with children length
                tagCountInResponse: 0,
                children: [],
                value: ''
            };
            res.length -= (7 + child.length); // remove header length + length

            if (child.nameEcTag % 2) {// if name (ecTag) is odd there is a child count
                child.nameEcTag = (child.nameEcTag - 1) / 2;
                child.tagCountInResponse = this.readBuffer(buffer, 2);
                res.length -= 2;
            } else {
                child.nameEcTag = child.nameEcTag / 2;
            }
            this.readBufferChildren(buffer, child, recursivity + 1);
            res.children.push(child);
        }
        if (recursivity > 1) {
            res.value = this.readValueOfANode(res, buffer);
        }
    };

    private uintToString(uintArray) {
        var encodedString = String.fromCharCode.apply(null, uintArray),
            decodedString = decodeURIComponent(encodedString);
        return decodedString;
    }

    /**
     * Read the value of a node according to its type (typeEcOp) and size in the buffer
     * @returns value
     */
    private readValueOfANode(child2, buffer) {
        if (!child2.length) {
            return '';
        }
        if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_UINT8) { // 2
            child2.value = this.readBuffer(buffer, child2.length);
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_UINT16) { // 3
            child2.value = this.readBuffer(buffer, child2.length);
        }
        else if (child2.typeEcOp === 4) { // integer
            child2.value = this.readBuffer(buffer, child2.length);
        }
        else if (child2.typeEcOp === 5) { // integer 8 bytes
            let high = this.readBuffer(buffer, 4);
            let low = this.readBuffer(buffer, 4);
            let n = high * 4294967296.0 + low;
            if (low < 0) n += 4294967296;
            child2.value = n;
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_OP_STRINGS) { // 6
            if (!this.textDecoder && typeof this.stringDecoder === 'undefined') {
                console.log("you won't be able to read special utf-8 char");
            }
            let uint8array: number[] = [];
            for (let m = 0; m < child2.length; m++) {
                let intValue = this.readBuffer(buffer, 1);
                if (intValue > 0x80) {// wired utf-8 char
                    uint8array.push(intValue);
                } else if (uint8array.length > 0) {// end of wired utf-8 char
                    if (this.textDecoder) { // browser
                        child2.value += this.textDecoder.decode(new Uint8Array(uint8array));
                    } else if (this.stringDecoder) {// nodeJs
                        child2.value += this.stringDecoder.write(Buffer.from(uint8array));
                    }
                    uint8array = [];
                    child2.value += '' + String.fromCharCode(intValue); // work for all javascript engine
                } else {
                    child2.value += '' + String.fromCharCode(intValue);
                }
            }
        }
        else if (child2.typeEcOp === this.ECOpCodes.EC_TAGTYPE_HASH16) { //9
            for (var m = 0; m < child2.length; m = m + 2) {
                let c = this.readBuffer(buffer, 2).toString(16);
                c = ('0000' + c).slice(-4);
                child2.value += c;
            }
            if (child2.value.length != 32) {
                console.log('HASH is false: ' + child2.value + ' -- ' + + child2.value.length);
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
    }

    private _readHeader(buffer): AMuleCliResponse {
        this.offset = 0;
        let response = new AMuleCliResponse();
        response.header = this.readBuffer(buffer, 4);
        // length (total minus header and response Length)
        let responseLength = this.readBuffer(buffer, 4);
        response.totalSizeOfRequest = responseLength + 8;
        // children response length (total minus header, response length, opcode, tag count)
        response.length = responseLength - 3;
        response.opCode = this.readBuffer(buffer, 1);
        response.tagCountInResponse = this.readBuffer(buffer, 2);
        return response;
    }

    private EC_TAG_MAPPING = [{ EC_TAG_PARTFILE_NAME: 769 }, { EC_TAG_PARTFILE_SIZE_DONE: 774 }, { EC_TAG_PARTFILE_SPEED: 775 }, { EC_TAG_PARTFILE_LAST_SEEN_COMP: 785 },
    { EC_TAG_PARTFILE_LAST_RECV: 784 }, { EC_TAG_PARTFILE_COMMENTS: 790 }, { EC_TAG_PARTFILE_HASH: 798 }, { EC_TAG_PARTFILE_SIZE_FULL: 771 }, { EC_TAG_PARTFILE_ED2K_LINK: 782 },
    { EC_TAG_PARTFILE_SOURCE_COUNT: 778 }, { EC_TAG_PARTFILE_SOURCE_COUNT_XFER: 781 }, { EC_TAG_PARTFILE_STATUS: 776 },
    { EC_TAG_KNOWNFILE_FILENAME: 1032 }, { EC_TAG_KNOWNFILE_XFERRED_ALL: 1026 }, { EC_TAG_KNOWNFILE_REQ_COUNT_ALL: 1028 },
    { EC_TAG_PARTFILE_LAST_SEEN_COMP: 785 }, { EC_TAG_PARTFILE_LAST_RECV: 784 }, { EC_TAG_PREFS_GENERAL: 4608 }, { EC_TAG_USER_NICK: 4609 }, { EC_TAG_USER_HASH: 4610 },
    { EC_TAG_PREFS_CONNECTIONS: 4864 }, { EC_TAG_CONN_MAX_UL: 4868 }, { EC_TAG_CONN_MAX_DL: 4867 }, { EC_TAG_CLIENT: 1536 }, { EC_TAG_CLIENT_NAME: 256 },
    { EC_TAG_CLIENT_HASH: 1539 }, { EC_TAG_CLIENT_USER_ID: 1566 }, { EC_TAG_CLIENT_SOFTWARE: 1537 }, { EC_TAG_CLIENT_SOFT_VER_STR: 1557 },
    { EC_TAG_CLIENT_USER_IP: 1552 }, { EC_TAG_CLIENT_USER_PORT: 1553 }, { EC_TAG_CLIENT_DISABLE_VIEW_SHARED: 1563 }, { EC_TAG_CLIENT_OS_INFO: 1577 },
    { EC_TAG_SERVER: 1280 }, { EC_TAG_STATS_LOGGER_MESSAGE: 525 }, { EC_TAG_STATS_TOTAL_SENT_BYTES: 536 }, { EC_TAG_STATS_TOTAL_RECEIVED_BYTES: 537 },
    { EC_TAG_STATS_UL_SPEED: 512 }, { EC_TAG_STATS_DL_SPEED: 513 }, { EC_TAG_STATS_UL_SPEED_LIMIT: 514 }, { EC_TAG_STATS_DL_SPEED_LIMIT: 515 }
    ];

    private _formatResultsList(response): AMuleCliResponse {
        response.children.map(e => {
            this.EC_TAG_MAPPING.map(REF => {
                Object.keys(REF).map(key => {
                    if (!e.children.length && e.nameEcTag === REF[key]) {
                        response[key.split('EC_TAG_')[1].toLowerCase()] = e.value;
                    }
                });
            });
            if (!e.length) {
                delete e.value;
            }
            delete e.length;
            delete e.tagCountInResponse;
            if (e.children && !e.children.length) {
                delete e.children;
            } else {
                this._formatResultsList(e);
            }
        });
        this.EC_TAG_MAPPING.map(REF => {
            Object.keys(REF).map(key => {
                if (response.nameEcTag === REF[key]) {
                    response['label'] = key.split('EC_TAG_')[1].toLowerCase();
                }
            });
        });
        if (response['knownfile_xferred_all']) {
            response['sharedRatio'] = response['knownfile_xferred_all'] / response['partfile_size_full'];
        }
        if (response['partfile_size_done']) {
            response['completeness'] = Math.floor(response['partfile_size_done'] * 10000 / response['partfile_size_full']) / 100;
        }
        return response;
    }
    private readResultsList(buffer): Promise<AMuleCliResponse> {
        return new Promise<AMuleCliResponse>((resolve, reject) => {
            let response = this._readHeader(buffer);
            switch (response.opCode) {
                case 1: response.opCodeLabel = 'EC_OP_NOOP'; break;
                case 5: response.opCodeLabel = 'EC_OP_FAILED'; break;
                case 31: response.opCodeLabel = 'EC_OP_DLOAD_QUEUE'; break;
                case 40: response.opCodeLabel = 'EC_OP_SEARCH_RESULTS'; break;
                default: ;
            }
            this.readBufferChildren(buffer, response);
            this._formatResultsList(response);
            resolve(response);
        });
    };

    private client = null; // node socket
    private socketId; // chrome API socket id

    private toBuffer(ab) {
        return new Buffer(new Uint8Array(ab));
    }

    private toArrayBuffer(buf) {
        return new Uint8Array(buf).buffer;
    }

    /**
     * Create a TCP socket with the server.
     */
    private initConnToServer(ip, port) {
        return new Promise((resolve, reject) => {
            if (typeof chrome !== 'undefined') {
                console.log("using chrome API");
                chrome.sockets.tcp.create({}, r => {
                    this.socketId = r.socketId;
                    chrome.sockets.tcp.connect(r.socketId, ip, port, code => resolve(code));
                });
            } else {
                this.client = new net.Socket(); // return a Node socket
                this.client.connect(port, ip);
                this.client.on('connect', () => resolve());
            }
        });
    };

    private sendToServer_simple(data) {
        return new Promise((resolve, reject) => {
            if (typeof chrome !== 'undefined') {
                chrome.sockets.tcp.send(this.socketId, data, r => { });
                chrome.sockets.tcp.onReceive.addListener(receiveInfo => resolve(receiveInfo.data));
            } else {
                this.client.write(this.toBuffer(data));
                this.client.on('data', data => resolve(this.toArrayBuffer(data)));
            }
        });
    };

    private sendToServer(data) {
        return new Promise((resolve, reject) => {

            let buf = [], totalSizeOfRequest, frequency = 100, timeout = 200, count = 0;

            if (typeof chrome !== 'undefined') {
                chrome.sockets.tcp.send(this.socketId, data, r => { });
                chrome.sockets.tcp.onReceive.addListener(r => buf.push(r.data));
            } else {
                this.client.write(this.toBuffer(data));
                this.client.on('data', data => buf.push(this.toArrayBuffer(data)));
            }

            const intervalId = setInterval(() => {
                if (buf[0]) {
                    totalSizeOfRequest = this._readHeader(buf[0]).totalSizeOfRequest;
                    let bl = 0;
                    buf.forEach(b => {
                        bl += b.byteLength;
                    });
                    if (bl >= totalSizeOfRequest) {
                        const buffer = new ArrayBuffer(bl);
                        let o = 0;
                        buf.forEach(b => {
                            for (let j = 0; j < b.byteLength; j++) {
                                let fromArrayView = new Uint8Array(b, j, 1);
                                let toArrayView = new Uint8Array(buffer, j + o, 1);
                                toArrayView.set(fromArrayView);
                            }
                            o = o + b.byteLength;
                        });
                        clearInterval(intervalId);
                        resolve(buffer);
                    }
                }
                if (count++ > timeout) {
                    console.error('time out expired for this TCP request');
                    clearInterval(intervalId);
                }
            }, frequency);
        });
    };

    public connect() {
        return this.initConnToServer(this.ip, this.port).then(() => {
            return this.sendToServer_simple(this.getAuthRequest1());
        }).then(data => {
            this.readSalt(data);
            return this.sendToServer_simple(this._getAuthRequest2());
        }).then(data => {
            if (this.readSalt(data) === 4) {
                return ('You are successfuly connected to amule');
            }
            else {
                throw ('You are NOT connected to amule');
            }
        }).catch(err => {
            throw ('\n\nYou are NOT connected to amule: ' + err);
        });
    };

    private isRunningPromise: boolean = false;
    /**
     * Make the promises flow synchronized
     */
    private sendToServerWhenAvalaible(r: ArrayBuffer): Promise<AMuleCliResponse> {
        if (!this.isRunningPromise) {
            this.isRunningPromise = true;
            return this.sendToServer(r).then(data => {
                this.isRunningPromise = false;
                return this.readResultsList(data)
            });
        } else {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve(this.sendToServerWhenAvalaible(r));
                }, 400);
            });
        }
    }
    private filterResultList(list: AMuleCliResponse, q: string, strict: boolean): AMuleCliResponse {
        if (strict && list.children) {
            list.children = list.children.filter(e => {
                let isPresent = true;
                q.split(' ').map(r => {
                    if (e['partfile_name'] && e['partfile_name'].toLowerCase().indexOf(r) === -1) {
                        isPresent = false;
                    }
                });
                return isPresent;
            });
        }
        return list;
    }


    /**
     * Search on the server
     * 
     */
    public search(q: string, searchType: number = this.EC_SEARCH_TYPE.EC_SEARCH_KAD, strict = true): Promise<AMuleCliResponse> {
        q = q.trim();
        return this.sendToServerWhenAvalaible(this._getSearchStartRequest(q, searchType)).then(res => {
            if (searchType === this.EC_SEARCH_TYPE.EC_SEARCH_KAD) {
                return new Promise((resolve, reject) => {
                    let timeout = 120, frequency = 1500, count = 0, isSearchFinished = false;
                    const intervalId = setInterval(() => {
                        if (isSearchFinished) {
                            clearInterval(intervalId);
                            this.fetchSearch().then(list => {
                                resolve(this.filterResultList(list, q, strict));
                            })
                        }
                        this.sendToServerWhenAvalaible(this._isSearchFinished()).then(res => {
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
            } else if (searchType === this.EC_SEARCH_TYPE.EC_SEARCH_LOCA) {
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        this.fetchSearch().then(list => {
                            resolve(this.filterResultList(list, q, strict));
                        })
                    }, 1500);
                });
            }
        });
    }

    public fetchSearch(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getSearchResultRequest());
    }

    /**
     * get all the files being currently downloaded
     */
    public getDownloads(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getDownloadsRequest()).then(elements => {
            elements.children.map(f => {
                ['partfile_last_recv', 'partfile_last_seen_comp'].map(key => {
                    if (f[key]) {
                        f[key + '_f'] = new Date(f[key] * 1000);
                    }
                });
                ['partfile_speed'].map(key => {
                    if (!f[key]) {
                        f[key] = 0;
                    }
                });
                delete f.children;
            });

            return elements;
        });
    }

    /**
     * download a file in the search list
     * 
     * @param e file to download (must have a hash)
     */
    public download(e): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.downloadRequest(e));
    }

    /**
     * return the list of shared files
     */
    public getSharedFiles(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getSharedFilesRequest()).then(elements => {
            elements.children.map(f => {
                ['knownfile_req_count_all', 'sharedRatio'].map(key => {
                    if (!f[key]) {
                        f[key] = 0;
                    }
                });
                delete f.children;
            });
            return elements;
        });
    }

    /**
     * 
     */
    public getDetailUpdate(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getStatsRequest(82));
    }
    public clearCompleted(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.clearCompletedRequest());
    }
    public getStatistiques(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getStatsRequest(10));
    }
    public cancelDownload(e): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getCancelDownloadRequest(e));
    }

    /**
     * get user preferences (EC_OP_GET_PREFERENCES)
     */
    public getPreferences(): Promise<AMuleCliResponse> {
        return this.sendToServerWhenAvalaible(this.getPreferencesRequest());
    }

}