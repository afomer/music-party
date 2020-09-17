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

async function sendArrayBuffer(arrBuff) {
    for (let i = 0; i <= arrBuff.byteLength; i += CHUNCK_SIZE) {
        const dataSlice = arrBuff.slice(i, i + CHUNCK_SIZE)
        console.log('Send Progress: ', (i / arrBuff.byteLength) * 100)
        await sendChunk(Party.dataChannel, dataSlice)
    }
    await sendChunk(Party.dataChannel, arrBuff.slice(arrBuff.byteLength-1,))
}