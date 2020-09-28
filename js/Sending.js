const BUFFER_LIMIT = 15 * 1024 // ~15.36KB < 16KB Chrome Buffer limit
const CHUNCK_SIZE  = BUFFER_LIMIT

function sendChunk(dataChannel, data) {

    function sendChunkHelper(dataChannel, data, resolve) {
        /** if the buffer can afford to put the data chunk, then put it */
        if (dataChannel.bufferedAmount + data.byteLength <= BUFFER_LIMIT ) {
            dataChannel.send(data)
            resolve()
        } else {
            /** otherwise check in 90ms */
            setTimeout(() => sendChunkHelper(dataChannel, data, resolve), 10)
        }
    }

    return new Promise((resolve, _) => sendChunkHelper(dataChannel, data, resolve))
}

/**
* Array Buffer Structure
* [ How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
* [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 16 Bytes) ]
* (Chunk Data is the remaining of the sent arraybuffer/packet)
*
* Shifts (<< and >>) treat numbers as set of 32-bit values, 32/8 = 4 bytes necessary for representation
* Number.MAX_SAFE_INTEGER = 2**53 - 1, Math.ceil(53/8) = 7 bytes necessary for representation
*
*/
const CHUNKID_SIZE_IN_NUM_OF_BYTES = 1
const CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES = 7
const CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES = 1
const CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES = 7
const BYTE_SIZE_IN_BITS = 8

/**
 * Prepend Metadata to data according to the structure:
 * [ How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
 *
 * @param {ArrayBuffer} data
 * @param {Integer} chunkID
 * @param {Integer} chunkTotal
 */
const MAX_POSITIVE_INTEGER = 2**32 - 1

function getPacketStructure(data, chunkID, chunkTotal) {

    if (chunkID > MAX_POSITIVE_INTEGER || chunkTotal > MAX_POSITIVE_INTEGER) {
        throw Error('The ChunkID or chunkTotal value is greater than 2^(32)-1. Total file size should be up to 67553.99 Terabytes')
    }

    // Handle invalid input
    if (!data || !(data instanceof ArrayBuffer) ) {
        throw Error(`No data provided, instead what's provided: ${!data}`)
    } else if (Number.isNaN(chunkID)) {
        throw Error(`No data provided, instead what's provided: ${chunkID}`)
    } else if (Number.isNaN(chunkTotal)) {
        throw Error(`No data provided, instead what's provided: ${chunkTotal}`)
    }

    const totalArrayBufferSize = (CHUNKID_SIZE_IN_NUM_OF_BYTES + CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES +
        CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES + CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES + data.byteLength)

    let   resultArrayBuffer = new ArrayBuffer(totalArrayBufferSize)
    const resultArrayBufferDataView = new DataView(resultArrayBuffer)


    /*
    * Complete Strucutre Overview:
    *
    * [ How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Chunk Data ]
    * [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 16 Bytes) ]
    */

    // [How Many Bytes is ChunkID]
    let offset = 0
    resultArrayBufferDataView.setUint8(offset, CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES)
    offset += CHUNKID_SIZE_IN_NUM_OF_BYTES


    // [ChunkID]
    for (const i of [...Array(CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES).keys()]) {
        resultArrayBufferDataView.setUint8(i + offset, (chunkID >> (BYTE_SIZE_IN_BITS * i)) & 0xFF)
    }
    offset += CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES

    // [How Many bytes in ChunkTotal]
    resultArrayBufferDataView.setUint8(offset, CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES)
    offset += CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES

    // [ChunkTotal]
    for (const i of [...Array(CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES).keys()]) {
        resultArrayBufferDataView.setUint8(i + offset, (chunkTotal >> (BYTE_SIZE_IN_BITS * i)) & 0xFF)
    }

    offset += CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES

    // [Data]
    for (const i in data) {
        resultArrayBufferDataView.setUint8(i + offset, dataSlice[i])
    }

    offset += data.byteLength

    return resultArrayBuffer
}

//TODO rename to sendArrayBufferChunk
async function sendArrayBuffer(arrBuff) {
    const totalNumOfBytes  = arrBuff.byteLength
    const totalNumOfChunks = Math.ceil(totalNumOfBytes / CHUNCK_SIZE)

    for (let chunkID = 0; chunkID <= totalNumOfChunks; chunkID += 1) {
        console.log('Send Progress: ', chunkID)
        await sendChunk(Party.dataChannel, getPacketStructure(arrBuff, chunkID, totalNumOfChunks))
    }

    await sendChunk(Party.dataChannel, arrBuff.slice(arrBuff.byteLength-1,))
}

function readArrayBufferChunk(arrBuff) {

    const arrBuffDataView = new DataView(arrBuff)

    /*
    * [ How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Chunk Data ]
    * [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 16 Bytes) ]
    */
    // [How Many Bytes is ChunkID]
    let offset = 0
    const chunkIDSizeInBytes = arrBuffDataView.getUint8(0)
    offset += 1 // 1-Byte constant value


    // [ChunkID]
    chunkID = 0
    for (const i of [...Array(chunkIDSizeInBytes).keys()]) {
        chunkID = chunkID | (arrBuffDataView.getUint8(i + offset) << (i * BYTE_SIZE_IN_BITS))
    }
    offset += chunkIDSizeInBytes

    // [How Many bytes in ChunkTotal]
    const chunkTotalSizeInBytes = arrBuffDataView.getUint8(offset)
    offset += 1 // 1-Byte constant value

    // [ChunkTotal]
    chunkTotal = 0
    for (const i of [...Array(chunkTotalSizeInBytes).keys()]) {
        chunkTotal = chunkTotal | (arrBuffDataView.getUint8(i + offset) << (i * BYTE_SIZE_IN_BITS))
    }

    offset += chunkTotalSizeInBytes

    // [Data]
    const dataSlice = arrBuff.slice(offset, arrBuff.byteLength - 1)

    return {
        "chunkID": chunkID,
        "chunkTotal": chunkTotal,
        "data": dataSlice
    }
}

const ab = new ArrayBuffer(10)
const dataView = new DataView(ab)

console.log(/*getPacketStructure(ab, 239487, 10), */ readArrayBufferChunk(getPacketStructure(ab, 10129, 123230928030)))