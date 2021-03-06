const BUFFER_LIMIT = 15 * 1024 // ~15.36KB < 16KB Chrome Buffer limit
const CHUNKID_SIZE_IN_NUM_OF_BYTES = 1
const CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES = 7
const CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES = 1
const CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES = 7
const FILEID_SIZE_IN_NUM_OF_BYTES = 1
const FILEID_VALUE_SIZE_IN_NUM_OF_BYTES = 7
const BYTE_SIZE_IN_BITS = 8
const HEADER_SIZE  = (
    FILEID_SIZE_IN_NUM_OF_BYTES +
    FILEID_VALUE_SIZE_IN_NUM_OF_BYTES +
    CHUNKID_SIZE_IN_NUM_OF_BYTES +
    CHUNCKID_VALUE_SIZE_IN_NUM_OF_BYTES +
    CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES +
    CHUNKTOTAL_VALUE_SIZE_IN_NUM_OF_BYTES
)

document.addEventListener("NEXT_CHUNKS", async (e) => {
    console.log("NEXT_CHUNKS: ", e.detail)
    for (chunk of e.detail.chunks) {
        await sendArrayBuffer(chunk)
    }
})


const CHUNCK_SIZE  = BUFFER_LIMIT - HEADER_SIZE

function sendChunk(dataChannel, data) {

    function sendChunkHelper(dataChannel, data, resolve) {
        /** if the buffer can afford to put the data chunk, then put it */
        if (dataChannel.bufferedAmount + data.byteLength <= BUFFER_LIMIT ) {
            dataChannel.send(data)
            resolve()
        } else {
            /** otherwise check in 10ms */
            setTimeout(() => sendChunkHelper(dataChannel, data, resolve), 10)
        }
    }

    return new Promise((resolve, _) => sendChunkHelper(dataChannel, data, resolve))
}

/**
* Array Buffer Structure
* [ How Many Bytes is fileID | fileID | How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
* [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 24 Bytes) ]
* (Chunk Data is the remaining of the sent arraybuffer/packet)
*
* Shifts (<< and >>) treat numbers as set of 32-bit values, 32/8 = 4 bytes necessary for representation
* Number.MAX_SAFE_INTEGER = 2**53 - 1, Math.ceil(53/8) = 7 bytes necessary for representation
*
*/

/**
 * Prepend Metadata to data according to the structure:
 * [ How Many Bytes is fileID | fileID | How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
 *
 * @param {ArrayBuffer} data
 * @param {Integer} chunkID
 * @param {Integer} chunkTotal
 * @param {Integer} fileID
 */
const MAX_POSITIVE_INTEGER = 2**32 - 1


