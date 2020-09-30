"use strict"

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
        this.dataChannel = null
        this.isDataChannelOpen = false
        this.socket = io(server_address)
        this.makingOffer  = false
        this.ignoreOffer = false
        this.remotePeerConnection = null
        this.ID       = null
        this.LISTENER = "LISTENER"
        this.HOST = "HOST"
        this.IDLE = "IDLE"

        // The events For event Listeners
        this.EVENT_TYPES = {
            STATE_CHANGE: "STATE_CHANGE",
        }

        this.STATES = Object.freeze({ IDLE: "IDLE", LISTENER: "LISTENER", HOST: "HOST" })
        this.CURRENT_STATE = this.STATES.IDLE
    }

    async transitionToState(newSTATE, ...args) {

        console.log(this.CURRENT_STATE, newSTATE)

        switch(newSTATE) {
            case this.STATES.LISTENER:

                if (this.CURRENT_STATE == this.STATES.IDLE) {
                    await this.handle_join(...args)
                    this.CURRENT_STATE = this.STATES.LISTENER
                } else {
                    throw new Error(`illegal transition from ${this.CURRENT_STATE} to ${newSTATE}`)
                }

                break;

            case this.STATES.HOST:

                if (this.CURRENT_STATE == this.STATES.IDLE) {
                    await this.handle_create()
                    this.listeners = {}
                    this.CURRENT_STATE = this.STATES.HOST
                } else {
                    throw new Error(`illegal transition from ${this.CURRENT_STATE} to ${newSTATE}`)
                }
                break;

            case this.STATES.IDLE:

                if (this.CURRENT_STATE != "IDLE") {
                    throw new Error('illegal transition from', this.CURRENT_STATE, 'to', newSTATE)
                } else {
                    if (this.listeners && typeof this.listeners == "object") {
                        for (const i in this.listeners) {
                            this.listeners[i].pc.close()
                        }
                    }
                    this.listeners = {}
                    this.socket.off("listener")
                    this.remotePeerConnection = null
                }
                break;
        }

        this.dispatchEventForListeners(this.EVENT_TYPES.STATE_CHANGE, { STATE: this.CURRENT_STATE })
    }

    dispatchEventForListeners(event, detail) {

        if (this.EVENT_TYPES[event]) {
            document.dispatchEvent(
                new CustomEvent(this.EVENT_TYPES[event],
                    {
                        bubbles: true,
                        detail
                    }
                )
            )

            return true
        }

        console.warn('Unkown event type:', event)
        return false
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

        this.socket.on("connect_error", console.error)
        this.socket.on("connect_fail", console.error)

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

    async handle_join(partyID) {
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
            if (event.candidate) {
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

        this.dataChannel = this.remotePeerConnection.createDataChannel("datach", { reliable: true })
        this.dataChannel.addEventListener("open", event => {
            this.isDataChannelOpen = true
            console.log({ isDataChannelOpen : this.isDataChannelOpen})
        })
        this.dataChannel.addEventListener("close", event => {
            this.isDataChannelOpen = false
            console.log({isDataChannelOpen: this.isDataChannelOpen})
        })

        let audioSource = undefined
        this.dataChannel.onmessage = ({ data }) => {
            console.log('message: ', data)

            if (data instanceof ArrayBuffer) {
                    const chunk = readArrayBufferChunk(data)
                    audioSource = audioSource || []
                    audioSource.push(chunk.data)

                    if (chunk.chunkID == chunk.chunkTotal) {
                        let bufferSize = audioSource.reduce((y, x) => {
                            return y + x.byteLength
                        }, 0)

                        let audioBuffer = new Uint8Array(bufferSize)

                        let accumaltor = 0
                        console.log(audioSource[0], audioSource.byteLength)
                        for (const i in audioSource) {
                            accumaltor += i == 0 ? 0 : audioSource[i-1].byteLength
                            audioBuffer.set(new Uint8Array(audioSource[i]), accumaltor)
                        }

                        PlayerSTATE.audioContext.decodeAudioData(audioBuffer.buffer, (buffer) => {
                            console.log('buffer: ', buffer)
                            audioSource = PlayerSTATE.audioContext.createBufferSource();
                            audioSource.buffer = buffer
                            audioSource.connect(PlayerSTATE.audioContext.destination)
                            audioSource.start()
                        })
                    }
                }
        }

        this.makingOffer = true
        const offer = await this.remotePeerConnection.createOffer()
        await this.remotePeerConnection.setLocalDescription(offer)
        this.socket.emit('join', { to: partyID, data: { description: offer } })
        this.makingOffer = false

        return true
    }

    async join(partyID) {
        /* For Listeners */

        //TODO Create QR CODE join
        // Join a host
        this.transitionToState(this.STATES.LISTENER, partyID)

        // prevents the page from refreshing
        return false;
    }

    hasID() {
        console.log(Number(this.ID), this.ID != undefined, Number.isFinite(Number(this.ID)))
        return this.ID != undefined && Number.isFinite(Number(this.ID))
    }

    async leave() {
        if (this.listeners != undefined) {
            for (const i in this.listeners) {
                this.listeners[i].close()
            }
        }

        if (this.remotePeerConnection != undefined) {
            this.remotePeerConnection.close()
        }

    }

    async handle_create() {
        return new Promise((resolve, reject) => {
                this.socket.on('listener', async ({ from, description }) => {
                    console.log('Got message from', from, description)
                    const peerConnection = new RTCPeerConnection(this.config)
                    peerConnection.ondatachannel = ({ channel }) => {
                        this.dataChannel = channel
                        this.dataChannel.onopen = () => {
                            this.isDataChannelOpen = true
                            console.log({isDataChannelOpen: this.isDataChannelOpen})
                        }
                        this.dataChannel.onclose = () => {
                            this.isDataChannelOpen = false
                            console.log({isDataChannelOpen: this.isDataChannelOpen})
                        }
                        this.dataChannel.onerror = console.log
                    }

                // Take care of ICE candidates
                peerConnection.onicecandidate = (event) => {
                    // use datachannels instead of adding streams ?!
                    if (event.candidate) {
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
            resolve()
        })
    }

    async create() {
        // Add Listners as they come
        try {
            console.log('HasID', !this.hasID())

            if (!this.hasID()) {
                console.log('????')
                return false
            }

            console.log('CREATE A ROOM', await this.transitionToState(this.STATES.HOST))

            return true

        } catch (e) {
            return false
        }
    }
}

const Party = new Connection(SERVER_ADDRESS)
Party.init()
