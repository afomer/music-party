
/*

There are two main ways to connect:
1- Connecting as a Host of a Party
2- Connecting as a Listener

The difference is that hosts store a "listeners array"

*/
/* Global Variables */
const config    = {}
let   listeners = null
let remotePeerConnection = null
let makingOffer = false
let ignoreOffer = false

/* STATES */
// There are two main states maintained, listener and host
// at every point in time you are either one of them
// the default is listener
/* Creating a party */
const socket = io("http://localhost:3000")
let   ID     = null

const IDLE = "IDLE"
const LISTENER = "LISTENER"
const HOST = "HOST"
const STATES = Object.freeze({ IDLE: 0, LISTENER: 1, HOST: 2 })


let CURRENT_STATE = STATES.IDLE
const changeStateTo = (newSTATE) => {
    CURRENT_STATE = STATES[newSTATE] || STATES.IDLE
    console.log(CURRENT_STATE, newSTATE)
    switch(CURRENT_STATE) {
        case STATES.LISTENER:
            socket.off("listener")
            remotePeerConnection = null
            break;

        case STATES.HOST:
            listeners = {}
            break;

        case STATES.IDLE:
            listeners = null
            socket.off("listener")
            remotePeerConnection = null
            break;
    }

}



// Getting an ID from the server
socket.on('init', ({ id }) => ID = id)
socket.on("disconnected", ({ id }) => {
    switch(CURRENT_STATE) {
        case STATES.LISTENER:
            remotePeerConnection = null
            break;

        case STATES.HOST:
            listeners[id] = null

        default:
            break;
    }
})


/* (1) Handling Offer/Answer restart, to avoid glare, is as follows:
   The peer with the smaller ID answers the offer
*/

// .on('message') assumes that the other party have a host or listener relationship
// with the other peer, and using out-of-band communication to reach them
// for either: connection establishment or ICE restart

socket.on('message', async ({ from, data }) => {

    console.log('from: ', from, 'recieved: ', data)

    const remotePeer = CURRENT_STATE == STATES.HOST ? listeners[from] : remotePeerConnection

    // If the remote peer is not recognized, ignore the message
    if (remotePeer == null) {
        return;
    }

    if (data.description) {

        // Offer collision, when you're making an offer and you recieve an Offer or made/accepted an offer.
        const offerCollision = data.description.type == "offer" && (makingOffer || remotePeer.signalingState != "stable")

        // ignore offers according to (1)
        // namely, ignore the offer, if there's an offer collision, and
        // you have a bigger ID (you're the "bigger" peer, and don't answer offers when you made an offer already)
        ignoreOffer = offerCollision && (ID > from)
        if (ignoreOffer) {
            return;
        }

        // Otherwise, it's either an SDP anwer or you're the "smaller" peer,
        // so, you accept the offer, and send your SDP anwer

        // If it's an SDP answer, or you're the smaller peer. In both cases you will setRemote
        await remotePeer.setRemoteDescription(data.description)

        // Refer to (1) to handle accepting offers
        // In case, you reached here and it's an offer. You're the smaller peer. Accept it, send your answer
        if (data.description.type == 'offer') {
            await remotePeer.setLocalDescription()
            socket.emit('message', { to: from, data: { description: remotePeer.localDescription } })
        }

    } else if (data.candidate) {

        try {
            remotePeer.addIceCandidate(data.candidate)
        } catch (error) {
            if (!makingOffer) {
                throw error
            }
        }

    }

})

const addAudioToStream = () => {

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaElementSource($audio_player)
    const remoteStreamDestination = audioCtx.createMediaStreamDestination();
    const speakersGain = audioCtx.createGain()
    const remoteGain   = audioCtx.createGain()

    source.connect(speakersGain)
    source.connect(remoteGain)

    speakersGain.connect(audioCtx.destination)
    remoteGain.connect(remoteStreamDestination)

    switch(CURRENT_STATE) {
        case STATES.HOST:
            for (const key in listeners) {
                console.log(remoteStreamDestination)
                listeners[key].addStream(remoteStreamDestination.stream)
            }
            break;
        case STATES.LISTENER:
            break;
        default:
            break;
    }


}

// Add Listners as they come
const createRoom = () => {

    try {
        changeStateTo(HOST)
        console.log('CREATE A ROOM')
        socket.on('listener', async ({ from, description }) => {
            console.log('Got message from', from, description)
            const peerConnection = new RTCPeerConnection(config)

            // Link tracks to this guy
            console.log(remoteStream)

            // Take care of ICE candidates
            peerConnection.onicecandidate = (event) => {
                console.log('ICE: ', event)
                if (event.candidate) {
                    socket.emit('message', { to: from, data: { candidate: event.candidate } })
                }
            }

            peerConnection.onsignalingstatechange = (e) => {
                console.log('signalingState:', peerConnection.signalingState, 'connectionState: ', peerConnection.connectionState, '- from:', from)
            }

            // on re-negotiations create offer, and send it
            peerConnection.onnegotiationneeded = async () => {
                console.log(peerConnection.signalingState)
                makingOffer = true
                const offer = await peerConnection.createOffer()
                await peerConnection.setLocalDescription(offer)
                socket.emit('message', { to: from, data: { description: offer } })
                makingOffer = false
            }

            // Answer the SDP description offer
            listeners[from] = peerConnection
            await peerConnection.setRemoteDescription(description)
            const answer = await peerConnection.createAnswer()
            await peerConnection.setLocalDescription(answer)
            window.pc = peerConnection

            socket.emit('message', { to: from,  data: { description: answer } })
        })

        return true

    } catch (e) {
        return false
    }

}

/* For Listeners */


// Join a host
const joinAhost = () => {

    changeStateTo(LISTENER)

    const partyID = document.getElementById('room-input').value

    remotePeerConnection = new RTCPeerConnection(config)
    window.pc = remotePeerConnection
    remotePeerConnection.onsignalingstatechange = (e) => {
        if (remotePeerConnection.signalingState == 'stable') {
            document.getElementById("room-create").setAttribute("connectionID", partyID)
            document.getElementById("room-create").setAttribute("state", "connected")
        }
        console.log('signalingState:', remotePeerConnection.signalingState, '- ConnectionState:', remotePeerConnection.connectionState)
    }

    remotePeerConnection.onicecandidate = (event) => {
        console.log('ICE: ', event)
        if (event.candidate) {
            socket.emit("message", { to: partyID,  data: { candidate: event.candidate } })
        }
    }

    remotePeerConnection.onnegotiationneeded = async () => {
        makingOffer = true
        const offer = await remotePeerConnection.createOffer()
        await remotePeerConnection.setLocalDescription(offer)
        socket.emit("message", { to: partyID, data: { description: offer } })
        makingOffer = false
    }

    remotePeerConnection.ontrack = ({ track, streams }) => {
        console.log('onTrack: ', streams[0].active)
        track.onunmute = () => {
            console.log('track & streams: ', track, streams[0], streams[0].active)
            if (!$audio_player.srcObject) {
                $audio_player.srcObject = streams[0]
            }
        }
    }

    makingOffer = true
    remotePeerConnection.createOffer()
    .then((offer) => {
        remotePeerConnection.setLocalDescription(offer)
        return offer;
    })
    .then(offer => {
        socket.emit('join', { to: partyID, data: { description: offer } })
        makingOffer = false
    })


    // prevents the page from refreshing
    return false;
}
