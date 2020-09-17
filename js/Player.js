var AudioContext = AudioContext || window.AudioContext || window.webkitAudioContext

class Song {

    constructor(file="", title="", duration="", artist="", img="") {
        this.file = file
        this.title = title
        this.duration = duration
        this.artist = artist
        this.img = img
    }

    getInfo() {
        return {
            file: this.file,
            title: this.title,
            duration: this.duration,
            artist: this.artist,
            img: this.img
        }
    }

    getArrayBufferFromFile() {

        return new Promise((resolve, reject) => {

            const reader = new FileReader()

            reader.onload = () => {
                resolve(reader.result)
            }

            reader.readAsArrayBuffer(this.file)
        })
    }

}

class PlayerFSM {

    constructor() {
        /* STATES and Transitions for Finite State Machine */
        this.STATES = {
            IDLE: "IDLE",
            PLAYING: "PLAYING",
            PAUSED: "STOPPED"
        }

        this.TRANSITIONS = {
            PLAY: "PLAY",
            PAUSE: "PAUSE",
            STOP: "STOP",
            SEEK: "SEEK"
        }
        /* *** */

        // The events For event Listeners
        this.EVENT_TYPES = {
            PLAY: "PLAY",
            PAUSE: "PAUSE",
            SEEK_TIME_UPDATE: "SEEK_TIME_UPDATE"
        }

        this.audioContext = new AudioContext()
        this.state = this.STATES.IDLE
        this.bufferSource = undefined
        this.currentSeekTimeInterval = undefined
        this.currentSeekTime = 0
        this.duration     = 0
        this.playlist     = []
        this.destinations = [this.audioContext.destination]
        this.gains        = [this.audioContext.createGain()]
        this.currentSong   = undefined
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

    addSongToPlaylist(song) {
        this.playlist.push(song)
        return this.playlist.length - 1
    }

    // Possible transitions based on state
    // Based on Finite State Automata of STATES and TRANSITIONS
    async transitionState(transition, ...args) {

        console.log('Transition ', `[State: ${this.state}] [Transition: ${transition}]`)

        switch (this.state) {
            case this.STATES.IDLE:
                if (transition == this.TRANSITIONS.PLAY) {
                    await this.handlePlay(...args)
                    this.state = this.STATES.PLAYING
                    // dispatch play event for listeners
                    this.dispatchEventForListeners(this.EVENT_TYPES.PLAY)
                    return true
                }

                break;

            case this.STATES.PLAYING:

                if (transition == this.TRANSITIONS.SEEK) {
                    await this.handleSeek(...args)
                    return true
                } else if (transition == this.TRANSITIONS.PAUSE) {
                    await this.handlePause(...args)
                    this.state = this.STATES.PAUSED
                    // Dispatch Pause Event
                    this.dispatchEventForListeners(this.EVENT_TYPES.PAUSE)

                    return true
                } else if (transition == this.TRANSITIONS.STOP) {
                    await this.handleStop(...args)
                    this.state = this.STATES.PAUSED
                    return true
                }

                break;

            case this.STATES.PAUSED:
                if (transition == this.TRANSITIONS.PLAY) {
                    await this.handlePlay(...args)
                    this.state = this.STATES.PLAYING
                    // dispatch play event for listeners
                    this.dispatchEventForListeners(this.EVENT_TYPES.PLAY)
                    return true
                } else if (transition == this.TRANSITIONS.SEEK) {
                    await this.handleSeek(...args)
                    return true
                }

                break;
        }

        console.error('Transition Not Possible', `[State: ${this.state}] [Transition: ${transition}]`)
        return false
    }

    async play(idx) {

        // If a song is playing:
        // 1- Stop the current song
        // 2- Then play the new song (even if it's the same song)
        if (idx != undefined && this.state == this.STATES.PLAYING) {
            await this.transitionState(this.TRANSITIONS.STOP)
        }

        return this.transitionState(this.TRANSITIONS.PLAY, idx)
    }

    async seek(seekTimeInSeconds) {
        return this.transitionState(this.TRANSITIONS.SEEK, seekTimeInSeconds)
    }

    async pause() {
        return this.transitionState(this.TRANSITIONS.PAUSE)
    }

    async stop() {
        return this.transitionState(this.TRANSITIONS.STOP)
    }


    calculateSeekTimeFromSlider() {
        return ($slider.value/$slider.max) * this.duration * 1000
    }

    setIntervalTimer() {
        const intervalAmountInms = 200
        this.currentSeekTimeInterval = setInterval(async () => {
            const newTime = this.currentSeekTime + intervalAmountInms
            if (newTime <= this.duration) {
                this.currentSeekTime = newTime
            } else {
                // Once the end is reached, pause the music and seek to 0
                await this.transitionState(this.TRANSITIONS.PAUSE)
                await this.transitionState(this.TRANSITIONS.SEEK, 0)
            }

            this.dispatchEventForListeners(this.EVENT_TYPES.SEEK_TIME_UPDATE, {
                currentSeekTime: this.currentSeekTime,
                duration: this.duration
            })

        }, intervalAmountInms)
    }

    addDestinationNode(destinationNode, bufferSource) {
        const nodeIndex = this.destinations.findIndex(dest => dest == destinationNode)
        const foundNode = nodeIndex != -1

        try {
            const node = foundNode ? this.destinations[nodeIndex] : destinationNode
            const gainNode = foundNode && this.gains.length < nodeIndex ? this.gains[nodeIndex] : this.audioContext.createGain()

            // The following line should be refactored
            gainNode.gain.setValueAtTime(Number($volume_range.value), this.audioContext.currentTime)
            gainNode.connect(node)
            bufferSource.connect(gainNode)

            // if it's a newly created gain, add it to the gains array
            if (!foundNode || this.gains.length >= nodeIndex) {
                this.gains.push(gainNode)
            }

            return true
        } catch(error) {
            console.error(error)
            return false
        }
    }

    handleDestinations(bufferSource, destinations) {
        for (const dest of destinations) {
            this.addDestinationNode(dest, bufferSource)
        }
    }

    changeVolume(volume) {
        for (let gainNode of this.gains) {
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime)
        }
    }

