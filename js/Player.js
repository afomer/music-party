
class PlayerFSM {

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

    addSongToPlaylist(song) {
        this.playlist.push(song)
        return this.playlist.length - 1
    }

    // Possible transitions based on state
    // Based on Finite State Automata of STATES and TRANSITIONS
    async transitionState(transition, ...args) {

        switch (this.state) {
            case this.STATES.IDLE:
                if (transition == this.TRANSITIONS.PLAY) {
                    await this.handlePlay(...args)
                    this.state = this.STATES.PLAYING
                    return true
                }

            case this.STATES.PLAYING:
                if (transition == this.TRANSITIONS.SEEK) {
                    this.handleSeek(...args)
                    return true
                } else if (transition == this.TRANSITIONS.PAUSE) {
                    this.handlePause(...args)
                    this.state = this.STATES.PAUSED
                    return true
                } else if (transition == this.TRANSITIONS.STOP) {
                    this.handleStop(...args)
                    this.state = this.STATES.PAUSED
                    return true
                }

            case this.STATES.PAUSED:
                if (transition == this.TRANSITIONS.PLAY) {
                    await this.handlePlay(...args)
                    this.state = this.STATES.PLAYING
                    return true
                } else if (transition == this.TRANSITIONS.SEEK) {
                    this.handleSeek(...args)
                    return true
                }
        }

        console.error('Transition Not Possible', `[State: ${this.state}] [Transition: ${transition}]`)
        return false
    }

    play(idx) {
        console.log('idx: ', idx)
        this.transitionState(this.TRANSITIONS.PLAY, idx)
    }

    seek(seekTimeInSeconds) {
        this.transitionState(this.TRANSITIONS.SEEK, seekTimeInSeconds)
    }

    pause() {
        this.transitionState(this.TRANSITIONS.PAUSE)
    }

    stop() {
        this.transitionState(this.TRANSITIONS.STOP)
    }


    calculateSeekTimeFromSlider() {
        return ($slider.value/$slider.max) * this.duration * 1000
    }

    setIntervalTimer() {
        const intervalAmountInms = 200
        this.currentSeekTimeInterval = setInterval(() => {
            const newTime = this.currentSeekTime + intervalAmountInms
            if (newTime <= this.duration) {
                this.currentSeekTime = newTime
            } else {
                // Once the end is reached, pause the music and seek to 0
                this.transitionState(this.TRANSITIONS.PAUSE)
                this.transitionState(this.TRANSITIONS.SEEK, 0)
            }

            document.dispatchEvent(new CustomEvent("seekTimeUpdate", {
                bubbles: true,
                detail: {
                    currentSeekTime: this.currentSeekTime,
                    duration: this.duration
                }
            }))
        }, intervalAmountInms)
    }

    async handlePlay(idx=undefined) {
        console.log('>>> idx: ', idx)

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
                    document.dispatchEvent(new CustomEvent("play", {bubbles: true}))
                })
    }

    handleStop() {
        this.currentSeekTime = 0
        if (this.bufferSource) {
            this.bufferSource.stop(0)
        }
        this.chosenSong = undefined
        clearInterval(this.currentSeekTimeInterval)
    }

    handlePause() {
        this.bufferSource.stop(0)
        clearInterval(this.currentSeekTimeInterval)
        document.dispatchEvent(new CustomEvent("pause", {bubbles: true}))
    }

    handleSeek(precentageOfDuration) {
        // If it's playing, stop the source, store the new time, and play it again (using the new time)
        if (this.state == this.STATES.PLAYING) {
            this.handlePause()
        }

        const newTimeInMilliseconds = precentageOfDuration * this.duration
        this.currentSeekTime = newTimeInMilliseconds

        if (this.state == this.STATES.PLAYING) {
            this.handlePlay()
        }

    }

}
