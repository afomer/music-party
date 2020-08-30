let remoteStream = null
let isPlayerCreated = false
let PlayerObject    = null
let PlayerSTATE = undefined

const $slider = document.getElementById('slider')
const $volume_range = document.getElementById('volume-range')
const $audio_player = document.getElementById('audio-player')
$slider.value = 0
$slider.step = 1
$slider.min = 0
$slider.max = 100
//TODO: The slider should affect the visual of <input type=range />

document.addEventListener("SEEK_TIME_UPDATE", (event) => {

    const currentSeekTime = event.detail.currentSeekTime / 1000
    const duration        = event.detail.duration / 1000

    const currentTimeMinutes = `${(currentSeekTime / 60).toFixed(0)}`
    const currentTimeSeconds = `${(currentSeekTime % 60).toFixed(0)}`

    const timeLeft    = duration - currentSeekTime
    const timeLeftMinutes = `${(timeLeft / 60).toFixed(0)}`
    const timeLeftSeconds = `${(timeLeft % 60).toFixed(0)}`

    document.getElementsByClassName('time_elapsed')[0].datetime  = `PT${currentTimeMinutes}M${currentTimeSeconds}S`
    document.getElementsByClassName('time_elapsed')[0].innerHTML =`${currentTimeMinutes}:${currentTimeSeconds.padStart(2, "0")}`
    document.getElementsByClassName('time_remaining')[0].datetime = `PT$${timeLeftMinutes}M${timeLeftSeconds}S`
    document.getElementsByClassName('time_remaining')[0].innerHTML = `-${timeLeftMinutes}:${timeLeftSeconds.padStart(2, "0")}`

    // Trigger 'input' event so listener, can handle it
    $slider.value = Math.floor((currentSeekTime/duration) * $slider.max)
    $slider.setAttribute("value", Math.floor((currentSeekTime/duration) * $slider.max))

    const eventInput = new Event('input', {
                        bubbles: true,
                        cancelable: true
                    })

    $slider.dispatchEvent(eventInput)
})



// Add songs in a list format
function songElementFn(title, artist, duration) {
    return (`
    <div class="song-card">
        <div style="align-self: center; border-radius: 50%;width: 65px; height: 65px; margin-right: 10px; overflow: hidden;">
            <img style="height: 100%; width: 100%;"/>
        </div>
        <div style="padding: 10px 0px;display: flex; flex: 1; justify-content: space-between; align-items: center; overflow: hidden">

            <div style="width: 90%">
                <div style="font-size: 1.2em; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${title}
                </div>

                <div style="color: rgba(255,255,255,0.45); font-size: 0.8em;font-weight: 100;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${artist}
                </div>
            </div>

            <div style="width: 10%;font-weight: 100;font-size: 0.8em;display: flex; flex-direction: column; justify-content: center; margin: 0px 6px 0 4px; text-align: right;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                ${duration}
            </div>

        </div>
        <div class="queue-btn-container">
            <button class="fas fa-clone fa-md queue-btn">
            </button>
        </div>
    </div>`)
}

function bytesArrToBase64(arr) {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; // base64 alphabet
    const bin = n => n.toString(2).padStart(8,0); // convert num to 8-bit binary string
    const l = arr.length
    let result = '';

    for(let i=0; i<=(l-1)/3; i++) {
        let c1 = i*3+1>=l; // case when "=" is on end
        let c2 = i*3+2>=l; // case when "=" is on end
        let chunk = bin(arr[3*i]) + bin(c1? 0:arr[3*i+1]) + bin(c2? 0:arr[3*i+2]);
        let r = chunk.match(/.{1,6}/g).map((x,j)=> j==3&&c2 ? '=' :(j==2&&c1 ? '=':abc[+('0b'+x)]));
        result += r.join('');
    }

    return result;
}


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

class Player {

    //Player STATES
    PAUSED  = "PAUSED"
    PLAYING = "PLAYING"
    IDLE    = "IDLE"

    constructor() {
        this.state = this.IDLE
        this.playerPromiseChain = Promise.resolve()
        this.audioCtx = new AudioContext()
        this.bufferSource    = undefined
        this.duration        = undefined
        this.interval        = undefined
        this.currentSeekTime = undefined
        this.playlist = []
        this.queue = []
        this.destinations = [this.audioCtx.destination] // always have the speakers as one of the destinations
        this.gains        = [this.audioCtx.createGain()] // a gain for the speaker
    }