    addRemoteDestination() {
        const remoteNode = this.audioContext.createMediaStreamDestination()
        this.destinations.push(remoteNode)
        this.gains.push(this.audioContext.createGain())
        return remoteNode
    }

    async handlePlay(idx=undefined) {

        // Valid song ID from the playlist
        if (idx != undefined && this.playlist[idx]) {
            this.currentSong = this.playlist[idx]
        }

        this.bufferSource = this.audioContext.createBufferSource()

        this.handleDestinations(this.bufferSource, this.destinations)

        const audioArrayBuffer  = await this.currentSong.getArrayBufferFromFile()

        return this.audioContext.decodeAudioData(audioArrayBuffer)
               .then((audioBuffer) => {
                    this.bufferSource.buffer = audioBuffer
                    this.duration = this.currentSong.getInfo().duration * 1000
                    this.bufferSource.start(0, Math.floor(this.currentSeekTime/1000))
                    this.setIntervalTimer()
                    return audioBuffer
                })
    }

    async handleStop() {
        this.currentSeekTime = 0
        if (this.bufferSource) {
            this.bufferSource.stop(0)
        }
        this.currentSong = undefined
        clearInterval(this.currentSeekTimeInterval)
    }

    async handlePause() {
        this.bufferSource.stop(0)
        clearInterval(this.currentSeekTimeInterval)
    }

    async handleSeek(precentageOfDuration) {
        // If it's playing, stop the source, store the new time, and play it again (using the new time)
        if (this.state == this.STATES.PLAYING) {
            this.handlePause()
        }

        const newTimeInMilliseconds = precentageOfDuration * this.duration
        this.currentSeekTime = newTimeInMilliseconds

        if (this.state == this.STATES.PLAYING) {
            await this.handlePlay()
        }

    }

}