// fileID is defaulted to 0
function getPacketStructure(data, chunkID, chunkTotal, fileID = 0) {

    if (fileID > MAX_POSITIVE_INTEGER || chunkID > MAX_POSITIVE_INTEGER || chunkTotal > MAX_POSITIVE_INTEGER) {
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

    // Calculate the size of chunk from "data"
    const dataStart = chunkID * CHUNCK_SIZE
    const dataEnd   = Math.min(dataStart + CHUNCK_SIZE, data.byteLength)
    let   dataByteLength = dataEnd - dataStart
    const totalArrayBufferSize = HEADER_SIZE + dataByteLength

    console.log({totalArrayBufferSize, dataStart, dataEnd, dataByteLength})

    let   resultArrayBuffer = new ArrayBuffer(totalArrayBufferSize)
    const resultArrayBufferDataView = new DataView(resultArrayBuffer)

    /*
    * Complete Strucutre Overview:
    *
    * [ How Many Bytes is fileID | fileID | How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
    * [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 24 Bytes) ]
    */
    let offset = 0

    // [How Many Bytes is fileID]
    resultArrayBufferDataView.setUint8(offset, FILEID_VALUE_SIZE_IN_NUM_OF_BYTES)
    offset += FILEID_SIZE_IN_NUM_OF_BYTES


    // [fileID]
    for (const i of [...Array(FILEID_VALUE_SIZE_IN_NUM_OF_BYTES).keys()]) {
        resultArrayBufferDataView.setUint8(i + offset, (fileID >> (BYTE_SIZE_IN_BITS * i)) & 0xFF)
    }
    offset += FILEID_VALUE_SIZE_IN_NUM_OF_BYTES

    // [How Many Bytes is ChunkID]
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
    const dataDataView = new DataView(data)
    for (let i = dataStart; i < dataEnd; i++) {
        //console.log(i-dataStart, dataDataView.getUint8(i))
        resultArrayBufferDataView.setUint8(offset, dataDataView.getUint8(i))
        offset += 1
    }

    return resultArrayBuffer
}

//TODO rename to sendArrayBufferChunk
async function sendArrayBuffer(arrBuff) {
    const totalNumOfBytes  = arrBuff.byteLength
    const totalNumOfChunks = Math.ceil(totalNumOfBytes / CHUNCK_SIZE)

    for (let chunkID = 0; chunkID < totalNumOfChunks; chunkID += 1) {
        // Make totalNumOfChunks 0-indexed
        const arrayBufferPacket = getPacketStructure(arrBuff, chunkID, totalNumOfChunks-1) // chunkTotal is 0-indexed
        console.log('Send Progress: ', `${Math.round(chunkID/totalNumOfChunks * 100)}%`, {chunkID, totalNumOfChunks, totalNumOfBytes})
        await sendChunk(Party.dataChannel, arrayBufferPacket)
    }

    console.log('\nSuccessfully Sent\n')
}

function readArrayBufferChunk(arrBuff) {

    const arrBuffDataView = new DataView(arrBuff)

    /*
    * [ How Many Bytes is fileID | fileID | How Many Bytes is ChunkID | ChunkID | How Many bytes in ChunkTotal | Total number of chunks | Data ]
    * [ 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | 7 (constant, 1-Byte) | 7-Byte number | Data ~(15KB - 24 Bytes) ]
    */
    let offset = 0

    // [How Many Bytes is fileID]
    const fileIDSizeInBytes = arrBuffDataView.getUint8(offset)
    offset += FILEID_SIZE_IN_NUM_OF_BYTES


    // [fileID]
    let fileID = 0
    for (const i of [...Array(fileIDSizeInBytes).keys()]) {
        fileID = fileID | (arrBuffDataView.getUint8(i + offset) << (i * BYTE_SIZE_IN_BITS))
    }
    offset += fileIDSizeInBytes

    // [How Many Bytes is ChunkID]
    const chunkIDSizeInBytes = arrBuffDataView.getUint8(offset)
    offset += CHUNKID_SIZE_IN_NUM_OF_BYTES // 1-Byte constant value


    // [ChunkID]
    let chunkID = 0
    for (const i of [...Array(chunkIDSizeInBytes).keys()]) {
        chunkID = chunkID | (arrBuffDataView.getUint8(i + offset) << (i * BYTE_SIZE_IN_BITS))
    }
    offset += chunkIDSizeInBytes

    // [How Many bytes in ChunkTotal]
    const chunkTotalSizeInBytes = arrBuffDataView.getUint8(offset)
    offset += CHUNKTOTAL_SIZE_IN_NUM_OF_BYTES // 1-Byte constant value

    // [ChunkTotal]
    let chunkTotal = 0
    for (const i of [...Array(chunkTotalSizeInBytes).keys()]) {
        chunkTotal = chunkTotal | (arrBuffDataView.getUint8(i + offset) << (i * BYTE_SIZE_IN_BITS))
    }

    offset += chunkTotalSizeInBytes

    // [Data]
    const dataSlice = arrBuff.slice(offset, arrBuff.byteLength)

    return {
        "fileID": fileID,
        "chunkID": chunkID,
        "chunkTotal": chunkTotal,
        "data": dataSlice
    }
}

//Testing
/*
const ab = new Uint8Array([
    12, 14, 15
])
console.log(readArrayBufferChunk(getPacketStructure(ab.buffer, 0, 6)), ab.buffer)
*/