    addDestinationNode(destinationNode, bufferSource) {
        const nodeIndex = this.destinations.findIndex(dest => dest == destinationNode)
        const foundNode = nodeIndex != -1

        try {
            const node = foundNode ? this.destinations[nodeIndex] : destinationNode
            const gainNode = foundNode && this.gains.length < nodeIndex ? this.gains[nodeIndex] : this.audioCtx.createGain()
            gainNode.gain.setValueAtTime(Number($volume_range.value), this.audioCtx.currentTime)
            gainNode.connect(node)
            bufferSource.connect(gainNode)
            console.log(foundNode, nodeIndex, '<<<')
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

    calculateSeekTimeFromSlider() {
        return ($slider.value/$slider.max) * this.duration * 1000
    }

    // Play the i-th song from the playlist, by pushing it to the queue
    // then playing the top song from the queue
    async play(idx=undefined) {

        const playFromPlaylist = idx != undefined
        const playFromQueue    = idx == undefined && this.queue.length > 0

        if (!playFromQueue && !playFromPlaylist) {
            console.warn('No Song was played because the queue is empty or playlist ID is invalid')
            return false
        }

        const chosenSong = playFromPlaylist ? this.playlist[idx] : this.playlist[this.queue[0]]
        const mostRecentSong = this.queue.length > 0 ? this.playlist[this.queue[0]] : undefined

        // if the song is not playing already start seek at 0
        // else continue using the last used seek
        this.setDuration(chosenSong.getInfo().duration)
        console.log(chosenSong, mostRecentSong, this.duration, 'currentSeek:', this.currentSeekTime, this.duration <= this.currentSeekTime)
        if (this.state == this.IDLE) {
            this.setSeekTime(0)
        }

        // if you're playing from the playlist, add the song to the top of the queue
        if (playFromPlaylist) {
            this.emptyQueue()
            this.addSongToQueue(idx)
        }

        const audioCtx     = this.getAudioContext()
        const bufferSource = this.getBufferSource()
        const audioArrayBuffer  = await chosenSong.getArrayBufferFromFile()

        this.playerPromiseChain = this.playerPromiseChain
            .then(() => audioCtx.decodeAudioData(audioArrayBuffer))
            .then((audioBuffer) => {
                bufferSource.buffer = audioBuffer
                // flag for never paused
                console.log('seekTime: ', this.currentSeekTime )
                bufferSource.start(0, Math.floor(this.currentSeekTime/1000) )
                this.setSeekTimer()
                document.dispatchEvent(new CustomEvent("PLAY", {bubbles: true}))
                this.state = this.PLAYING
                bufferSource.onended = () => {
                    console.log(this.duration, this.currentSeekTime, this.duration <= this.currentSeekTime)
                    if (this.duration <= Math.floor(this.currentSeekTime/1000) ) {
                       this.state = this.IDLE
                       this.setSeekTime(0)
                       document.dispatchEvent(new CustomEvent("PAUSE", {bubbles: true}))
                    }
                }
            })

        return this.playerPromiseChain
    }

    async stop() {

        this.playerPromiseChain = this.playerPromiseChain.then(() => {
            if (this.bufferSource) {
                this.getBufferSource().stop()
            }
            this.state = this.PAUSED
            this.bufferSource = undefined
            document.dispatchEvent(new CustomEvent("PAUSE", {bubbles: true}))
        })

        return this.playerPromiseChain
    }

    async seek(seekVal=undefined) {

        // if it's already playing stop it
        if (this.bufferSource) {
            await this.stop()
        }

        if (Number(seekVal)) {
            this.setSeekTime(seekVal)
        } else {
            this.setSeekTime(this.calculateSeekTimeFromSlider())
        }

        return this.play()
    }

    addSongToPlaylist(song) {

        if (!(song instanceof Song)) {
            throw Error(`The song is not a Song Class object,
                         please use the song object to play songs`)
        }

        try {
            this.playlist.push(song)
            return this.playlist.length - 1
        } catch (error) {
            console.error(error)
            return -1
        }

    }

    emptyQueue() {
        this.queue = []
    }

    removeFromQueue() {
        return this.queue.pop()
    }

    addSongToQueue(idx) {

        if (idx < 0 || idx >= this.playlist.length) {
            console.error('Invalid Song Playlist ID/Number')
            return false
        }

        try {
            this.queue.push(idx)

            const title = this.playlist[idx].title
            const album = this.playlist[idx].album
            const artist = this.playlist[idx].artist
            const duration = this.playlist[idx].duration
            const img = this.playlist[idx].img
            const durationFormatted = `${(duration / 60).toFixed(0)}:${(duration % 60).toFixed(0).padStart(2, "0")}`
            const albumFormatted  = (album && `• ${album}`) || ''
            const artistFormatted = artist && (`${artist} ${albumFormatted}`) || ''

            const div = document.createElement('div')
            div.innerHTML = songElementFn(title, artistFormatted, durationFormatted).trim()
            const songCard = div.firstChild
            songCard.getElementsByTagName('img')[0].src = img

            songCard.onclick = () => {
                document.getElementById('song-img').src = img
                document.getElementById('song-title').textContent  = title
                document.getElementById('song-artist').textContent = artistFormatted
                PlayerObject.play(songIdx)
                // Add duration to audio tag
                $audio_player.setAttribute("duration", duration)
            }

            // Add the song to UI
            document.getElementById('queue').appendChild(songCard)

            return true
        } catch (error) {
            console.error(error)
            return false
        }

    }

    changeVolume(volume) {
        console.log(volume, this.gains)
        for (let gainNode of this.gains) {
            gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime)
        }
    }

    getPlaylist() {
        return this.playlist
    }

    getQueue() {
        return this.queue
    }

    getAudioContext() {
        return this.audioCtx
    }

    getBufferSource() {

        if (this.bufferSource == undefined) {
            this.bufferSource = this.audioCtx.createBufferSource()
        }

        for (const dest of this.destinations) {
            this.addDestinationNode(dest, this.bufferSource)
        }

        return this.bufferSource
    }

    setDuration(duration) {
        this.duration = duration
    }

    resetSeekTime(seekTime) {
        this.currentSeekTime = undefined
    }

    setSeekTime(seekTime) {
        this.currentSeekTime = seekTime
        const event = new CustomEvent("SEEK_TIME_UPDATE", {
            bubbles: true,
            detail: {
                currentSeekTime: this.currentSeekTime,
                duration: this.duration
            }
        })

        document.dispatchEvent(event);
    }

// TODO how to pause naturally and start from beginning
    setSeekTimer(currentTime) {
        const intervalInMilliseconds = 500
        const duration               = this.duration * 1000 // Seconds => Milliseconds
        this.interval = setInterval(() => {

          if (this.state == this.IDLE || this.state == this.PAUSED) {
                clearInterval(this.interval)
          }
          else if (this.currentSeekTime + intervalInMilliseconds > duration ) {
                //Once the whole song is consumed stop the interval timer
                this.setSeekTime(duration)
            } else {
                this.setSeekTime(this.currentSeekTime + intervalInMilliseconds)
            }

        }, intervalInMilliseconds)
    }

}

async function getAudioFileDuration(file) {
    /* Getting audio duration */
    const $tmpAudio = document.createElement('audio')
    $tmpAudio.setAttribute('preload', 'metadata')

    return new Promise((resolve, reject) => {

        $tmpAudio.onloadedmetadata = () => {
            resolve(Math.floor($tmpAudio.duration))
        }

        $tmpAudio.src = URL.createObjectURL(file)
    })

}

const DEFAULT_PIC = 'https://upload.wikimedia.org/wikipedia/en/e/e6/AllAmerikkkanBadass.jpg'

async function getMetadata(file) {
    return new Promise((resolve, reject) => {
        jsmediatags.read(file, {
            'onSuccess': ({ tags }) => resolve(tags),
            'onFailure': (error) => reject(error)
        })
    })
}


async function handleAudioFile(file) {

    PlayerSTATE = PlayerSTATE ? PlayerSTATE : new PlayerFSM()
    window.PlayerSTATE

    const tags = await getMetadata(file)

    const title  = tags['title'] || file['name']
    const duration = await getAudioFileDuration(file)

    const img    = tags['picture']?.['data'] ?  "data:image/png;base64," + bytesArrToBase64(tags['picture']?.['data']) : DEFAULT_PIC
    const artist = tags['artist']
    const album  = tags['album']
    const songObject = new Song(file, title, duration, artist, img)

    const songIdx = PlayerSTATE.addSongToPlaylist(songObject)

    const durationFormatted = `${(duration / 60).toFixed(0)}:${(duration % 60).toFixed(0).padStart(2, "0")}`
    const albumFormatted  = (album && `• ${album}`) || ''
    const artistFormatted = artist && (`${artist} ${albumFormatted}`) || ''

    /* Create Song Card */
    const div = document.createElement('div')
    div.innerHTML = songElementFn(title, artistFormatted, durationFormatted).trim()
    const songCard = div.firstChild
    songCard.getElementsByTagName('img')[0].src = img

    songCard.onclick = () => {
        document.getElementById('song-img').src = img
        document.getElementById('song-title').textContent  = title
        document.getElementById('song-artist').textContent = artistFormatted

        PlayerSTATE.play(songIdx)
        // Add duration to audio tag
        $audio_player.setAttribute("duration", duration)
    }

    // Add the song to UI
    document.getElementById('playlist').appendChild(songCard)
}


function activateAddSongButton() {
    const inputFileElement = document.createElement('input')
    document.getElementById('add-song').onclick = () => {
        inputFileElement.setAttribute('multiple', '')
        inputFileElement.setAttribute('type', 'file')
        inputFileElement.click()

        if (!isPlayerCreated) {
            // connecting to speakers happens inside
            PlayerObject = new Player()
        }

    }

    inputFileElement.oninput = (e) => {
        // Add all selected files to the array list
        for (const file of e.target.files) {
            if (file.type.match("audio*")) {
                handleAudioFile(file)
            } else {
                // TODO: show a notification of not showing
            }
        }
    }
}

const pauseStyle = 'fas fa-pause fa-3x'
const playStyle  = 'fas fa-play fa-3x'

const changePlayButtonUI = ({ isPlaying, buttonStyle }) => {
    document.getElementById('play-button').setAttribute('playing', isPlaying)
    document.getElementById('play-button').firstElementChild.setAttribute('class', buttonStyle)
}

const playAudio = () => {
    changePlayButtonUI({ isPlaying: true, buttonStyle: playStyle })
    return PlayerSTATE.play()
}

const pauseAudio = () => {
    changePlayButtonUI({ isPlaying: false, buttonStyle: pauseStyle })
    return PlayerSTATE.pause() // Web Audio API has only play/stop
}

function activatePlayButton() {

    let playPromise = undefined

    document.getElementById('play-button').onclick = (e) => {
        const isPlaying  = document.getElementById('play-button').getAttribute('playing') || false
        const togglePlayButton = isPlaying == "true" ? pauseAudio : playAudio

        if (playPromise !== undefined) {
            playPromise = playPromise.then(togglePlayButton)
        } else {
            playPromise = togglePlayButton()
        }

    }

    document.addEventListener("PAUSE", (e) => {
        changePlayButtonUI({ isPlaying: false, buttonStyle: playStyle })
    })

    document.addEventListener("PLAY", (e) => {
        changePlayButtonUI({ isPlaying: true, buttonStyle: pauseStyle })
    })
}

const activateVolumeSlider = () => {
    // Set up initial value
    $volume_range.value = document.getElementById('audio-player').volume
    $volume_range.style['background-size'] = `${(($volume_range.value - $volume_range.min) * 100 / ($volume_range.max - $volume_range.min))}% 100%`

    // When slider change => change audio player volume
    document.getElementById('volume-range').oninput = (e) => {
        const $audio_player = document.getElementById('audio-player')
        const volumeRangeValue = e.target.value
        $audio_player.volume = volumeRangeValue
    }
}

/*
*
* Main Function Call
*
*/

// Make the Add Song, and the Play buttons functional
activateAddSongButton()
activatePlayButton()
activateVolumeSlider()
document.getElementById("room-input-form").onsubmit = (e) => {
    e.preventDefault()
    joinAhost()
    return false;
}
document.getElementById('room-create').onclick = (e) => {
    if ( createRoom() ) {
        document.getElementById("party-title").textContent = `You're the host of Party: ${ID}`
    }
    e.preventDefault()
    return false;
}
const unconnected_TEXT = "Start a Party 🎉"
const connected_TEXT = "Leave the Party"

$room_create = document.getElementById('room-create')

const observer = new MutationObserver(() => {
    console.log('state')
    alert('CLICKED')
    const $room = document.getElementById('room-create')
    if ($room.getAttribute("state") == "connected"){
        $room.className = 'button-style-leave'
        $room.textContent = connected_TEXT
    } else if ($room.getAttribute("state") == "unconnected") {
        $room.className = 'button-style'
        $room.textContent = unconnected_TEXT
    }
})

observer.observe($room_create, {
    attributes: true,
    attributeFilter: ['state'],
    characterData: false
})

// Take care of progressing the bar
const updateSlider =  (e) => {
    const rangeMin = e.target.min
    const rangeMax = e.target.max
    const value = e.target.value
    e.target.style['background-size'] = `${((value - rangeMin) * 100 / (rangeMax - rangeMin))}% 100%`
}

// Visually update the slider immedietly when its value changes
$slider.addEventListener('input', updateSlider)
$volume_range.addEventListener('input', updateSlider)

function calculateSeekTimeFromSlider() {
    return ($slider.value/$slider.max)
}

// Once the change happens, update the logic
$slider.addEventListener('change', (e) => {
    updateSlider(e)
    PlayerSTATE.seek(calculateSeekTimeFromSlider())
})
$volume_range.addEventListener('change', (e) => {
    updateSlider(e)
    const volumeValue = Number(e.target.value)
    if (PlayerSTATE) {
        PlayerSTATE.changeVolume(volumeValue)
    }
})