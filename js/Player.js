
class PlayerFSM {

    /* STATES and Transitions for Finite State Machine */
    STATES = {
        IDLE: "IDLE",
        PLAYING: "PLAYING",
        PAUSED: "STOPPED"
    }

    TRANSITIONS = {
        PLAY: "PLAY",
        PAUSE: "PAUSE",
        STOP: "STOP",
        SEEK: "SEEK"
    }
    /* *** */

    // The events For event Listeners
    EVENT_TYPES = {
        PLAY: "PLAY",
        PAUSE: "PAUSE",
        SEEK_TIME_UPDATE: "SEEK_TIME_UPDATE"
    }

    constructor() {
        this.audioContext = new AudioContext()
        this.state = this.STATES.IDLE
        this.bufferSource = undefined
        this.currentSeekTimeInterval = undefined
        this.currentSeekTime = 0
        this.duration     = 0
        this.playlist     = []
        this.chosenSong   = undefined
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
        }

        console.error('Transition Not Possible', `[State: ${this.state}] [Transition: ${transition}]`)
        return false
    }

    async play(idx) {
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

    async handlePlay(idx=undefined) {

        if (idx != undefined && this.playlist[idx]) {
            this.chosenSong = this.playlist[idx]
        }

        this.bufferSource = this.audioContext.createBufferSource()
        this.bufferSource.connect(this.audioContext.destination) // temporary for testing
        const audioArrayBuffer  = await this.chosenSong.getArrayBufferFromFile()

        return this.audioContext.decodeAudioData(audioArrayBuffer)
               .then((audioBuffer) => {
                    this.bufferSource.buffer = audioBuffer
                    this.duration = this.chosenSong.getInfo().duration * 1000
                    this.bufferSource.start(0, Math.floor(this.currentSeekTime/1000))
                    this.setIntervalTimer()
                })
    }

    async handleStop() {
        this.currentSeekTime = 0
        if (this.bufferSource) {
            this.bufferSource.stop(0)
        }
        this.chosenSong = undefined
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
