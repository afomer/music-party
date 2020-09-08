
/*

There are two main ways to connect:
1- Connecting as a Host of a Party
2- Connecting as a Listener

The difference is that hosts store a "listeners array"

*/

/* Global Variables */
const SERVER_ADDRESS = "http://192.168.1.11:3000"

/* STATES */
// There are two main states maintained, listener and host
// at every point in time you are either one of them
// the default is listener
/* Creating a party */

class Connection {

    constructor(server_address) {
        this.config    = {}
        this.listeners = null
        this.socket = io(server_address)
        this.makingOffer  = false
        this.ignoreOffer = false
        this.remotePeerConnection = null
        this.ID       = null
        this.LISTENER = "LISTENER"
        this.HOST = "HOST"
        this.IDLE = "IDLE"
        this.STATES = Object.freeze({ IDLE: 0, LISTENER: 1, HOST: 2 })
        this.CURRENT_STATE = this.STATES.IDLE
    }

    changeStateTo(FromSTATE, newSTATE) {

        this.CURRENT_STATE = this.STATES[FromSTATE]

        console.log(this.CURRENT_STATE, newSTATE)

        switch(this.CURRENT_STATE) {
            case this.STATES.LISTENER:
                this.remotePeerConnection = null
                break;

            case this.STATES.HOST:

                for (const i in this.listeners) {
                    this.listeners[i].pc.close()
                }

                this.socket.off("listener")
                this.listeners = {}
                break;

            case this.STATES.IDLE:
                this.socket.off("listener")
                this.listeners = {}
                this.remotePeerConnection = null
                break;
        }
    }

    addAudioToStream() {

        switch(this.CURRENT_STATE) {
            case this.STATES.HOST:
                for (const key in this.listeners) {
                    console.log(remoteStreamDestination)
                    this.listeners[key].addStream(remoteStreamDestination.stream)
                }
                break;
            case this.STATES.LISTENER:
                break;
            default:
                break;
        }

    }

    async fromLocalOfferToBackStable(peer) {
        try {
            await peer.setLocalDescription(await peer.createAnswer())
        } catch (err) {}
    }

