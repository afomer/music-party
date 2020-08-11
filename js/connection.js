
/*

There are two main ways to connect:
1- Connecting as a Host of a Party
2- Connecting as a Listener

The difference is that hosts store a "listeners array"

*/
const config    = {}
let   listeners = {}
let remotePeerConnection = null

/* Creating a party */
const socket = io("http://localhost:3000")
let   ID     = null

// Getting an ID
socket.on('init', ({ id }) => ID=id)

socket.on('message', async ({ from, data }) => {

    console.log('from: ', from, 'recieved: ', data)
    // unknown listener
    const remotePeer = listeners[from] || remotePeerConnection
    if (remotePeer == null) {
        return;
    }

    if (data.description) {
        remotePeer.setRemoteDescription(data.description)
        if (data.description.type == 'offer') {
            const answer = await remotePeer.createAnswer()
            socket.emit('message', { to: from, data: { description: answer } })
        }
    } else if (data.candidate) {
        remotePeer.addIceCandidate(data.candidate)
    }

})



// Add Listners as they come

document.getElementById('room-create').onclick = (e) => {
    console.log('CREATE A ROOM')
    socket.on('listener', async ({ from, description }) => {
        console.log('Got message from', from, description)
        const peerConnection = new RTCPeerConnection(config)

        // Link tracks to this guy
        console.log(remoteStream)
        if (remoteStream) {
            console.log('remoteStream', remoteStream)
            peerConnection.addStream(remoteStream)
        }

        // Take care of ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('message', { to: from, data: { candidate: event.candidate } })
            }
        }

        // on re-negotiations create offer, and send it
        peerConnection.onnegotiationneeded = () => {
            peerConnection.createOffer()
            .then((offer) => {
                peerConnection.setLocalDescription(offer)
                return offer
            })
            .then(offer => socket.emit('message', { to: from, data: { description: offer } }))
        }

        // Answer the SDP description offer
        await peerConnection.setRemoteDescription(description)
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)
        listeners[from] = peerConnection

        console.log('answer: ', answer)

        socket.emit('message', { to: from,  data: { description: answer } })

    })

    e.target.textContent = `Party ID: ${ID}`
    console.log(e.target.textContent)
}


/* For Listeners */

// Join a host
document.getElementById("room-input-form").onsubmit = (e) => {
    const partyID = document.getElementById('room-input').value

    remotePeerConnection = new RTCPeerConnection(config)
    remotePeerConnection.onsignalingstatechange = (e) => {
        if (remotePeerConnection.signalingState == 'stable') {
            document.getElementById("room-create").setAttribute("connectionID", partyID)
            document.getElementById("room-create").setAttribute("state", "connected")
        }
        console.log('signalingState:', remotePeerConnection.signalingState)
    }
    remotePeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('message', { to: from,  data: { candidate: event.candidate } })
        }
    }
    remotePeerConnection.onnegotiationneeded = async () => {
        const offer = await remotePeerConnection.createOffer()
        await remotePeerConnection.setLocalDescription(offer)
        socket.emit(partyID, { data: { description: offer } })
    }

    remotePeerConnection.ontrack = ({ track, streams }) => {
        console.log('track & streams: ', track, streams)
        track.onunmute = () => {
            if (!$audio_player.srcObject) {
                $audio_player.srcObject = streams[0]
            }
        }
    }

    remotePeerConnection.createOffer()
    .then((offer) => {
        remotePeerConnection.setLocalDescription(offer)
        return offer
    })
    .then(offer => {
        socket.emit('join', { to: partyID, data: { description: offer } })
    })


    // prevents the page from refreshing
    return false;
}