    init() {

        // Getting an ID from the server
        this.socket.on('init', ({ id }) => this.ID = id)
        this.socket.on("disconnected", ({ id }) => {
            switch(this.CURRENT_STATE) {
                case this.STATES.LISTENER:
                    this.remotePeerConnection = null
                    break;

                case this.STATES.HOST:
                    this.listeners[id] = null

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

        this.socket.on('message', async ({ from, data }) => {

            console.log('from: ', from, 'recieved: ', data)

            const remotePeer = this.CURRENT_STATE == this.STATES.HOST ? this.listeners[from] : this.remotePeerConnection

            // If the remote peer is not recognized, ignore the message
            if (remotePeer == null) {
                return;
            }

            if (data.description) {

                // Offer collision, when you're making an offer and you recieve an Offer or made/accepted an offer.
                const offerCollision = data.description.type == "offer" && (this.makingOffer || remotePeer.signalingState != "stable")

                // ignore offers according to (1)
                // namely, ignore the offer, if there's an offer collision, and
                // you have a bigger ID (you're the "bigger" peer, and don't answer offers when you made an offer already)
                this.ignoreOffer = offerCollision && (this.ID > from)
                if (this.ignoreOffer) {
                    return;
                }

                // Otherwise, it's either an SDP anwer or you're the "smaller" peer,
                // so, you accept the offer, and send your SDP answer



                // Refer to (1) to handle accepting offers
                // In case, you reached here and it's an offer. You're the smaller peer. Accept it, send your answer
                /*if (data.description.type == 'offer') {

                    let answer = remotePeer.createAnswer()

                    console.log(remotePeer.connectionState)

                    try {
                        await remotePeer.setLocalDescription(answer)
                    } catch (err) {
                        const ret = await remotePeer.setRemoteDescription(data.description)
                        answer = await remotePeer.createAnswer(data.description)
                        await remotePeer.setLocalDescription(answer).catch(console.error)
                    }

                    this.socket.emit('message', { to: from, data: { description: answer } })
                }
                */

                // If it's an SDP answer, to a previous offer, accept it
                if (data.description.type == "answer") {
                    await remotePeer.setRemoteDescription(data.description)
                }
                else if (data.description.type == 'offer') {
                    // It's an offer, and you're stable or you're the smaller peer
                    // (in which you will always accept and drop your current unstable state).

                    // As the smaller peer: if you sent and offer and recieved offer.
                    // Disregard your offer, and go back to "new" state
                    console.log(remotePeer.signalingState, '<<<<----')

                    if (remotePeer.signalingState == "have-local-offer") {
                        // reset state to new
                        await this.fromLocalOfferToBackStable()
                    }

                    // new => have-local-answer
                    await remotePeer.setRemoteDescription(data.description)

                    // have-local-answer => stable (connected)
                    const answer = await remotePeer.createAnswer(data.description)
                    await remotePeer.setLocalDescription(answer)

                    this.socket.emit('message', { to: from, data: { description: answer } })

                }

            } else if (data.candidate) {

                try {
                    remotePeer.addIceCandidate(data.candidate)
                } catch (error) {
                    if (!this.makingOffer) {
                        throw error
                    }
                }

            }

        })
    }

    async join() {
        /* For Listeners */

        //TODO Create QR CODE join
        // Join a host
        this.changeStateTo(this.LISTENER)

        const partyID = document.getElementById('room-input').value

        this.remotePeerConnection = new RTCPeerConnection(this.config)
        window.pc = this.remotePeerConnection
        this.remotePeerConnection.onsignalingstatechange = (e) => {
            if (this.remotePeerConnection.signalingState == 'stable') {
                //TODO This should be Controller with no View
                if (document.getElementById('room-create')) {
                    document.getElementById("room-create").setAttribute("connectionID", partyID)
                    document.getElementById("room-create").setAttribute("state", "connected")
                }

                $room.setAttribute("state", "connected")
            }
            console.log('signalingState:', this.remotePeerConnection.signalingState, '- ConnectionState:', this.remotePeerConnection.connectionState)
        }

        this.remotePeerConnection.onicecandidate = (event) => {
            if (event.candidate && event.candidate.protocol == "tcp") {
                this.socket.emit("message", { to: partyID,  data: { candidate: event.candidate } })
            }
        }

        this.remotePeerConnection.onnegotiationneeded = async () => {
            this.makingOffer = true
            const offer = await this.remotePeerConnection.createOffer()
            await this.remotePeerConnection.setLocalDescription(offer)
            this.socket.emit("message", { to: partyID, data: { description: offer } })
            this.makingOffer = false
        }

        let audioSource = undefined
        this.remotePeerConnection.ontrack = ({ track, streams }) => {
            console.log('onTrack: ', streams[0].active)

            // TODO Make sure you're not recreating streams
            console.log(audioSource, streams)
            if (audioSource == undefined || audioSource.id != streams[0].id) {
                audioSource = PlayerSTATE.audioContext.createMediaStreamSource(streams[0]);
                audioSource.connect(PlayerSTATE.audioContext.destination)
                if (audioSource.start) {
                    audioSource.start()
                }
            }

        }

        this.makingOffer = true
        const offer = await this.remotePeerConnection.createOffer()
        await this.remotePeerConnection.setLocalDescription(offer)
        this.socket.emit('join', { to: partyID, data: { description: offer } })
        this.makingOffer = false

        // prevents the page from refreshing
        return false;
    }

    async create() {
        // Add Listners as they come
        try {
            this.changeStateTo(this.HOST)
            console.log('CREATE A ROOM')
            this.socket.on('listener', async ({ from, description }) => {
                console.log('Got message from', from, description)
                const peerConnection = new RTCPeerConnection(this.config)
                // Link tracks to this guy
                const remoteDestinationNode = PlayerSTATE.addRemoteDestination()
                peerConnection.addStream(remoteDestinationNode.stream)
                console.log(remoteStream)

                // Take care of ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate && event.candidate.protocol == "tcp") {
                        this.socket.emit('message', { to: from, data: { candidate: event.candidate } })
                    }
                }

                peerConnection.onsignalingstatechange = (e) => {
                    console.log('signalingState:', peerConnection.signalingState, 'connectionState: ', peerConnection.connectionState, '- from:', from)
                }

                // on re-negotiations create offer, and send it
                peerConnection.onnegotiationneeded = async () => {
                    console.log(peerConnection.signalingState)
                    this.makingOffer = true
                    const offer = await peerConnection.createOffer()
                    await peerConnection.setLocalDescription(offer)
                    this.socket.emit('message', { to: from, data: { description: offer } })
                    this.makingOffer = false
                }

                // Answer the SDP description offer
                this.listeners[from] = peerConnection
                await peerConnection.setRemoteDescription(description)
                const answer = await peerConnection.createAnswer()
                await peerConnection.setLocalDescription(answer)
                window.pc = peerConnection

                this.socket.emit('message', { to: from,  data: { description: answer } })
            })

            return true

        } catch (e) {
            return false
        }
    }
}

var Party = new Connection(SERVER_ADDRESS)
Party.init()